import type { Month } from "@mighty/hwatu";

import type { GostopRules } from "./rules";
import type { ScoreBreakdown } from "./score";

/** play: 판 진행 / roundEnd: 판 끝(다음 판을 기다림) / gameOver: 게임 끝 */
export type Phase = "play" | "roundEnd" | "gameOver";

/**
 * 차례 안의 단계.
 * - play: 손패를 낸다(또는 폭탄·뒤집기만)
 * - chooseHand: 낸 카드와 같은 달이 바닥에 둘 → 어느 것을 먹을지
 * - chooseFlip: 뒤집은 카드와 같은 달이 바닥에 둘 → 어느 것을 먹을지
 * - goStop: 점수가 나서 고·스톱을 고른다
 */
export type Stage = "play" | "chooseHand" | "chooseFlip" | "goStop";

/** 바닥에 쌓인 같은 달 석 장(뻑). 주인이 없으면 처음 깔 때 석 장이 깔린 것 */
export interface Stack {
  month: Month;
  owner: number | null;
}

/** 지금 차례에서 진행 중인 것(모두 공개 정보다) */
export interface PendingTurn {
  /** 낸 손패(뒤집기만 하는 차례면 null). 폭탄이면 첫 장 */
  card: string | null;
  /** 폭탄으로 낸 석 장 */
  bomb: string[] | null;
  /** 낸 카드에 맞은 바닥 카드 수(0·1·2·3) */
  matched: number;
  /** 낸 카드로 먹을 카드(낸 카드 포함). 뻑·따닥에 따라 바뀐다 */
  handPair: string[];
  /** 고를 바닥 카드 둘(고르는 단계에서만) */
  options: string[];
  /** 뒤집은 카드 */
  flipped: string | null;
  /** 이 차례에 먹은 카드 */
  captures: string[];
  /** 상대마다 빼앗을 피 장수 */
  steals: number;
}

/** 박 종류: 피박·광박·멍박·고박 */
export type Bak = "pi" | "gwang" | "meong" | "go";

/** 판 정산 */
export interface Settlement {
  /** stop: 스톱해 이김 / chongtong: 총통 / nagari: 아무도 못 남(다음 판 두 배) */
  kind: "stop" | "chongtong" | "nagari";
  winner: number | null;
  breakdown: ScoreBreakdown | null;
  /** 이긴 사람의 고 횟수 */
  goCount: number;
  /** 고 덤: 1고 +1, 2고 +2(3고부터는 +2에 두 배씩) */
  goBonus: number;
  /** 곱하는 수: 3고부터 2배씩, 흔들기·폭탄 2배씩, 앞 판 나가리 2배씩 */
  goDouble: number;
  shakeDouble: number;
  nagariDouble: number;
  /** 진 사람 한 명이 내는 기본 점수(박 전) */
  points: number;
  /** 자리마다 걸린 박 */
  baks: Bak[][];
  /** 자리마다 점수 변화(이긴 사람 +, 진 사람 −, 합은 0) */
  deltas: number[];
  /** 3명 고박: 고를 부르고 진 사람이 진 사람 몫을 모두 낸다 */
  payer: number | null;
  /** 총통 달 */
  month?: Month;
}

