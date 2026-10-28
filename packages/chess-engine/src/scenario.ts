import { parseFen, positionKey, type Side } from "./board";
import { type ChessRules, STANDARD_RULES } from "./rules";
import type { ChessState } from "./state";

/** 튜토리얼·문제 장면: FEN으로 쓴 판 모양 */
export interface ChessScenarioOptions {
  rules?: ChessRules;
  /** 판 모양. 둘 차례·캐슬링 권리까지 FEN으로 쓴다 */
  fen: string;
  /** 0번 자리(나)의 편. 없으면 FEN의 둘 차례 편(늘 내가 먼저 둔다) */
  me?: Side;
}

/** 정해진 장면에서 시작하는 첫 판 */
export function createChessScenario(options: ChessScenarioOptions): ChessState {
  const position = parseFen(options.fen);
  const me = options.me ?? position.turn;
  return {
    rules: options.rules ?? STANDARD_RULES,
    position,
    played: [],
    whiteSeat: me === "w" ? 0 : 1,
    roundNumber: 1,
    wins: [0, 0],
    draws: 0,
    phase: "play",
    result: null,
    continued: [false, false],
    // 튜토리얼·문제 장면은 시간을 재지 않는다.
    clocks: null,
    positions: [positionKey(position)],
  };
}
