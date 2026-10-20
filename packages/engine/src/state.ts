import type { Card, Suit } from "./cards";
import type { Goal } from "./goal";
import type { RngState } from "./rng";
import type { RuleSet } from "./rules";
import type { ScoreResult } from "./scoring";

/** 프렌드 지정. 원작 `CGoal.nFriend`. */
export type FriendDeclaration =
  | { kind: "none" }
  | { kind: "firstTrick" }
  | { kind: "player"; seat: number }
  | { kind: "card"; card: Card };

export type Action =
  /** 2마: 앞면(0)과 뒷면(1) 중 하나를 고른다 */
  | { type: "pick"; index: 0 | 1 }
  | { type: "bid"; goal: Goal }
  | { type: "pass" }
  | { type: "dealMiss" }
  /** 6·7마: 죽일 카드 지목 */
  | { type: "kill"; card: Card }
  /** 특권: 공약(바꾸지 않아도 된다)과 버릴 카드 */
  | { type: "exchange"; goal: Goal; discard: Card[] }
  | { type: "friend"; friend: FriendDeclaration }
  | {
      type: "play";
      card: Card;
      /** 선이 조커를 낼 때 지정하는 무늬 */
      jokerSuit?: Suit;
      /** 선이 조커콜 카드를 낼 때 조커콜을 선언하는가 */
      jokerCall?: boolean;
    }
  /** 판이 끝난 뒤 다음 판으로 */
  | { type: "continue" }
  /** 그만두기. 한 명이라도 그만두면 게임이 끝난다 */
  | { type: "retire" };

export type Phase =
  | "pick"
  | "election"
  | "kill"
  | "exchange"
  | "friend"
  | "play"
  | "roundEnd"
  | "gameOver";

export interface TrickPlay {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  plays: TrickPlay[];
  jokerSuit: Suit | null;
  jokerCalled: boolean;
}

export interface CompletedTrick extends Trick {
  winner: number;
}

/** 원작 `aanHistory`: 자리별 득점·도움·실점·점유율. */
export interface RoundHistory {
  scored: number[];
  assist: number[];
  lost: number[];
  share: number[];
}

export interface ElectionState {
  /** 지금까지 가장 높은 공약과 부른 사람 */
  goal: Goal | null;
  bidder: number | null;
  passed: boolean[];
  /** 선거 응답 기록 */
  log: { seat: number; bid: Goal | null }[];
}

export interface RoundState {
  phase: Phase;
  /** 이번 판 선(첫 공약자, 딜 시작) */
  beginner: number;
  /** 이번 판에 참가하는 자리, 차례 순서대로. 6·7마에서 죽은 사람은 빠진다 */
  players: number[];
  /** 지금 결정할 자리. `roundEnd`에서는 `null` */
  turn: number | null;
  hands: Card[][];
  /** 아직 나누지 않은 카드. 딜 뒤에는 키티 */
  deck: Card[];
  /** 2마: 지금 차례에게 보여준 두 장 [앞면, 뒷면] */
  pickOffer: [Card, Card] | null;
  pickCount: number;
  election: ElectionState;
  declarer: number | null;
  /** 선거에서 당선된 공약 */
  electedGoal: Goal | null;
  /** 특권 단계 뒤의 최종 공약 */
  goal: Goal | null;
  /** 6·7마 죽이기 */
  kill: { failed: Card[]; dead: number[]; remaining: number };
  discarded: Card[];
  friendDeclaration: FriendDeclaration | null;
  /** 진짜 프렌드. 공개 전에도 엔진은 안다 */
  friend: number | null;
  friendRevealed: boolean;
  trickIndex: number;
  trick: Trick | null;
  tricks: CompletedTrick[];
  jokerUsed: boolean;
  /** 화면에 보이는 득점 더미. 주공과 공개된 프렌드는 쌓지 않는다 */
  pointPiles: Card[][];
  history: RoundHistory;
  result: ScoreResult | null;
  /** 판이 끝난 뒤 다음 판으로 넘어가겠다고 한 자리 */
  continued: boolean[];
}

export interface SeatRecord {
  declarerWins: number;
  declarerLosses: number;
  friendWins: number;
  friendLosses: number;
  oppositionWins: number;
  oppositionLosses: number;
}

export interface MatchState {
  rules: RuleSet;
  rng: RngState;
  /** 판 번호. 딜미스로 다시 한 판도 센다 */
  roundNumber: number;
  /** 차례 순서. `bRandomSeat`면 판마다 0번을 뺀 나머지를 섞는다 */
  order: number[];
  money: number[];
  records: SeatRecord[];
  round: RoundState;
  /** 튜토리얼처럼 정해진 패로 다음 판을 시작할 때 쓴다. 쓰고 나면 비운다 */
  presetDeal: PresetDeal | null;
}

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; beginner: number }
  | { type: "dealt"; handSize: number }
  | { type: "picked"; seat: number }
  | { type: "bid"; seat: number; goal: Goal }
  | { type: "passed"; seat: number }
  | { type: "dealMiss"; seat: number; hand: Card[] }
  | { type: "allPassed" }
  | { type: "elected"; seat: number; goal: Goal }
  | { type: "killAttempt"; seat: number; card: Card; killed: number | null }
  | { type: "redealtForDead" }
  | { type: "kittyTaken"; seat: number; count: number }
  | { type: "exchanged"; seat: number; goal: Goal }
  | { type: "friendDeclared"; friend: FriendDeclaration }
  | {
      type: "played";
      seat: number;
      card: Card;
      jokerSuit: Suit | null;
      jokerCall: boolean;
    }
  | { type: "trickWon"; seat: number; trickIndex: number; points: number }
  | { type: "friendRevealed"; seat: number | null }
  | { type: "roundScored"; result: ScoreResult }
  | { type: "gameOver"; reason: "bankrupt" | "retired" };

/** 정해진 패. `hands`는 자리 번호 순서, `kitty`는 남는 카드. */
export interface PresetDeal {
  hands: Card[][];
  kitty: Card[];
}