export interface GostopState {
  rules: GostopRules;
  /** 판마다 섞을 때 쓰는 시드(숨김) */
  seed: number;
  roundNumber: number;
  /** 이번 판 선(먼저 내는 자리) */
  dealer: number;
  /** 자리마다 손패(숨김) */
  hands: string[][];
  /** 바닥 카드 */
  floor: string[];
  /** 더미. 0번이 맨 위(숨김) */
  deck: string[];
  /** 자리마다 먹은 패 */
  captured: string[][];
  /** 바닥에 쌓인 뻑 */
  stacks: Stack[];
  /** 지금 차례인 자리 */
  turn: number;
  stage: Stage;
  pending: PendingTurn | null;
  /** 지난 차례 요약(화면 연출) */
  lastTurn: PendingTurn | null;
  /** 이번 판 자리마다 고 횟수 */
  goCount: number[];
  /** 마지막 고를 부를 때 점수. 이보다 더 나야 다시 묻는다 */
  lastGoScore: number[];
  /** 가장 나중에 고를 부른 자리 */
  lastGoSeat: number | null;
  /** 흔들기·폭탄 횟수(한 번마다 두 배) */
  shakes: number[];
  /** 흔들 때 보여 준 카드(아직 손에 있는 것) */
  revealed: string[][];
  /** 폭탄 뒤 손패 없이 뒤집기만 하는 차례 수 */
  flipOwed: number[];
  /** 이번 판 뻑 횟수 */
  ppeok: number[];
  /** 앞 판까지 이어진 나가리 수(한 번마다 두 배) */
  nagari: number;
  /** 게임 점수(판 정산 합, 합은 0) */
  scores: number[];
  /** 판마다 정산 */
  history: Settlement[];
  phase: Phase;
  /** 이번 판 정산(판 끝) */
  result: Settlement | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 같은 판 처음 깔린 바닥에 같은 달 넉 장이 있어 다시 섞은 횟수 */
  redeals: number;
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  /** 손패 한 장을 낸다. `shake`: 같은 달 석 장을 들고 바닥에 없을 때 흔든다(두 배) */
  | { type: "play"; card: string; shake?: true }
  /** 폭탄: 같은 달 석 장을 들고 바닥에 한 장이 있을 때 석 장을 한꺼번에 낸다 */
  | { type: "bomb"; month: Month }
  /** 폭탄 뒤 남은 차례: 손패를 내지 않고 뒤집기만 한다 */
  | { type: "flip" }
  /** 같은 달 둘 가운데 먹을 바닥 카드 */
  | { type: "choose"; card: string }
  | { type: "go" }
  | { type: "stop" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

/** 특별한 일: 뻑·쪽·따닥·싹쓸이·뻑 먹기·자뻑·흔들기·폭탄 */
export type Special =
  | "ppeok"
  | "jjok"
  | "ttadak"
  | "sweep"
  | "stack"
  | "selfStack"
  | "shake"
  | "bomb";

export type GameEvent =
  | {
      type: "roundStarted";
      roundNumber: number;
      dealer: number;
      nagari: number;
      redeals: number;
    }
  | { type: "played"; seat: number; card: string; shake?: true }
  | { type: "bombed"; seat: number; cards: string[] }
  | { type: "flipOnly"; seat: number }
  | { type: "flipped"; seat: number; card: string }
  | { type: "chose"; seat: number; card: string }
  | { type: "captured"; seat: number; cards: string[] }
  | { type: "special"; seat: number; kind: Special }
  | { type: "stolen"; from: number; to: number; card: string }
  | { type: "go"; seat: number; count: number; score: number }
  | { type: "stopped"; seat: number; score: number }
  | { type: "roundEnded"; settlement: Settlement; scores: number[] }
  | { type: "gameEnded"; scores: number[]; retired?: true };

/** 지금 내가 할 일 */
export type Decision =
  | {
      kind: "play";
      /** 낼 수 있는 손패 */
      cards: string[];
      /** 흔들 수 있는 손패(그 달 석 장) */
      shakeable: string[];
      /** 폭탄을 할 수 있는 달 */
      bombs: Month[];
      /** 뒤집기만 할 수 있다(폭탄 뒤) */
      flip: boolean;
    }
  | { kind: "choose"; options: string[]; source: "hand" | "flip" }
  | { kind: "goStop"; score: number; goCount: number }
  | { kind: "continue" };

/** 한 자리에서 본 화면. 남의 손패와 더미 순서, 시드는 없다(장수만) */
export interface GostopView
  extends Omit<GostopState, "hands" | "deck" | "seed"> {
  mySeat: number;
  hand: string[];
  handCounts: number[];
  deckCount: number;
  /** 자리마다 지금 점수(먹은 패) */
  liveScores: number[];
  decision: Decision | null;
}

export interface LoggedAction {
  seat: number;
  action: Action;
}
