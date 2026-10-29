import { HOME } from "./board";
import { chainCommit, derivedSeed } from "./chain";
import { createMatch } from "./match";
import { STANDARD_RULES, type ThrowValue, type YutRules } from "./rules";
import type { Phase, YutState } from "./state";

/** 장면의 말 하나: 편과 점(HOME·DONE 또는 판 점), 지나온 길(빽도 장면에서만) */
export interface ScenarioPiece {
  side: number;
  point: number;
  trail?: number[];
}

/**
 * 튜토리얼 장면: 정해진 말 자리와 모아 둔 결과에서 시작하는 상태를 만든다.
 * 사슬은 모든 자리가 재료(시드)로 약속해 둔 상태라, 장면 뒤에도 던지기가 이어진다(내 자리도 재료로 공개한다).
 * `pieces`에 적지 않은 말은 처음(HOME)에 있다
 */
export function createYutScenario(options: {
  rules?: YutRules;
  seed?: number;
  turn?: number;
  pieces: ScenarioPiece[];
  pending?: ThrowValue[];
  throwsLeft?: number;
}): YutState {
  const rules = options.rules ?? STANDARD_RULES;
  const { state } = createMatch(rules, options.seed ?? 1);
  const pending = options.pending ?? [];
  const throwsLeft = options.throwsLeft ?? (pending.length > 0 ? 0 : 1);
  const phase: Phase =
    throwsLeft > 0 ? "throw" : pending.length > 0 ? "move" : "throw";
  const pieces = state.pieces.map((p) => ({
    ...p,
    point: HOME,
    trail: [] as number[],
  }));
  for (const placed of options.pieces) {
    const free = pieces.find((p) => p.side === placed.side && p.point === HOME);
    if (!free) throw new Error("장면의 말이 규칙의 말 수보다 많다");
    free.point = placed.point;
    free.trail = [...(placed.trail ?? [])];
  }
  return {
    ...state,
    phase,
    turn: options.turn ?? 0,
    pieces,
    pending: [...pending],
    throwsLeft,
    chains: state.keys.map((key) => {
      const commit = chainCommit(derivedSeed(key, 0));
      return { commit, last: commit, used: 0 };
    }),
  };
}
