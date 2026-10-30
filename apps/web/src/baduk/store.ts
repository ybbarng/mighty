import { badukBotFor } from "@mighty/baduk-ai";
import {
  type Action,
  type BadukRules,
  type BadukState,
  type BadukView,
  createMatch,
  type GameEvent,
} from "@mighty/baduk-engine";
import { create } from "zustand";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { paced } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";

import { badukKit } from "./kit";
import type { StonePick } from "./settings";

export type BadukLocalMatch = LocalMatch<
  BadukRules,
  BadukState,
  BadukView,
  Action,
  GameEvent,
  undefined
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type BadukHost = MatchHost<BadukView, Action, GameEvent> & {
  drain(): Snapshot<BadukView, GameEvent>[];
};

export type BadukSaved = SavedMatch<BadukRules, Action, undefined> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/** 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이) */
const BOT_DELAY_MS = 350;

const SAVE_KEY = "baduk-save";

function saveBaduk(saved: BadukSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadBaduk(): BadukSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as BadukSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearBaduk(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 이 시드의 첫 판에서 원하는 돌을 쥐는 자리 */
function seatFor(rules: BadukRules, seed: number, pick: StonePick): number {
  const black = createMatch(rules, seed).state.blackSeat;
  if (pick === "black") return black;
  if (pick === "white") return 1 - black;
  return Math.random() < 0.5 ? 0 : 1;
}

/** 무르기로 되돌리는 내 행동: 돌 놓기와 쉬기 */
const isTurn = (action: Action) =>
  action.type === "place" || action.type === "pass";

interface BadukStore {
  host: BadukHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: BadukLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: BadukView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  queue: Snapshot<BadukView, GameEvent>[];
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  newGame(options: {
    rules: BadukRules;
    level: number;
    pick: StonePick;
    seed?: number;
  }): void;
  resume(saved: BadukSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 둔다(나는 0번 자리) */
  startPractice(initialState: BadukState): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: BadukHost,
    seatNames: string[],
    stats: StatsTarget,
    /** 방장: 복기용 기록(참가자는 게임 끝 검증 뒤 방에서 받아 남긴다) */
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 수(와 그 뒤 컴퓨터 수)를 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

/**
 * 돌을 따낼 때 내는 소리. 바둑만의 "돌 따내기" 소리를 `game/sound.ts`에 더하기 전까지는 장기의 잡기 소리를 빌린다
 */
const CAPTURE_CUE = "capture";

/** 사건에 맞춰 소리를 낸다: 돌 놓기·따내기, 판 끝(이김·짐) */
function cuesFor(events: readonly GameEvent[], me: number): void {
  for (const e of events) {
    if (e.type === "placed")
      playUiCue(e.captured.length > 0 ? CAPTURE_CUE : "stone");
    if (e.type === "roundEnded")
      playUiCue(e.result.seat === me ? "win" : "lose");
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
}

export const useBaduk = create<BadukStore>((set, get) => {
  /** 쌓인 화면을 차례로 보인다. 컴퓨터가 둔 수는 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null) return;
    const next = get().queue[0];
    if (next === undefined) return;
    const host = get().host;
    // 컴퓨터 상대(혼자 하기)만 기다린다. 온라인 상대 수는 바로 보인다.
    const byBot =
      get().local !== null &&
      next.events.some(
        (e) =>
          (e.type === "placed" || e.type === "passed") && e.seat !== host?.seat,
      );
    const show = () => {
      timer = null;
      // 기다리는 사이 새 화면이 쌓였을 수 있어, 그때의 줄에서 첫 장만 뺀다.
      set({
        queue: get().queue.slice(1),
        view: next.view,
        events: next.events,
      });
      cuesFor(next.events, host?.seat ?? 0);
      advance();
    };
    if (byBot) timer = setTimeout(show, paced(BOT_DELAY_MS));
    else show();
  };

  const attach = (
    host: BadukHost,
    options: {
      local: BadukLocalMatch | null;
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
      ? new StatsRecorder(badukKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(badukKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice) saveBaduk({ ...local.save(), level });
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
    rules: BadukRules,
    seed: number,
    humanSeat: number,
    level: number,
    log?: BadukSaved["log"],
  ): BadukLocalMatch =>
    new LocalMatch(
      {
        kit: badukKit,
        rules,
        seed,
        humanSeat,
        bot: badukBotFor(level),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (local: BadukLocalMatch, level: number, seed: number) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "baduk", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "baduk",
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
    queue: [],
    level: 1,
    notice: null,
    practice: false,

    newGame({ rules, level, pick, seed: given }) {
      track("game-start", { game: "baduk", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      attachLocal(
        newLocal(rules, seed, seatFor(rules, seed, pick), level),
        level,
        seed,
      );
    },

    resume(saved) {
      attachLocal(
        newLocal(
          saved.rules,
          saved.seed,
          saved.humanSeat,
          saved.level,
          saved.log,
        ),
        saved.level,
        saved.seed,
      );
    },

    startPractice(initialState) {
      const local: BadukLocalMatch = new LocalMatch({
        kit: badukKit,
        rules: initialState.rules,
        seed: Math.floor(Math.random() * 2 ** 31),
        humanSeat: 0,
        bot: badukBotFor(0),
        pace: browserPace,
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
      // 컴퓨터 수를 보여 주기 전에는 두지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view } = get();
      // 튜토리얼 장면은 기록으로 다시 만들 수 없어 무르지 않는다. 판 끝은 화면에 보이기 전에 기록되므로
      // 보이는 화면이 아니라 대국의 최신 상태로 본다(컴퓨터 수를 보이는 중에도 무를 수 있다)
      if (!local || !view || get().practice || local.current().phase !== "play")
        return false;
      return local
        .actionLog()
        .some((entry) => entry.seat === local.seat && isTurn(entry.action));
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 두기까지 잘라 낸다(그 뒤 컴퓨터 수도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && isTurn(last.action)) break;
      }
      attachLocal(
        newLocal(saved.rules, saved.seed, saved.humanSeat, level, log),
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
