import type { Cell, Forbidden, Stone } from "./board";
import type { OmokRules } from "./rules";

export type Phase = "play" | "roundEnd" | "gameOver";

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  | { kind: "five"; seat: number; stone: Stone; line: number[] }
  | { kind: "resign"; seat: number }
  | { kind: "draw" };

export interface OmokState {
  rules: OmokRules;
  /** 길이 225. 자리 번호는 y*15+x */
  board: Cell[];
  /** 이번 판에 둔 자리, 둔 차례대로. 흑이 먼저다 */
  moves: number[];
  /** 이번 판에 흑을 쥔 자리. 판마다 바뀐다 */
  blackSeat: number;
  roundNumber: number;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  phase: Phase;
  result: RoundResult | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  | { type: "place"; at: number }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; blackSeat: number }
  | { type: "placed"; seat: number; at: number; stone: Stone }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

/** 한 자리에서 본 화면. 감출 것이 없어 상태 그대로에 내 자리를 더한다 */
export interface OmokView extends OmokState {
  mySeat: number;
  /** 내 차례면 금지 자리와 그 이름(판에 ×로 보인다) */
  forbidden: { at: number; reason: Forbidden }[];
}
