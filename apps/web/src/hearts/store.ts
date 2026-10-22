import type { Card } from "@mighty/engine";
import type { BusyReason } from "@mighty/fair-play";
import {
  type Action,
  type CompletedTrick,
  type GameEvent,
  type HeartsRules,
  type PlayerView,
  QUEEN_OF_SPADES,
} from "@mighty/hearts-engine";
import { create } from "zustand";
import type { EndVoteState, IncidentState } from "@/components/FairOverlays";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { useSettings } from "@/game/settings";
import { type Cue, play as playCue } from "@/game/sound";
import { dealPlan, prefersReducedMotion, SHUFFLE_MS } from "@/game/timing";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";

import { heartsBotFor } from "./bots";
import { heartsKit } from "./kit";
import { useHeartsSettings } from "./settings";

export type HeartsSnapshot = Snapshot<PlayerView, GameEvent>;
export type HeartsHost = MatchHost<PlayerView, Action, GameEvent> & {
  drain(): HeartsSnapshot[];
};
export type HeartsLocalMatch = LocalMatch<
  HeartsRules,
  import("@mighty/hearts-engine").MatchState,
  PlayerView,
  Action,
  GameEvent,
  Card[][]
>;
export type HeartsSaved = SavedMatch<HeartsRules, Action, Card[][]>;

/** 하트는 4·4·5장씩 세 바퀴에 나눠 준다 */
export const HEARTS_DEAL_PATTERN = [4, 4, 5] as const;

/** 이벤트마다 화면이 머무는 시간(ms) */
const EVENT_DELAY: Partial<Record<GameEvent["type"], number>> = {
  roundStarted: 300,
  dealt: 700,
  passChosen: 250,
  // 받은 카드를 볼 시간
  passed: 1600,
  played: 600,
  heartsBroken: 900,
  roundScored: 300,
};
const TRICK_HOLD = 1000;
const TRICK_COLLECT = 380;

const SAVE_KEY = "hearts-save";

