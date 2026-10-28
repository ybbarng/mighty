import { sortCards } from "@mighty/hwatu";

import { type MinhwatuRules, STANDARD_RULES } from "./rules";
import type { MinhwatuState } from "./state";

/** 튜토리얼 장면: 정해진 손패·바닥·더미·먹은 패 */
export interface MinhwatuScenarioOptions {
  rules?: MinhwatuRules;
  /** 자리별 손패. 0번 자리가 나다 */
  hands: readonly (readonly string[])[];
  floor: readonly string[];
  /** 더미(앞이 다음에 뒤집을 카드) */
  deck?: readonly string[];
  /** 자리별로 이미 먹은 패 */
  captured?: readonly (readonly string[])[];
}

/**
 * 정해진 장면에서 시작하는 한 판. 늘 내가(0번) 선이고 내 차례다.
 * 카드가 48장 다 쓰이지 않아도 되고, 손패가 모두 비면 판이 끝난다
 */
export function createMinhwatuScenario(
  options: MinhwatuScenarioOptions,
): MinhwatuState {
  const rules = { ...(options.rules ?? STANDARD_RULES), rounds: 1 };
  const n = rules.players;
  return {
    rules,
    seed: 1,
    roundNumber: 1,
    dealer: 0,
    hands: Array.from({ length: n }, (_, i) =>
      sortCards(options.hands[i] ?? []),
    ),
    floor: [...options.floor],
    deck: [...(options.deck ?? [])],
    captured: Array.from({ length: n }, (_, i) => [
      ...(options.captured?.[i] ?? []),
    ]),
    turn: 0,
    phase: "play",
    pending: null,
    current: null,
    last: null,
    totals: new Array<number>(n).fill(0),
    result: null,
    history: [],
    continued: new Array<boolean>(n).fill(false),
  };
}
