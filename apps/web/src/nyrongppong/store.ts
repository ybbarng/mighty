import type { PresetDeal } from "@mighty/hwatu";
import { nyrongppongBotFor } from "@mighty/nyrongppong-ai";
import type {
  Action,
  GameEvent,
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
} from "@mighty/nyrongppong-engine";
import { create } from "zustand";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";

import { nyrongppongKit } from "./kit";

export type NyrongppongLocalMatch = LocalMatch<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  PresetDeal
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type NyrongppongHost = MatchHost<NyrongppongView, Action, GameEvent> & {
  drain(): Snapshot<NyrongppongView, GameEvent>[];
};

export type NyrongppongSaved = SavedMatch<
  NyrongppongRules,
  Action,
  PresetDeal
> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/**
 * 컴퓨터가 한 번 행동하기 전에 기다리는 시간. 화면에서 늦추지 않고 대국 진행 자체를 늦춘다.
 * 뽕 응답 창은 버린 순간부터 재므로, 화면만 늦추면 내 응답 시간이 그만큼 줄기 때문이다
 */
export const BOT_PACE_MS = 450;

/** 컴퓨터 행동 사이를 늦춘다(브라우저가 그림을 그리고 입력을 받는다) */
function botPace(next: () => void): void {
  setTimeout(next, BOT_PACE_MS);
}

const SAVE_KEY = "nyrongppong-save";

function saveNyrongppong(saved: NyrongppongSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadNyrongppong(): NyrongppongSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as NyrongppongSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearNyrongppong(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 무르기로 되돌리는 내 행동: 버리기·약·스톱·가져오기 */
const isTurn = (action: Action) =>
  action.type === "discard" ||
  action.type === "declare" ||
  action.type === "stop" ||
  action.type === "draw";

interface NyrongppongStore {
  host: NyrongppongHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: NyrongppongLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: NyrongppongView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  /** 지금 화면을 받은 시각(ms, Date.now). 뽕 응답 창의 남은 시간을 세는 기준 */
  viewAt: number;
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  newGame(options: {
    rules: NyrongppongRules;
    level: number;
    seed?: number;
  }): void;
  resume(saved: NyrongppongSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 한다(나는 0번 자리) */
  startPractice(initialState: NyrongppongState): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: NyrongppongHost,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 행동(과 그 뒤 컴퓨터 행동)을 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

/** 사건에 맞춰 소리를 낸다: 카드 버리기·가져오기, 뽕, 판 끝 */
function cuesFor(events: readonly GameEvent[], me: number): void {
  for (const e of events) {
    if (e.type === "roundStarted") playUiCue("deal");
    if (e.type === "discarded") playUiCue("hwatuSlap");
    if (e.type === "drew" && e.seat === me) playUiCue("hwatuFlip");
    if (e.type === "ppong") playUiCue("ppong");
    if (e.type === "stopped") playUiCue("cardSet");
    if (e.type === "declared") playUiCue("yak");
    if (e.type === "roundEnded") {
      const scores = e.result.scores;
      const best = Math.min(...scores);
      playUiCue(scores[me] === best ? "win" : "lose");
    }
  }
}

let unsubscribe: (() => void) | null = null;

function stop(): void {
  unsubscribe?.();
  unsubscribe = null;
}

export const useNyrongppong = create<NyrongppongStore>((set, get) => {
  const attach = (
    host: NyrongppongHost,
    options: {
      local: NyrongppongLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      /** 없으면 내 기록에 남기지 않는다(튜토리얼) */
      stats: StatsTarget | null;
      archive?: ArchiveTarget;
    },
  ) => {
    stop();
    const { local, level } = options;
    const recorder = options.stats
      ? new StatsRecorder(nyrongppongKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(nyrongppongKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice) saveNyrongppong({ ...local.save(), level });
    };
    const first = host.drain();
    set({
      host,
      local,
      level,
      seatNames: options.seatNames,
      reconnecting: false,
      hostLeft: false,
      offlineSeats: [],
      view: host.current(),
      events: first.flatMap((s) => s.events),
      viewAt: Date.now(),
      notice: null,
      practice,
    });
    persist();
    for (const snapshot of first) {
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
      set({
        view: snapshot.view,
        events: snapshot.events,
        viewAt: Date.now(),
      });
      cuesFor(snapshot.events, host.seat);
    });
  };

  const newLocal = (
    rules: NyrongppongRules,
    seed: number,
    level: number,
    log?: NyrongppongSaved["log"],
  ): NyrongppongLocalMatch =>
    new LocalMatch(
      {
        kit: nyrongppongKit,
        rules,
        seed,
        humanSeat: 0,
        bot: nyrongppongBotFor(level),
        pace: botPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (
    local: NyrongppongLocalMatch,
    level: number,
    seed: number,
  ) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "nyrongppong", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "nyrongppong",
        mode: "solo",
        key: `solo:${seed}`,
        seat: local.seat,
        seatNames: null,
        source: () => {
          const saved = local.save();
          return { rules: saved.rules, seed: saved.seed, log: saved.log };
        },
      },
    });

  return {
    host: null,
    local: null,
    seatNames: null,
    reconnecting: false,
    hostLeft: false,
    offlineSeats: [],
    view: null,
    events: [],
    viewAt: 0,
    level: 0,
    notice: null,
    practice: false,

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "nyrongppong", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      attachLocal(newLocal(rules, seed, level), level, seed);
    },

    resume(saved) {
      attachLocal(
        newLocal(saved.rules, saved.seed, saved.level, saved.log),
        saved.level,
        saved.seed,
      );
    },

    startPractice(initialState) {
      const local: NyrongppongLocalMatch = new LocalMatch({
        kit: nyrongppongKit,
        rules: initialState.rules,
        seed: 1,
        humanSeat: 0,
        bot: nyrongppongBotFor(0),
        pace: botPace,
        initialState,
      });
      attach(local, { local, level: 0, seatNames: null, stats: null });
    },

    attachOnline(host, seatNames, stats, archive) {
      attach(host, {
        local: null,
        level: get().level,
        seatNames,
        stats,
        ...(archive ? { archive } : {}),
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없다" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view } = get();
      // 튜토리얼 장면은 기록으로 다시 만들 수 없어 무르지 않는다.
      if (!local || !view || get().practice) return false;
      if (view.phase !== "discard" && view.phase !== "draw") return false;
      return local
        .actionLog()
        .some((entry) => entry.seat === local.seat && isTurn(entry.action));
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 행동까지 잘라 낸다(그 뒤 컴퓨터 행동도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && isTurn(last.action)) break;
      }
      attachLocal(
        newLocal(saved.rules, saved.seed, level, log),
        level,
        saved.seed,
      );
      return true;
    },

    leave() {
      stop();
      set({
        host: null,
        local: null,
        seatNames: null,
        view: null,
        events: [],
        reconnecting: false,
        hostLeft: false,
        offlineSeats: [],
        practice: false,
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
