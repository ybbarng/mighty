import type { PlayerClock } from "@mighty/engine";
import type { Move, Piece, Position, Promotion, Side } from "./board";
import type { ChessRules } from "./rules";

/** play: 두기 / roundEnd: 판 끝 / gameOver: 게임 끝 */
export type Phase = "play" | "roundEnd" | "gameOver";

/**
 * 비긴 까닭
 * - stalemate: 둘 차례인데 체크가 아니면서 둘 수가 없다
 * - fifty: 50수 동안 폰을 움직이지도 기물을 잡지도 않았다
 * - repetition: 같은 판이 세 번 나왔다
 * - material: 어느 편도 체크메이트할 기물이 없다
 * - timeout: 시간을 다 썼지만 상대가 체크메이트할 기물이 없다
 */
export type DrawReason =
  | "stalemate"
  | "fifty"
  | "repetition"
  | "material"
  | "timeout";

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  | { kind: "checkmate"; seat: number }
  | { kind: "resign"; seat: number }
  /** 상대가 시간을 다 썼다 */
  | { kind: "time"; seat: number }
  | { kind: "draw"; reason: DrawReason };

/** 둔 수 하나 */
export interface Played {
  side: Side;
  from: number;
  to: number;
  piece: Piece;
  /** 잡은 기물(앙파상 포함) */
  captured: Piece | null;
  promotion?: Promotion;
  /** 기보 표기("Nf3", "O-O", "e8=Q+") */
  san: string;
}

export interface ChessState {
  rules: ChessRules;
  /** 지금 판 모양(기물 자리, 둘 차례, 캐슬링 권리, 앙파상 칸, 50수 셈) */
  position: Position;
  /** 이번 판에 둔 수, 둔 차례대로 */
  played: Played[];
  /** 이번 판에 백을 쥔 자리. 판마다 바뀐다 */
  whiteSeat: number;
  roundNumber: number;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  /** 비긴 판 수 */
  draws: number;
  phase: Phase;
  result: RoundResult | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 개인 시간(자리마다 남은 기본 시간·초읽기). 시간 규칙이 없으면 null */
  clocks: PlayerClock[] | null;
  /** 이번 판에 나온 판 모양 열쇠(`positionKey`). 같은 것이 세 번 나오면 비긴다 */
  positions: string[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  /** `promotion`: 폰이 끝줄에 닿을 때 바꿀 기물. `spent`: 이 수에 쓴 시간(ms). 대국을 돌리는 기기가 싣는다 */
  | {
      type: "move";
      from: number;
      to: number;
      promotion?: Promotion;
      spent?: number;
    }
  /** 시간을 다 썼다. 대국을 돌리는 기기가 그 자리로 기록에 남긴다 */
  | { type: "timeout"; spent: number }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; whiteSeat: number }
  | {
      type: "moved";
      seat: number;
      side: Side;
      from: number;
      to: number;
      piece: Piece;
      captured: Piece | null;
      promotion?: Promotion;
      /** 캐슬링이면 킹 쪽(K)·퀸 쪽(Q) */
      castle?: "K" | "Q";
      san: string;
    }
  /** 이 수로 `side` 킹이 체크를 받는다 */
  | { type: "check"; side: Side }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

/** 한 자리에서 본 화면. 감출 것이 없어 상태 그대로에 내 자리를 더한다 */
export interface ChessView extends ChessState {
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null */
  decision: { kind: "move" } | { kind: "continue" } | null;
  /** 내 차례에 둘 수 있는 수(승급은 기물마다 따로) */
  legal: Move[];
  /** 지금 체크를 받는 편 */
  check: Side | null;
}
