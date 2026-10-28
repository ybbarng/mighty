import { boardHash, type Cell, emptyBoard, pointAt, type Stone } from "./board";
import { type BadukRules, STANDARD_RULES } from "./rules";
import type { BadukState } from "./state";

/** 튜토리얼·문제 장면: 놓인 돌. 자리는 "D4"처럼 쓴다 */
export interface BadukScenarioOptions {
  /** 판 크기는 규칙을 따른다(기본 9줄) */
  rules?: BadukRules;
  black: readonly string[];
  white: readonly string[];
  /** 0번 자리(나)의 돌. 늘 내가 둘 차례로 시작한다(기본 흑) */
  me?: Stone;
}

/** 정해진 장면에서 시작하는 첫 판 */
export function createBadukScenario(options: BadukScenarioOptions): BadukState {
  const rules = options.rules ?? STANDARD_RULES;
  const me = options.me ?? 1;
  const board: Cell[] = emptyBoard(rules.size);
  for (const name of options.black) board[pointAt(name, rules.size)] = 1;
  for (const name of options.white) board[pointAt(name, rules.size)] = 2;
  return {
    rules,
    board,
    toPlay: me,
    played: [],
    passes: 0,
    blackSeat: me === 1 ? 0 : 1,
    prisoners: { 1: 0, 2: 0 },
    roundNumber: 1,
    wins: [0, 0],
    phase: "play",
    result: null,
    continued: [false, false],
    // 튜토리얼·문제 장면은 시간을 재지 않는다.
    clocks: null,
    positions: [boardHash(board)],
  };
}
