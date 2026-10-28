import { monthOf } from "@mighty/hwatu";

import type { GostopRules } from "./rules";
import type { GostopState } from "./state";

export interface GostopScenarioOptions {
  rules: GostopRules;
  /** 자리마다 손패 */
  hands: string[][];
  floor: string[];
  /** 더미(0번이 맨 위) */
  deck: string[];
  /** 자리마다 먹은 패 */
  captured?: string[][];
  /** 먼저 낼 자리(기본 0) */
  turn?: number;
  goCount?: number[];
  scores?: number[];
}

/**
 * 튜토리얼 미션처럼 정해진 장면에서 시작하는 상태. 패는 48장을 다 쓰지 않아도 된다.
 * 바닥의 같은 달 석 장은 처음 깔린 뻑으로 본다
 */
export function createGostopScenario(o: GostopScenarioOptions): GostopState {
  const n = o.rules.players;
  const zeros = () => Array.from({ length: n }, () => 0);
  const counts = new Map<number, number>();
  for (const id of o.floor)
    counts.set(monthOf(id), (counts.get(monthOf(id)) ?? 0) + 1);
  return {
    rules: o.rules,
    seed: 1,
    roundNumber: 1,
    dealer: o.turn ?? 0,
    hands: o.hands.map((h) => [...h]),
    floor: [...o.floor],
    deck: [...o.deck],
    captured:
      o.captured?.map((c) => [...c]) ?? Array.from({ length: n }, () => []),
    stacks: [...counts.entries()]
      .filter(([, c]) => c === 3)
      .map(([month]) => ({
        month: month as GostopState["stacks"][number]["month"],
        owner: null,
      })),
    turn: o.turn ?? 0,
    stage: "play",
    pending: null,
    lastTurn: null,
    goCount: o.goCount ? [...o.goCount] : zeros(),
    lastGoScore: zeros(),
    lastGoSeat: null,
    shakes: zeros(),
    revealed: Array.from({ length: n }, () => []),
    flipOwed: zeros(),
    ppeok: zeros(),
    nagari: 0,
    scores: o.scores ? [...o.scores] : zeros(),
    history: [],
    phase: "play",
    result: null,
    continued: Array.from({ length: n }, () => false),
    redeals: 0,
  };
}
