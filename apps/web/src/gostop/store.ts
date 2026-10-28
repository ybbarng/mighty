import { gostopBotFor } from "@mighty/gostop-ai";
import type {
  Action,
  GameEvent,
  GostopRules,
  GostopState,
  GostopView,
} from "@mighty/gostop-engine";
import type { PresetDeal } from "@mighty/hwatu";
import { create } from "zustand";

import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";

import { gostopCues } from "./cues";
import { gostopKit } from "./kit";

export type GostopLocalMatch = LocalMatch<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type GostopHost = MatchHost<GostopView, Action, GameEvent> & {
  drain(): Snapshot<GostopView, GameEvent>[];
};

export type GostopSaved = SavedMatch<GostopRules, Action, PresetDeal> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/** 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 보인다(무엇을 냈는지 보이게) */
const BOT_DELAY_MS = 600;

const SAVE_KEY = "gostop-save";

function saveGostop(saved: GostopSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadGostop(): GostopSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GostopSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearGostop(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 무르기로 되돌리는 내 행동: 카드 내기·폭탄·뒤집기 */
const isTurn = (action: Action) =>
  action.type === "play" || action.type === "bomb" || action.type === "flip";

/** 남이 한 일이라 잠깐 보여 줄 사건 */
function byOther(events: readonly GameEvent[], me: number): boolean {
  return events.some(
    (e) =>
      (e.type === "played" ||
        e.type === "bombed" ||
        e.type === "flipOnly" ||
        e.type === "chose" ||
        e.type === "go" ||
        e.type === "stopped") &&
      e.seat !== me,
  );
}

interface GostopStore {
  host: GostopHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: GostopLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: GostopView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  /** 보인 걸음 번호(같은 화면이 다시 와도 판 끝 띠를 한 번만 띄운다) */
  seq: number;
  queue: Snapshot<GostopView, GameEvent>[];
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  newGame(options: { rules: GostopRules; level: number; seed?: number }): void;
  resume(saved: GostopSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 한다(나는 0번 자리) */
  startPractice(initialState: GostopState | null, rules: GostopRules): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: GostopHost,
    seatNames: string[],
    stats: StatsTarget,
    /** 방장: 복기용 기록(참가자는 게임 끝 검증 뒤 방에서 받아 남긴다) */
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 차례(와 그 뒤 컴퓨터 수)를 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
}

export const useGostop = create<GostopStore>((set, get) => {
  /** 쌓인 화면을 차례로 보인다. 남이 한 수는 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null) return;
    const next = get().queue[0];
    if (next === undefined) return;
    const me = get().host?.seat ?? 0;
    const show = () => {
      timer = null;
      set({
        // 기다리는 사이에 새 화면이 더 쌓였을 수 있어 지금 줄에서 하나만 뺀다.
        queue: get().queue.slice(1),
        view: next.view,
        events: next.events,
        seq: get().seq + 1,
      });
      for (const cue of gostopCues(next.events, me)) playUiCue(cue);
      advance();
    };
    if (byOther(next.events, me)) timer = setTimeout(show, BOT_DELAY_MS);
    else show();
  };

  const attach = (
    host: GostopHost,
    options: {
      local: GostopLocalMatch | null;
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
      ? new StatsRecorder(gostopKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(gostopKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice) saveGostop({ ...local.save(), level });
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
      events: [],
      seq: get().seq + 1,
      queue: [],
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
      set({ queue: [...get().queue, snapshot] });
      advance();
    });
  };

  const newLocal = (
    rules: GostopRules,
    seed: number,
    level: number,
    log?: GostopSaved["log"],
  ): GostopLocalMatch =>
    new LocalMatch(
      {
        kit: gostopKit,
        rules,
        seed,
        humanSeat: 0,
        bot: gostopBotFor(level),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (local: GostopLocalMatch, level: number, seed: number) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "gostop", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "gostop",
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
    seq: 0,
    queue: [],
    level: 0,
    notice: null,
    practice: false,

    newGame({ rules, level, seed: given }) {
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

    startPractice(initialState, rules) {
      const local: GostopLocalMatch = new LocalMatch({
        kit: gostopKit,
        rules,
        seed: Math.floor(Math.random() * 2 ** 31),
        humanSeat: 0,
        bot: gostopBotFor(0),
        pace: browserPace,
        ...(initialState ? { initialState } : {}),
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
      // 남이 한 수를 보여 주기 전에는 내지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view, queue } = get();
      // 튜토리얼 장면은 기록으로 다시 만들 수 없어 무르지 않는다.
      if (
        !local ||
        !view ||
        get().practice ||
        queue.length > 0 ||
        view.phase !== "play"
      )
        return false;
      const log = local.actionLog();
      // 이번 판 안의 내 차례만 무른다(판을 넘기면 정산이 끝났다).
      const lastContinue = log.findLastIndex(
        (e) => e.action.type === "continue",
      );
      return log
        .slice(lastContinue + 1)
        .some((entry) => entry.seat === local.seat && isTurn(entry.action));
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 차례까지 잘라 낸다(그 뒤 컴퓨터 수도 함께).
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
        queue: [],
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
