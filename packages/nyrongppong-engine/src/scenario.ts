import { HWATU_DECK } from "@mighty/hwatu";

import { canStop } from "./match";
import { type NyrongppongRules, STANDARD_RULES } from "./rules";
import type { NyrongppongState } from "./state";

/** 튜토리얼 장면: 정해진 손패·더미에서 한 판을 시작한다 */
export interface NyrongppongScenarioOptions {
  /** 없으면 기본 규칙에 인원은 손패 수, 한 판 */
  rules?: NyrongppongRules;
  /** 자리별 손패. 0번이 나 */
  hands: string[][];
  /** 더미(앞이 맨 위). 없으면 남은 카드를 카드 순서대로 */
  deck?: string[];
  pile?: string[];
  melds?: string[][][];
  /** 지금 차례(기본 0). 손패가 여섯·셋 장이면 버리기부터, 아니면 차례 시작(스톱 묻기 또는 가져오기 전) */
  turn?: number;
}

/** 정해진 장면에서 시작하는 한 판(튜토리얼 미션). 판 수는 1이다 */
export function createNyrongppongScenario(
  options: NyrongppongScenarioOptions,
): NyrongppongState {
  const n = options.hands.length;
  const rules: NyrongppongRules = {
    ...(options.rules ?? STANDARD_RULES),
    players: n,
    rounds: 1,
  };
  const used = new Set([
    ...options.hands.flat(),
    ...(options.pile ?? []),
    ...(options.melds ?? []).flat(2),
  ]);
  const deck =
    options.deck ?? HWATU_DECK.map((c) => c.id).filter((id) => !used.has(id));
  const turn = options.turn ?? 0;
  const hand = options.hands[turn] ?? [];
  const state: NyrongppongState = {
    rules,
    seed: 0,
    roundNumber: 1,
    dealer: 0,
    turn,
    phase: "discard",
    deck: [...deck],
    hands: options.hands.map((h) => [...h]),
    pile: [...(options.pile ?? [])],
    melds: options.melds
      ? options.melds.map((m) => m.map((g) => [...g]))
      : Array.from({ length: n }, () => []),
    drawn: null,
    call: null,
    totals: new Array<number>(n).fill(0),
    result: null,
    continued: new Array<boolean>(n).fill(false),
  };
  if (hand.length % 3 !== 0) {
    // 차례 시작: 스톱할 수 있으면 묻고, 아니면 맨 위 한 장을 가져온 상태로 둔다.
    if (canStop(state, turn)) state.phase = "draw";
    else {
      const card = state.deck.shift() as string;
      state.hands[turn]?.push(card);
      state.drawn = card;
    }
  }
  return state;
}
