import { emptyBoard, pointAt } from "./board";
import { type OmokRules, STANDARD_RULES } from "./rules";
import type { OmokState } from "./state";

/** 튜토리얼 장면: 판에 미리 놓인 돌. 자리는 "H8"처럼 쓴다 */
export interface OmokScenarioOptions {
  rules?: OmokRules;
  black: readonly string[];
  white: readonly string[];
}

/**
 * 정해진 장면에서 시작하는 첫 판. 0번 자리(나)가 둘 차례다:
 * 흑과 백 수가 같으면 내가 흑, 흑이 하나 많으면 내가 백이다.
 * 둔 차례는 흑·백을 번갈아 쌓은 것으로 본다(마지막 수 표시에만 쓴다)
 */
export function createOmokScenario(options: OmokScenarioOptions): OmokState {
  const { black, white } = options;
  const extra = black.length - white.length;
  if (extra !== 0 && extra !== 1)
    throw new Error("흑은 백과 같거나 하나 많아야 한다");
  const board = emptyBoard();
  const moves: number[] = [];
  const put = (name: string, stone: 1 | 2) => {
    const at = pointAt(name);
    if (board[at] !== 0) throw new Error(`${name}에 이미 돌이 있다`);
    board[at] = stone;
    moves.push(at);
  };
  black.forEach((name, i) => {
    put(name, 1);
    const w = white[i];
    if (w !== undefined) put(w, 2);
  });
  return {
    rules: options.rules ?? STANDARD_RULES,
    board,
    moves,
    blackSeat: extra === 0 ? 0 : 1,
    roundNumber: 1,
    wins: [0, 0],
    phase: "play",
    result: null,
    continued: [false, false],
    // 튜토리얼 장면은 시간을 재지 않는다.
    clocks: null,
  };
}
