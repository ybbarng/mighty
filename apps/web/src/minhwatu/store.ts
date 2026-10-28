import type { PresetDeal } from "@mighty/hwatu";
import { minhwatuBotFor } from "@mighty/minhwatu-ai";
import type {
  Action,
  GameEvent,
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
} from "@mighty/minhwatu-engine";
import { create } from "zustand";

import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";

import { minhwatuCues } from "./cues";
import { minhwatuKit } from "./kit";

export type MinhwatuLocalMatch = LocalMatch<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  PresetDeal
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type MinhwatuHost = MatchHost<MinhwatuView, Action, GameEvent> & {
  drain(): Snapshot<MinhwatuView, GameEvent>[];
};

export type MinhwatuSaved = SavedMatch<MinhwatuRules, Action, PresetDeal> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/** 남이 낸 차례를 바로 넘기지 않고 잠깐 보여 준다(무엇을 내고 먹었는지 보이게) */
export const OTHER_TURN_MS = 700;

const SAVE_KEY = "minhwatu-save";

function saveMinhwatu(saved: MinhwatuSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadMinhwatu(): MinhwatuSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as MinhwatuSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearMinhwatu(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

interface MinhwatuStore {
  host: MinhwatuHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: MinhwatuLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: MinhwatuView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  queue: Snapshot<MinhwatuView, GameEvent>[];
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  newGame(options: {
    rules: MinhwatuRules;
    level: number;
    seed?: number;
  }): void;
  resume(saved: MinhwatuSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 둔다(나는 0번 자리) */
  startPractice(initialState: MinhwatuState): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: MinhwatuHost,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 패 내기(와 그 뒤 컴퓨터 차례)를 되돌린다 */
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

function playCues(events: readonly GameEvent[], me: number): void {
  for (const { cue, delay } of minhwatuCues(events, me)) {
    if (delay <= 0) playUiCue(cue);
    else setTimeout(() => playUiCue(cue), delay * 1000);
  }
}

/** 남(컴퓨터·다른 사람)이 낸 걸음인가 */
function byOther(events: readonly GameEvent[], me: number): boolean {
  return events.some(
    (e) => (e.type === "played" || e.type === "picked") && e.seat !== me,
  );
}

export const useMinhwatu = create<MinhwatuStore>((set, get) => {
  /** 쌓인 화면을 차례로 보인다. 남이 낸 차례는 조금씩 보여 준다 */
  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) return;
    const me = get().host?.seat ?? 0;
    set({ queue: rest, view: next.view, events: next.events });
    playCues(next.events, me);
    // 남의 차례를 보인 뒤 다음 화면까지 잠깐 쉰다(바로 이어지면 무엇을 냈는지 못 본다).
    if (rest.length > 0 && byOther(next.events, me))
      timer = setTimeout(() => {
        timer = null;
        advance();
      }, OTHER_TURN_MS);
    else advance();
  };

  const attach = (
    host: MinhwatuHost,
    options: {
      local: MinhwatuLocalMatch | null;
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
      ? new StatsRecorder(minhwatuKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(minhwatuKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice) saveMinhwatu({ ...local.save(), level });
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
      events: first.at(-1)?.events ?? [],
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
    rules: MinhwatuRules,
    seed: number,
    level: number,
    log?: MinhwatuSaved["log"],
  ): MinhwatuLocalMatch =>
    new LocalMatch(
      {
        kit: minhwatuKit,
        rules,
        seed,
        humanSeat: 0,
        bot: minhwatuBotFor(level),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (
    local: MinhwatuLocalMatch,
    level: number,
    seed: number,
  ) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "minhwatu", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "minhwatu",
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

    startPractice(initialState) {
      const local: MinhwatuLocalMatch = new LocalMatch({
        kit: minhwatuKit,
        rules: initialState.rules,
        seed: 1,
        humanSeat: 0,
        bot: minhwatuBotFor(0),
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
      // 남의 차례를 다 보여 주기 전에는 내지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view, queue, practice } = get();
      if (!local || !view || practice || queue.length > 0) return false;
      if (view.phase !== "play" && view.phase !== "pick") return false;
      // 이번 판에 내가 낸 패가 있어야 한다(지난 판으로는 되돌리지 않는다).
      const log = local.actionLog();
      for (let i = log.length - 1; i >= 0; i--) {
        const entry = log[i];
        if (!entry || entry.action.type === "continue") return false;
        if (entry.seat === local.seat && entry.action.type === "play")
          return true;
      }
      return false;
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 패 내기까지 잘라 낸다(내 고르기와 그 뒤 컴퓨터 차례도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && last.action.type === "play") break;
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
