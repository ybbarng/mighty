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
      const scored = legalMoves(position)
        .map((m) => ({ m, s: scoreAfter(position, m) }))
        .sort((a, b) => b.s - a.s);
      const [best, second] = scored;
      if (!best || !second) throw new Error("수가 모자라다");
      expect(moveToSan(position, best.m)).toBe(p.solution);
      // 메이트 문제가 아니다(메이트가 되면 전술이 아니라 메이트 문제다).
      expect(Math.abs(best.s)).toBeLessThan(MATE / 2);
      expect(best.s - evaluate(position.board, "w")).toBeGreaterThanOrEqual(
        200,
      );
      expect(best.s - second.s).toBeGreaterThanOrEqual(200);
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
