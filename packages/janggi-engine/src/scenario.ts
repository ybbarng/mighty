import { type Cell, type Piece, pointAt, type Side } from "./board";
import { positionKey } from "./match";
import { CELLS, type JanggiRules, STANDARD_RULES } from "./rules";
import type { JanggiState } from "./state";

/** 튜토리얼 장면: 판에 놓인 기물. 자리는 "95"처럼 쓴다 */
export interface JanggiScenarioOptions {
  rules?: JanggiRules;
  pieces: Readonly<Record<string, Piece>>;
  /** 0번 자리(나)의 편. 늘 내가 둘 차례로 시작한다 */
  me?: Side;
}

/** 정해진 장면에서 시작하는 첫 판. 상차림은 건너뛰고 바로 두기다 */
export function createJanggiScenario(
  options: JanggiScenarioOptions,
): JanggiState {
  const me = options.me ?? "c";
  const board = new Array<Cell>(CELLS).fill("");
  for (const [name, piece] of Object.entries(options.pieces))
    board[pointAt(name)] = piece;
  const state: JanggiState = {
    rules: options.rules ?? STANDARD_RULES,
    board,
    // 한이 둘 차례면 초가 한 번 쉰 것으로 둔다(둘 차례는 둔 수의 짝홀로 정한다).
    played: me === "h" ? [{ side: "c", pass: true }] : [],
    choSeat: me === "c" ? 0 : 1,
    setups: { c: "NENE", h: "NENE" },
    roundNumber: 1,
    wins: [0, 0],
    phase: "play",
    result: null,
    continued: [false, false],
    // 튜토리얼·문제 장면은 시간을 재지 않는다.
    clocks: null,
    positions: [],
  };
  state.positions = [positionKey(state)];
  return state;
}
