// @vitest-environment node
import { evaluate, MATE, negamax, newContext } from "@mighty/chess-ai";
import {
  applyMove,
  legalMoves,
  type Move,
  moveToSan,
  type Position,
} from "@mighty/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS, type ChessPuzzle } from "./puzzles";
import { judgeMove, puzzleState, solutionMove } from "./study";
import { explainTactic, TACTIC_NAMES, tacticsOf } from "./tactics";

type TacticPuzzle = Extract<ChessPuzzle, { kind: "tactic" }>;

const tactics = CHESS_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p): p is TacticPuzzle => p.kind === "tactic",
);
const rows = (ps: readonly TacticPuzzle[]) => ps.map((p) => [p.id, p] as const);

/** 백이 이 수를 둔 뒤 세 수(흑·백·흑) 앞과 잡기 끝까지 읽은 백 쪽 값(폰 100) */
const scoreAfter = (pos: Position, move: Move) =>
  -negamax(applyMove(pos, move), 3, -Infinity, Infinity, newContext());

/**
 * 이 수의 값이 limit 이하인지만 판정한다(같은 깊이, 좁은 창). negamax는 fail-soft 알파베타라
 * 상대 쪽 값이 -limit 이상으로 나오면 참값도 그 이상, 곧 이 수는 limit 이하다.
 * 정확한 값을 다 읽지 않아 빠르다.
 */
const atMost = (pos: Position, move: Move, limit: number) =>
  negamax(applyMove(pos, move), 3, -limit - 1, -limit, newContext()) >= -limit;

describe("체스 전술 문제 데이터", () => {
  it("포크·핀·스큐어·발견 공격이 모두 있다", () => {
    const kinds = new Set(tactics.map((p) => p.tactic));
    expect([...kinds].sort()).toEqual(
      Object.keys(TACTIC_NAMES).sort() as string[],
    );
  });

  it.each(rows(tactics))(
    "%s: 정답 수가 문제가 말하는 전술 모양이고, 잡는 수가 아니다",
    (_id, p) => {
      const { position } = puzzleState(p);
      const move = solutionMove(p);
      expect(position.board[move.to]).toBe("");
      expect(tacticsOf(position, move).map((s) => s.tactic)).toContain(
        p.tactic,
      );
      expect(explainTactic(position, move, p.tactic)[0]).toContain(
        `(${TACTIC_NAMES[p.tactic]})`,
      );
    },
  );

  it.each(rows(tactics))(
    "%s: 엔진으로 읽으면 정답이 기물을 확실히 얻고(폰 둘 이상), 다른 수는 폰 둘 이상 못하다",
    (_id, p) => {
      const { position } = puzzleState(p);
      const solution = solutionMove(p);
      // 정답 수만 정확한 값을 읽는다
      const best = scoreAfter(position, solution);
      // 메이트 문제가 아니다(메이트가 되면 전술이 아니라 메이트 문제다).
      expect(Math.abs(best)).toBeLessThan(MATE / 2);
      expect(best - evaluate(position.board, "w")).toBeGreaterThanOrEqual(200);
      // 다른 모든 수는 정답보다 폰 둘 이상 못하다(곧 정답이 가장 좋은 수이고 2등과 200 이상 차이)
      const others = legalMoves(position).filter(
        (m) => moveToSan(position, m) !== p.solution,
      );
      expect(others.length).toBeGreaterThan(0);
      const close = others
        .filter((m) => !atMost(position, m, best - 200))
        .map((m) => moveToSan(position, m));
      expect(close).toEqual([]);
    },
  );

  it("정답이 아닌 수는 틀린 것이고, 정답이면 바로 푼 것이다", () => {
    for (const p of tactics) {
      const state = puzzleState(p);
      const answer = solutionMove(p);
      const wrong = legalMoves(state.position).find(
        (m) => moveToSan(state.position, m) !== p.solution,
      );
      expect(judgeMove(p, state, answer, 0)).toBe("solved");
      expect(judgeMove(p, state, wrong as Move, 0)).toBe("wrong");
    }
  });
});
