import type { Card, RngState } from "@mighty/engine";

import type { HeartsRules } from "./rules";

/** 카드를 넘기는 방향. 왼쪽은 다음 차례 사람이다(시계 방향으로 돈다) */
export type PassDirection = "left" | "right" | "across" | "none";

export interface Play {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  plays: Play[];
}

export interface CompletedTrick extends Trick {
  winner: number;
}

export type Phase = "passing" | "play" | "roundEnd" | "gameOver";

export interface RoundState {
  phase: Phase;
  direction: PassDirection;
  hands: Card[][];
  /** 자리마다 고른 넘길 카드. 모두 고르면 한꺼번에 넘긴다 */
  passes: (Card[] | null)[];
  /** 자리마다 이번 판에 받은 카드 */
  received: Card[][];
  trickIndex: number;
  trick: Trick | null;
  tricks: CompletedTrick[];
  /** 자리마다 먹은 카드 */
  taken: Card[][];
  heartsBroken: boolean;
  turn: number | null;
  /** 판이 끝나면: 자리마다 이번 판 점수(문 슛 반영 후) */
  roundPoints: number[] | null;
  moonShooter: number | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
}

export interface MatchState {
  rules: HeartsRules;
  rng: RngState;
  /** 자리 번호. 0, 1, 2, 3 순서로 돈다 */
  players: number[];
  /** 게임 점수 합계. 낮을수록 좋다 */
  scores: number[];
  /** 판마다 받은 점수(종이 점수판) */
  history: number[][];
  roundNumber: number;
  round: RoundState;
}

export type Action =
  | { type: "pass"; cards: Card[] }
  | {
      type: "play";
      card: Card;
      /** 손패를 펼쳐 놓은 순서에서 몇 번째 카드였는가. 연출용 */
      slot?: number;
    }
  | { type: "continue" };

export type Decision =
  | { kind: "pass"; direction: PassDirection; count: number }
  | { kind: "play"; cards: Card[]; leading: boolean }
  | { kind: "continue" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; direction: PassDirection }
  | { type: "dealt"; handSize: number }
  | { type: "passChosen"; seat: number }
  | { type: "passed"; direction: PassDirection }
  | { type: "played"; seat: number; card: Card; slot: number | null }
  | { type: "heartsBroken" }
  | { type: "trickWon"; seat: number; trickIndex: number; points: number }
  | {
      type: "roundScored";
      points: number[];
      moonShooter: number | null;
      scores: number[];
    }
  | { type: "gameOver"; winners: number[] };

export interface LoggedAction {
  seat: number;
  action: Action;
}
