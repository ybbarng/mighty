import { omokBotFor } from "@mighty/omok-ai";
import {
  type Action,
  createMatch,
  type GameEvent,
  type OmokRules,
  type OmokState,
  type OmokView,
} from "@mighty/omok-engine";
import { create } from "zustand";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";

import { omokKit } from "./kit";

export type OmokLocalMatch = LocalMatch<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type OmokHost = MatchHost<OmokView, Action, GameEvent> & {
  drain(): Snapshot<OmokView, GameEvent>[];
};

export type OmokSaved = SavedMatch<OmokRules, Action, undefined> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/** 내 돌: 흑(먼저 둔다)·백·무작위 */
export type StonePick = "black" | "white" | "random";

/** 컴퓨터 수를 바로 보이지 않고 잠깐 기다렸다 놓는다(생각하는 듯이) */
const BOT_DELAY_MS = 350;

const SAVE_KEY = "omok-save";

function saveOmok(saved: OmokSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadOmok(): OmokSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as OmokSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearOmok(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 이 시드의 첫 판에서 원하는 돌을 쥐는 자리 */
function seatFor(rules: OmokRules, seed: number, pick: StonePick): number {
  const black = createMatch(rules, seed).state.blackSeat;
  if (pick === "black") return black;
  if (pick === "white") return 1 - black;
  return Math.random() < 0.5 ? 0 : 1;
}

interface OmokStore {
  host: OmokHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: OmokLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: OmokView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  queue: Snapshot<OmokView, GameEvent>[];
  level: number;
  notice: string | null;
  newGame(options: {
    rules: OmokRules;
    level: number;
    pick: StonePick;
    seed?: number;
  }): void;
  resume(saved: OmokSaved): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: OmokHost,
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

/** 사건에 맞춰 소리를 낸다: 돌 놓기, 판 끝(이김·짐·비김) */
function cuesFor(events: readonly GameEvent[], me: number): void {
  for (const e of events) {
    if (e.type === "placed") playUiCue("stone");
    if (e.type === "roundEnded")
      playUiCue(
        e.result.kind === "draw"
          ? "roundEnd"
          : e.result.seat === me
            ? "win"
            : "lose",
      );
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

export const useOmok = create<OmokStore>((set, get) => {
  /** 쌓인 화면을 차례로 보인다. 컴퓨터가 둔 수는 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) return;
    const host = get().host;
    // 컴퓨터 상대(혼자 하기)만 기다린다. 온라인 상대 수는 바로 보인다.
    const byBot =
      get().local !== null &&
      next.events.some((e) => e.type === "placed" && e.seat !== host?.seat);
    const show = () => {
      timer = null;
      set({ queue: rest, view: next.view, events: next.events });
      cuesFor(next.events, host?.seat ?? 0);
      advance();
    };
    if (byBot) timer = setTimeout(show, BOT_DELAY_MS);
    else show();
  };

  const attach = (
    host: OmokHost,
    options: {
      local: OmokLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      stats: StatsTarget;
      archive?: ArchiveTarget;
    },
  ) => {
    stop();
    const { local, level } = options;
    const recorder = new StatsRecorder(omokKit.stats, options.stats);
    const archiver = options.archive
      ? new ArchiveRecorder(omokKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local) saveOmok({ ...local.save(), level });
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
    });
    persist();
    for (const snapshot of first) {
      recorder.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder.observe(snapshot);
      archiver?.observe(snapshot);
      set({ queue: [...get().queue, snapshot] });
      advance();
    });
  };

  const newLocal = (
    rules: OmokRules,
    seed: number,
    humanSeat: number,
    level: number,
    log?: OmokSaved["log"],
  ): OmokLocalMatch =>
    new LocalMatch(
      {
        kit: omokKit,
        rules,
        seed,
        humanSeat,
        bot: omokBotFor(level),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (local: OmokLocalMatch, level: number, seed: number) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "omok", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "omok",
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

    newGame({ rules, level, pick, seed: given }) {
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
      const { local, view, queue } = get();
      if (!local || !view || queue.length > 0 || view.phase !== "play")
        return false;
      return local
        .actionLog()
        .some(
          (entry) => entry.seat === local.seat && entry.action.type === "place",
        );
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 두기까지 잘라 낸다(그 뒤 컴퓨터 수도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && last.action.type === "place") break;
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
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
