import type { PlayerClock } from "@mighty/engine";
import type { BaseballRules } from "./rules";

/**
 * 판의 흐름.
 * setup 비밀 정하기(약속만 기록) → play 맞힐 차례 → answer 비밀 가진 쪽이 답하기 → (play·answer 되풀이)
 * → reveal 판 끝에 비밀과 소금 공개 → roundEnd(다음 판 누르기) 또는 gameOver
 */
export type Phase =
  | "setup"
  | "play"
  | "answer"
  | "reveal"
  | "roundEnd"
  | "gameOver";

/** 이번 판에 물어본 수 하나. 답하기 전에는 strikes·balls가 null */
export interface GuessEntry {
  /** 물어본 자리 */
  seat: number;
  guess: string;
  strikes: number | null;
  balls: number | null;
}

/** 판 끝에 공개한 비밀과 엔진이 다시 계산한 결과 */
export interface RevealEntry {
  secret: string;
  salt: string;
  /** 처음 알린 약속과 맞나 */
  matches: boolean;
  /** 이 비밀로 다시 계산한 답과 다른 첫 답(`guesses` 번호). 모두 맞으면 null */
  wrongAt: number | null;
}

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  /** 먼저 맞혔다(퍼즐은 맞히면 0번 자리 승) */
  | { kind: "hit"; seat: number }
  /** 공정 규칙: 후공이 마지막 기회에 같이 맞혔다 */
  | { kind: "draw" }
  | { kind: "resign"; seat: number }
  /** 상대가 시간을 다 썼다 */
  | { kind: "time"; seat: number }
  /**
   * 공개한 비밀이 약속과 다르거나 답 가운데 비밀과 맞지 않는 것이 있다(`liars`).
   * 한쪽만 그러면 다른 쪽이 이기고, 둘 다면 이긴 사람이 없다(seat null)
   */
  | { kind: "cheat"; seat: number | null; liars: number[] }
  /** 상대가 답하거나 공개하지 않은 채 게임을 끝냈다 */
  | { kind: "forfeit"; seat: number };

export interface BaseballState {
  rules: BaseballRules;
  roundNumber: number;
  /** 이번 판에 먼저 맞히는 자리. 판마다 바뀐다(퍼즐은 늘 0) */
  starter: number;
  phase: Phase;
  /** 자리마다 비밀 수의 약속(SHA-256). 아직 정하지 않았거나 정하지 않는 자리는 null */
  commits: (string | null)[];
  /** 이번 판에 물어본 수, 물어본 차례대로 */
  guesses: GuessEntry[];
  /** 맞힐 차례인 자리(play), 방금 물어본 자리(answer) */
  turn: number;
  /** 자리마다 상대 수를 맞혔나 */
  solved: boolean[];
  /** 공개 전에 정해진 결과. 공개에서 거짓이 드러나면 `result`가 이것과 달라진다 */
  outcome: RoundResult | null;
  reveals: (RevealEntry | null)[];
  /** 판 결과(공개까지 끝난 뒤) */
  result: RoundResult | null;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  /** 개인 시간. 시간 규칙이 없으면 null */
  clocks: PlayerClock[] | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
  /**
   * 자리마다 컴퓨터가 쓰는 비밀 재료(시드에서 만든다). 화면에는 그 자리 것만 보인다(`botKey`).
   * 사람은 쓰지 않는다. 끊긴 사이 컴퓨터가 대신 비밀을 정했을 때만 그 사람이 이것으로 내 수를 다시 안다
   */
  keys: string[];
}

export type Action =
  /** 비밀 수의 약속(SHA-256 16진수 64자) */
  | { type: "commit"; hash: string }
  /** `spent`: 이 수에 쓴 시간(ms). 대국을 돌리는 기기(혼자 하기·방장)가 싣는다 */
  | { type: "guess"; guess: string; spent?: number }
  /** 비밀을 가진 쪽이 방금 물어본 수에 답한다 */
  | { type: "answer"; strikes: number; balls: number }
  /** 판 끝에 비밀과 소금을 공개한다 */
  | { type: "reveal"; secret: string; salt: string }
  /** 시간을 다 썼다. 대국을 돌리는 기기가 그 자리로 기록에 남긴다 */
  | { type: "timeout"; spent: number }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; starter: number }
  | { type: "committed"; seat: number }
  | { type: "guessed"; seat: number; guess: string }
  | {
      type: "answered";
      /** 답한 자리 */
      seat: number;
      guesser: number;
      guess: string;
      strikes: number;
      balls: number;
    }
  | {
      type: "revealed";
      seat: number;
      secret: string;
      matches: boolean;
      wrongAt: number | null;
    }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

export type Decision =
  | { kind: "commit" }
  | { kind: "guess" }
  | { kind: "answer"; guess: string }
  | { kind: "reveal" }
  | { kind: "continue" };

/** 한 자리에서 본 화면. 남의 비밀 재료(`keys`)는 빼고 내 것만 `botKey`로 둔다 */
export interface BaseballView extends Omit<BaseballState, "keys"> {
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null */
  decision: Decision | null;
  /** 이 자리의 비밀 재료(컴퓨터가 이 자리에 앉으면 쓴다) */
  botKey: string;
}
