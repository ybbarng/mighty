import type { Cell, Kind, Move, Piece, Setup, Side } from "./board";
import type { JanggiRules } from "./rules";

/** setup: 상차림 고르기(한 → 초 차례) / play: 두기 / roundEnd: 판 끝 / gameOver: 게임 끝 */
export type Phase = "setup" | "play" | "roundEnd" | "gameOver";

/** 점수로 가린 까닭 */
export type ScoreReason = "bikjang" | "repetition" | "limit" | "passes";

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  | { kind: "checkmate"; seat: number }
  | { kind: "resign"; seat: number }
  | {
      kind: "score";
      seat: number;
      reason: ScoreReason;
      /** 초·한 점수(한은 덤 포함) */
      scores: { c: number; h: number };
    };

/** 둔 수 하나. 쉬기는 from·to가 없다 */
export type Played =
  | { side: Side; from: number; to: number; captured: Kind | null }
  | { side: Side; pass: true };

export interface JanggiState {
  rules: JanggiRules;
  /** 길이 90. 자리 번호는 y*9+x, 초가 아래(y=9 쪽) */
  board: Cell[];
  /** 이번 판에 둔 수, 둔 차례대로. 초가 먼저다 */
  played: Played[];
  /** 이번 판에 초를 쥔 자리. 판마다 바뀐다 */
  choSeat: number;
  /** 편마다 고른 상차림(아직이면 null) */
  setups: { c: Setup | null; h: Setup | null };
  roundNumber: number;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  phase: Phase;
  result: RoundResult | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 지금까지 나온 판 모양(둘 차례 포함). 같은 모양이 세 번 나오면 점수로 가린다 */
  positions: string[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  | { type: "setup"; setup: Setup }
  | { type: "move"; from: number; to: number }
  /** 한 수 쉬기. 장군을 받는 중에는 못 한다 */
  | { type: "pass" }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; choSeat: number }
  | { type: "setupChosen"; seat: number; side: Side; setup: Setup }
  | {
      type: "moved";
      seat: number;
      side: Side;
      from: number;
      to: number;
      piece: Piece;
      captured: Piece | null;
    }
  | { type: "passed"; seat: number; side: Side }
  /** 이 수로 `side` 궁이 장군을 받는다 */
  | { type: "check"; side: Side }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

/** 한 자리에서 본 화면. 감출 것이 없어 상태 그대로에 내 자리를 더한다 */
export interface JanggiView extends JanggiState {
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null(온라인 참가자가 차례 아닐 때 보내지 않는다) */
  decision: { kind: "setup" } | { kind: "move" } | { kind: "continue" } | null;
  /** 내 차례에 둘 수 있는 수 */
  legal: Move[];
  /** 지금 장군을 받는 편 */
  check: Side | null;
}