function saveHearts(saved: HeartsSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadHearts(): HeartsSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as HeartsSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearHearts(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

function cuesFor(view: PlayerView, events: readonly GameEvent[]): Cue[] {
  const cues: Cue[] = [];
  for (const e of events) {
    if (e.type === "dealt") cues.push("shuffle");
    if (e.type === "passed") cues.push("pass");
    if (e.type === "played")
      cues.push(e.card === QUEEN_OF_SPADES ? "mighty" : "card");
    if (e.type === "heartsBroken") cues.push("friend");
    if (e.type === "trickWon") cues.push("trick");
    if (e.type === "gameOver")
      cues.push(e.winners.includes(view.seat) ? "win" : "lose");
  }
  return cues;
}

interface HeartsStore {
  host: HeartsHost | null;
  seatNames: string[] | null;
  view: PlayerView | null;
  events: GameEvent[];
  seq: number;
  queue: HeartsSnapshot[];
  shownTrick: CompletedTrick | null;
  collecting: boolean;
  dealing: {
    key: number;
    handSize: number;
    startDelay: number;
    /** 섞는 연출 시간(멘탈 포커로 이미 섞는 연출을 보였으면 남은 만큼) */
    shuffleMs: number;
  } | null;
  busy: boolean;
  notice: string | null;
  audit: { ok: true } | { ok: false; reason: string } | null;
  hostLeft: boolean;
  reconnecting: boolean;
  offlineSeats: number[];
  invalid: string | null;
  /** 멘탈 포커: 부정을 찾아 판을 멈췄다(GameStore와 같다) */
  incident: IncidentState | null;
  /** 멘탈 포커: 내 카드를 아직 다 열지 못한 까닭 */
  shuffling: BusyReason | null;
  shuffleStartedAt: number | null;
  setShuffling(reason: BusyReason | null): void;
  fair: boolean;
  endGame: (() => void) | null;
  /** 멘탈 포커: 끝내기 투표(GameStore와 같다) */
  endVote: EndVoteState | null;
  voteEnd: ((end: boolean) => void) | null;
  network: boolean;
  newGame(options: { rules: HeartsRules; seed?: number }): void;
  resume(saved: HeartsSaved): void;
  attachOnline(
    host: HeartsHost,
    seatNames: string[],
    options?: { network?: boolean; stats?: StatsTarget },
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export const useHearts = create<HeartsStore>((set, get) => {
  const wait = (ms: number, then: () => void, scaled = true) => {
    const backlog = scaled && get().queue.length > 10 ? 1.4 : 1;
    const speed = scaled ? useSettings.getState().speed : 1;
    timer = setTimeout(
      () => {
        timer = null;
        then();
      },
      ms / (speed * backlog),
    );
  };

  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) {
      set({ busy: false });
      return;
    }
    set({
      queue: rest,
      view: next.view,
      events: next.events,
      seq: get().seq + 1,
      busy: true,
    });
    if (useSettings.getState().sound)
      for (const cue of cuesFor(next.view, next.events)) playCue(cue);

    const dealt = next.events.find((e) => e.type === "dealt");
    if (dealt && !prefersReducedMotion()) {
      // 멘탈 포커로 실제로 섞는 동안 섞는 연출을 보였으면 최소 시간에서 남은 만큼만 더 섞는다.
      const since = get().shuffleStartedAt;
      const shuffleMs =
        since === null
          ? SHUFFLE_MS
          : Math.max(0, SHUFFLE_MS - (Date.now() - since));
      set({
        dealing: {
          key: (get().dealing?.key ?? 0) + 1,
          handSize: dealt.handSize,
          startDelay: 0,
          shuffleMs,
        },
        shuffleStartedAt: null,
      });
      wait(
        dealPlan(dealt.handSize, 4, HEARTS_DEAL_PATTERN).duration -
          SHUFFLE_MS +
          shuffleMs,
        () => {
          set({ dealing: null });
          advance();
        },
        false,
      );
      return;
    }

    if (next.events.some((e) => e.type === "trickWon")) {
      const shownTrick = next.view.tricks.at(-1) ?? null;
      set({ shownTrick, collecting: false });
      wait(TRICK_HOLD, () => {
        set({ collecting: true });
        wait(TRICK_COLLECT, () => {
          set({ shownTrick: null, collecting: false });
          advance();
        });
      });
      return;
    }
    const queen = next.events.some(
      (e) => e.type === "played" && e.card === QUEEN_OF_SPADES,
    );
    const delay = Math.max(
      queen ? 1000 : 0,
      ...next.events.map((e) => EVENT_DELAY[e.type] ?? 150),
    );
    wait(delay, advance);
  };

  const enqueue = (snapshots: HeartsSnapshot[]) => {
    set({ queue: [...get().queue, ...snapshots] });
    advance();
  };

  const attach = (
    host: HeartsHost,
    options: {
      save: boolean;
      seatNames: string[] | null;
      network?: boolean;
      /** 내 기록에 남길 대국(배우기는 남기지 않는다) */
      stats?: StatsTarget;
    },
  ) => {
    clearTimer();
    unsubscribe?.();
    const current = host.current();
    const pending = host.drain();
    set({
      host,
      view: pending.length > 0 ? null : current,
      events: [],
      queue: [],
      shownTrick: null,
      collecting: false,
      dealing: null,
      busy: false,
      seatNames: options.seatNames,
      network: options.network ?? false,
      invalid: null,
      incident: null,
      shuffling: null,
      shuffleStartedAt: null,
    });
    const persist = () => {
      if (options.save && host instanceof LocalMatch)
        saveHearts((host as HeartsLocalMatch).save());
    };
    persist();
    const recorder = options.stats
      ? new StatsRecorder(heartsKit.stats, options.stats)
      : null;
    for (const snapshot of pending) recorder?.observe(snapshot);
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      enqueue([snapshot]);
    });
    enqueue(pending);
  };

  const newLocal = (
    rules: HeartsRules,
    seed: number,
    log?: HeartsSaved["log"],
  ) =>
    new LocalMatch(
      {
        kit: heartsKit,
        rules,
        seed,
        bot: heartsBotFor(useHeartsSettings.getState().level),
        pace: browserPace,
      },
      log,
    );

  return {
    host: null,
    seatNames: null,
    view: null,
    events: [],
    seq: 0,
    queue: [],
    shownTrick: null,
    collecting: false,
    dealing: null,
    busy: false,
    notice: null,
    audit: null,
    hostLeft: false,
    reconnecting: false,
    offlineSeats: [],
    invalid: null,
    incident: null,
    shuffling: null,
    shuffleStartedAt: null,
    setShuffling(reason) {
      const { shuffling, shuffleStartedAt } = get();
      const starting = reason === "deal" && shuffling !== "deal";
      set({
        shuffling: reason,
        shuffleStartedAt: starting ? Date.now() : shuffleStartedAt,
      });
    },
    fair: false,
    endGame: null,
    endVote: null,
    voteEnd: null,
    network: false,

    newGame(options) {
      const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
      attach(newLocal(options.rules, seed), {
        save: true,
        seatNames: null,
        stats: { game: "hearts", mode: "solo", key: `solo:${seed}` },
      });
      set({ fair: false, endGame: null, endVote: null, voteEnd: null });
    },

    resume(saved) {
      attach(newLocal(saved.rules, saved.seed, saved.log), {
        save: true,
        seatNames: null,
        stats: { game: "hearts", mode: "solo", key: `solo:${saved.seed}` },
      });
    },

    attachOnline(host, seatNames, options) {
      attach(host, {
        save: false,
        seatNames,
        network: options?.network ?? false,
        ...(options?.stats ? { stats: options.stats } : {}),
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    submit(action) {
      const { host } = get();
      if (host === null) return { ok: false, error: "게임이 없다" };
      const result = host.submit(action);
      if (!result.ok) set({ notice: result.error });
      return result;
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});

/** 사람이 지금 고를 수 있는가 */
export function canActHearts(
  state: Pick<HeartsStore, "queue" | "view" | "shownTrick" | "dealing">,
): boolean {
  return (
    state.queue.length === 0 &&
    state.shownTrick === null &&
    state.dealing === null &&
    state.view?.decision != null
  );
}

/** 이번 판에 내가 받은 카드(넘기기 뒤 표를 단다) */
export function receivedCards(view: PlayerView): Set<Card> {
  return new Set(
    view.phase === "play" && view.trickIndex === 0 ? view.received : [],
  );
}
