import type { Position } from "./board";
import type { Sticks } from "./chain";
import type { ThrowValue, YutRules } from "./rules";

/**
 * 게임의 흐름.
 * commit 자리마다 사슬 약속 → throw 던질 차례 → reveal 모든 자리가 고리 공개(결과가 정해진다)
 * → move 모아 둔 결과로 말 움직이기 → (throw·reveal·move 되풀이) → gameOver
 */
export type Phase = "commit" | "throw" | "reveal" | "move" | "gameOver";

/** 말 하나. 업힌 말은 같은 자리(point·trail)를 함께 가진다 */
export interface Piece extends Position {
  side: number;
}

/** 자리마다 던지기 사슬 */
export interface ChainState {
  /** 약속(x_0). 아직 내지 않았으면 null */
  commit: string | null;
  /** 마지막으로 확인된 고리(처음에는 약속) */
  last: string | null;
  /** 공개한 고리 수 */
  used: number;
}

/** 게임 결과. `side`는 이긴 편(이긴 편이 없으면 null) */
export type GameResult =
  /** 말을 모두 냈다 */
  | { kind: "finish"; side: number }
  /** 기권(`seat`이 기권한 자리) */
  | { kind: "resign"; side: number | null; seat: number }
  /** 공개·약속을 기다리던 사람이 하나뿐인데 끝냈다(그 사람의 편이 진다) */
  | { kind: "forfeit"; side: number | null; seat: number };

/** 직전 던지기(화면 연출용) */
export interface LastThrow {
  seat: number;
  index: number;
  sticks: Sticks;
  value: ThrowValue;
}

export interface YutState {
  rules: YutRules;
  /** 한 판뿐이다(내 기록·복기 공통 틀이 판 번호를 쓴다) */
  roundNumber: number;
  phase: Phase;
  /** 지금 차례인 자리 */
  turn: number;
  /** 편마다 말, 편 번호 순서(편 s의 말은 s * pieces부터) */
  pieces: Piece[];
  /** 이번 차례에 모아 둔 결과(얻은 순서) */
  pending: ThrowValue[];
  /** 이번 차례에 남은 던지기 */
  throwsLeft: number;
  /** 지금까지 한 던지기 수(결과 해시에 들어간다) */
  throwCount: number;
  /** 사슬 세대(다 쓰면 다시 약속한다) */
  generation: number;
  chains: ChainState[];
  /** 이번 던지기에 공개한 고리(공개 전 null) */
  reveals: (string | null)[];
  lastThrow: LastThrow | null;
  result: GameResult | null;
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
  /** 자리마다 사슬 재료(시드에서 만든다). 화면에는 그 자리 것만 보인다(`botKey`) */
  keys: string[];
}

export type Action =
  /** 사슬 약속(x_0, 16진수 64자) */
  | { type: "commit"; hash: string }
  /** 던질 차례인 사람이 던진다 */
  | { type: "throw" }
  /** 이번 던지기에 내 사슬 다음 고리를 공개한다 */
  | { type: "reveal"; link: string }
  /**
   * 모아 둔 결과 하나(`value`)로 말을 움직인다. `from`은 움직일 말이 있는 점, 새 말은 HOME(-1).
   * 그 점의 내 말(업힌 말)이 함께 움직인다
   */
  | { type: "move"; value: ThrowValue; from: number }
  | { type: "resign" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "gameStarted"; turn: number }
  | { type: "committed"; seat: number }
  | { type: "thrown"; seat: number }
  | { type: "revealed"; seat: number }
  | {
      type: "result";
      seat: number;
      index: number;
      sticks: Sticks;
      value: ThrowValue;
      /** 한 번 더 던진다(윷·모) */
      bonus: boolean;
    }
  | {
      type: "moved";
      seat: number;
      side: number;
      value: ThrowValue;
      from: number;
      /** 지나간 점(마지막이 도착 점) */
      path: number[];
      to: number;
      /** 함께 움직인 말 수 */
      count: number;
      /** 이 걸음으로 업은 말 수(도착 점에 있던 내 말) */
      stacked: number;
      /** 잡은 말 수와 그 편 */
      captured: number;
      capturedSide: number | null;
      finished: boolean;
    }
  /** 쓸 수 없는 결과를 버렸다(말이 없는데 빽도) */
  | { type: "discarded"; seat: number; values: ThrowValue[] }
  | { type: "turnStarted"; seat: number }
  | { type: "recommit"; generation: number }
  /** `result`가 null이면 진 사람 없이 중간에 끝냈다 */
  | { type: "gameEnded"; result: GameResult | null; retired?: boolean };

/** 움직일 수 있는 수 하나 */
export interface MoveOption {
  value: ThrowValue;
  from: number;
  /** 도착 점(났으면 DONE) */
  to: number;
  path: number[];
  finished: boolean;
  /** 잡는 상대 말 수 */
  captures: number;
  /** 업는 내 말 수 */
  stacks: number;
}

export type Decision =
  | { kind: "commit" }
  | { kind: "throw" }
  | { kind: "reveal" }
  | { kind: "move"; options: MoveOption[] };

/** 한 자리에서 본 화면. 남의 사슬 재료(`keys`)는 빼고 내 것만 `botKey`로 둔다 */
export interface YutView extends Omit<YutState, "keys"> {
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null */
  decision: Decision | null;
  botKey: string;
}
