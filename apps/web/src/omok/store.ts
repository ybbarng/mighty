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
import type { Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { StatsRecorder } from "@/stats/recorder";

import { omokKit } from "./kit";

export type OmokLocalMatch = LocalMatch<
  OmokRules,
  OmokState,
  OmokView,
  Action,
  GameEvent,
  undefined
>;
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
  host: OmokLocalMatch | null;
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
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 수(와 그 뒤 컴퓨터 수)를 되돌린다 */
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

export const useOmok = create<OmokStore>((set, get) => {
  /** 쌓인 화면을 차례로 보인다. 컴퓨터가 둔 수는 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) return;
    const host = get().host;
    const byBot = next.events.some(
      (e) => e.type === "placed" && e.seat !== host?.seat,
    );
    const show = () => {
      timer = null;
      set({ queue: rest, view: next.view, events: next.events });
      advance();
    };
    if (byBot) timer = setTimeout(show, BOT_DELAY_MS);
    else show();
  };

  const attach = (host: OmokLocalMatch, level: number, seed: number) => {
    stop();
    const recorder = new StatsRecorder(omokKit.stats, {
      game: "omok",
      mode: "solo",
      key: `solo:${seed}`,
    });
    const persist = () => saveOmok({ ...host.save(), level });
    const first = host.drain();
    set({
      host,
      level,
      view: host.current(),
      events: [],
      queue: [],
      notice: null,
    });
    persist();
    for (const snapshot of first) recorder.observe(snapshot);
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder.observe(snapshot);
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

  return {
    host: null,
    view: null,
    events: [],
    queue: [],
    level: 1,
    notice: null,

    newGame({ rules, level, pick, seed: given }) {
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      attach(
        newLocal(rules, seed, seatFor(rules, seed, pick), level),
        level,
        seed,
      );
    },

    resume(saved) {
      attach(
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

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없다" };
      // 컴퓨터 수를 보여 주기 전에는 두지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) set({ notice: result.error });
      return result;
    },

    canUndo() {
      const { host, view, queue } = get();
      if (!host || !view || queue.length > 0 || view.phase !== "play")
        return false;
      return host
        .actionLog()
        .some(
          (entry) => entry.seat === host.seat && entry.action.type === "place",
        );
    },

    undo() {
      const { host, level } = get();
      if (!host || !get().canUndo()) return false;
      const saved = host.save();
      const log = [...saved.log];
      // 내 마지막 두기까지 잘라 낸다(그 뒤 컴퓨터 수도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === host.seat && last.action.type === "place") break;
      }
      attach(
        newLocal(saved.rules, saved.seed, saved.humanSeat, level, log),
        level,
        saved.seed,
      );
      return true;
    },

    leave() {
      stop();
      set({ host: null, view: null, queue: [], events: [] });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
