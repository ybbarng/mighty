import type {
  Action,
  CompletedTrick,
  GameEvent,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@mighty/engine";
import { create } from "zustand";

import type { Snapshot, SubmitResult } from "./host";
import { LocalMatch } from "./local-match";

/** 이벤트마다 화면이 머무는 시간(ms). docs/05-layout.md 3.9절 */
const EVENT_DELAY: Partial<Record<GameEvent["type"], number>> = {
  roundStarted: 300,
  dealt: 700,
  picked: 250,
  bid: 550,
  passed: 450,
  dealMiss: 1600,
  allPassed: 1200,
  elected: 1000,
  killAttempt: 900,
  redealtForDead: 700,
  kittyTaken: 500,
  exchanged: 500,
  friendDeclared: 700,
  played: 380,
  friendRevealed: 700,
  roundScored: 300,
};
/** 트릭이 끝나고 이긴 카드를 보여 주는 시간과, 이긴 사람에게 모으는 시간 */
const TRICK_HOLD = 900;
const TRICK_COLLECT = 380;

export interface NewGameOptions {
  rules: RuleSet;
  seed?: number;
  presetDeal?: PresetDeal;
}

interface GameStore {
  host: LocalMatch | null;
  /** 지금 화면에 보이는 정보. 엔진보다 늦게 따라간다 */
  view: PlayerView | null;
  events: GameEvent[];
  queue: Snapshot[];
  /** 끝난 트릭을 잠시 바닥에 남겨 둔다 */
  shownTrick: CompletedTrick | null;
  collecting: boolean;
  /** 판 시작 때의 돈. 결과 화면에서 변화를 보여 준다 */
  roundStartMoney: number[];
  /** 재생 속도 배율. 클수록 빠르다 */
  speed: number;
  busy: boolean;
  notice: string | null;
  newGame(options: NewGameOptions): void;
  submit(action: Action): SubmitResult;
  setSpeed(speed: number): void;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export const useGame = create<GameStore>((set, get) => {
  const wait = (ms: number, then: () => void) => {
    // 밀린 진행이 많으면 빨리 감는다.
    const backlog = get().queue.length > 3 ? 1.8 : 1;
    timer = setTimeout(
      () => {
        timer = null;
        then();
      },
      ms / (get().speed * backlog),
    );
  };

  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) {
      set({ busy: false });
      return;
    }
    const started = next.events.some((e) => e.type === "roundStarted");
    set({
      queue: rest,
      view: next.view,
      events: next.events,
      busy: true,
      ...(started ? { roundStartMoney: [...next.view.money] } : {}),
    });

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
    const delay = Math.max(
      0,
      ...next.events.map((e) => EVENT_DELAY[e.type] ?? 150),
    );
    wait(delay, advance);
  };

  const enqueue = (snapshots: Snapshot[]) => {
    set({ queue: [...get().queue, ...snapshots] });
    advance();
  };

  return {
    host: null,
    view: null,
    events: [],
    queue: [],
    shownTrick: null,
    collecting: false,
    roundStartMoney: [],
    speed: 1,
    busy: false,
    notice: null,

    newGame(options) {
      clearTimer();
      unsubscribe?.();
      const host = new LocalMatch({
        rules: options.rules,
        seed: options.seed ?? Math.floor(Math.random() * 2 ** 31),
        ...(options.presetDeal ? { presetDeal: options.presetDeal } : {}),
      });
      set({
        host,
        view: null,
        events: [],
        queue: [],
        shownTrick: null,
        collecting: false,
        busy: false,
      });
      const pending = host.drain();
      unsubscribe = host.subscribe((snapshot) => enqueue([snapshot]));
      enqueue(pending);
    },

    submit(action) {
      const { host } = get();
      if (host === null) return { ok: false, error: "게임이 없다" };
      const result = host.submit(action);
      if (!result.ok) set({ notice: result.error });
      return result;
    },

    setSpeed(speed) {
      set({ speed });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});

/** 사람이 지금 고를 수 있는가. 재생이 밀려 있거나 트릭을 보여 주는 중이면 기다린다 */
export function canAct(
  state: Pick<GameStore, "busy" | "view" | "shownTrick">,
): boolean {
  return (
    !state.busy && state.shownTrick === null && state.view?.decision != null
  );
}
