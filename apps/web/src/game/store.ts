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
import { LocalMatch, type SavedMatch } from "./local-match";
import { saveGame } from "./persistence";
import { dealTiming } from "./timing";

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
  /** 판 시작 섞기·나눠 주기 연출 중. `key`가 바뀌면 연출을 새로 시작한다 */
  dealing: { key: number; handSize: number; startDelay: number } | null;
  /** 판 시작 때의 돈. 결과 화면에서 변화를 보여 준다 */
  roundStartMoney: number[];
  /** 재생 속도 배율. 클수록 빠르다 */
  speed: number;
  busy: boolean;
  notice: string | null;
  newGame(options: NewGameOptions): void;
  /** 저장해 둔 대국을 이어서 한다 */
  resume(saved: SavedMatch): void;
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
  /** `scaled`가 거짓이면 속도 설정과 빨리 감기를 무시한다(실제 시간으로 도는 연출용) */
  const wait = (ms: number, then: () => void, scaled = true) => {
    // 밀린 진행이 많으면 빨리 감는다.
    const backlog = scaled && get().queue.length > 3 ? 1.8 : 1;
    const speed = scaled ? get().speed : 1;
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
    const started = next.events.some((e) => e.type === "roundStarted");
    set({
      queue: rest,
      view: next.view,
      events: next.events,
      busy: true,
      ...(started ? { roundStartMoney: [...next.view.money] } : {}),
    });

    const dealt = next.events.find((e) => e.type === "dealt");
    if (dealt && next.view.rules.playerCount !== 2) {
      const others = next.events.filter(
        (e) => e.type !== "dealt" && e.type !== "roundStarted",
      );
      const startDelay = Math.max(
        0,
        ...others.map((e) => EVENT_DELAY[e.type] ?? 150),
      );
      const total = dealt.handSize * next.view.players.length;
      set({
        dealing: {
          key: (get().dealing?.key ?? 0) + 1,
          handSize: dealt.handSize,
          startDelay,
        },
      });
      // 연출 컴포넌트가 실제 시간으로 돌기 때문에 빨리 감지 않는다.
      wait(
        startDelay + dealTiming(total).duration,
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

  /** 새 대국이나 되살린 대국을 화면에 붙인다. 진행될 때마다 저장한다 */
  const attach = (host: LocalMatch) => {
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
      roundStartMoney: [...current.money],
    });
    saveGame(host.save());
    unsubscribe = host.subscribe((snapshot) => {
      saveGame(host.save());
      enqueue([snapshot]);
    });
    enqueue(pending);
  };

  return {
    host: null,
    view: null,
    events: [],
    queue: [],
    shownTrick: null,
    collecting: false,
    dealing: null,
    roundStartMoney: [],
    speed: 1,
    busy: false,
    notice: null,

    newGame(options) {
      const host = new LocalMatch({
        rules: options.rules,
        seed: options.seed ?? Math.floor(Math.random() * 2 ** 31),
        ...(options.presetDeal ? { presetDeal: options.presetDeal } : {}),
      });
      attach(host);
    },

    resume(saved) {
      attach(LocalMatch.restore(saved));
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
