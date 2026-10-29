// @vitest-environment node
import {
  captureMoves,
  groupOf,
  lifeKeyMoves,
  lifeWrongMovesFail,
  passAliveStones,
  pointName,
  step,
} from "@mighty/baduk-engine";
import { describe, expect, it } from "vitest";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  lifeProblem,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "./study";

type Capture = Extract<BadukPuzzle, { kind: "capture" }>;
type Life = Extract<BadukPuzzle, { kind: "life" }>;

const all = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles);
const captures = all.filter((p): p is Capture => p.kind === "capture");
const lives = all.filter((p): p is Life => p.kind === "life");
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);
const name = (p: number) => pointName(p, PUZZLE_SIZE);

/** 사활을 읽는 깊이(두 편 합): 빈 자리 수의 두 배와 조금 */
const lifeDepth = (p: Life) => Math.min(16, 2 * p.area.length + 2);

describe("바둑 문제 데이터", () => {
  it("문제 번호는 겹치지 않고, 묶음마다 다섯 개 이상이다", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const set of BADUK_PUZZLE_SETS)
      expect(set.puzzles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(all))(
    "%s: 흑이 둘 차례이고, 판의 모든 돌에 활로가 있다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(state.toPlay).toBe(1);
      state.board.forEach((cell, at) => {
        if (cell)
          expect(groupOf(state.board, at).liberties.length).toBeGreaterThan(0);
      });
      expect(state.board[targetOf(p)]).toBe(
        p.kind === "life" && p.goal === "live" ? 1 : 2,
      );
      expect(state.board[solutionOf(p)]).toBe(0);
    },
  );
});

describe("잡기 문제(단수 방향·축·장문)", () => {
  it.each(rows(captures))(
    "%s: 정해진 수 안에 따내는 첫 수는 정답 하나뿐이고, 더 빨리는 못 따낸다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const target = targetOf(p);
      expect(groupOf(board, target).liberties).toHaveLength(2);
      expect(captureMoves(board, 1, target, p.within).map(name)).toEqual([
        p.solution,
      ]);
      expect(captureMoves(board, 1, target, p.within - 1)).toEqual([]);
    },
  );

  it.each(rows(captures))(
    "%s: 모양이 맞다(축은 첫 수가 단수, 장문은 첫 수가 활로가 아니다)",
    (_id, p) => {
      const { board } = puzzleState(p);
      const libs = groupOf(board, targetOf(p)).liberties;
      if (p.theme === "net") expect(libs).not.toContain(solutionOf(p));
      else expect(libs).toContain(solutionOf(p));
    },
  );

  it.each(rows(captures))(
    "%s: 정답대로 두고 백이 버티는 대로 받으면, 정해진 수 안에 따내고 해설이 나온다",
    (_id, p) => {
      let state = puzzleState(p);
      const target = targetOf(p);
      let move = solutionOf(p);
      for (let i = 0; i < p.within; i++) {
        const verdict = judgeMove(p, state, move, i);
        expect(verdict).not.toBe("wrong");
        const before = state.board;
        const mine = step(state, 0, { type: "place", at: move });
        if (!mine.ok) throw new Error(mine.error);
        state = mine.state;
        if (verdict === "solved") {
          expect(state.board[target]).toBe(0);
          expect(explainSolved(p, before, move, i + 1).length).toBe(3);
          return;
        }
        const theirs = step(state, 1, defenseFor(p, state, i));
        if (!theirs.ok) throw new Error(theirs.error);
        state = theirs.state;
        // 다음 수: 남은 수 안에 따내는 첫 수
        const next = captureMoves(state.board, 1, target, p.within - i - 1);
        expect(next.length).toBeGreaterThan(0);
        move = next[0] as number;
      }
      throw new Error("정해진 수 안에 따내지 못했다");
    },
  );

  it.each(rows(captures))("%s: 첫 수로 다른 자리는 틀린 것이다", (_id, p) => {
    const state = puzzleState(p);
    const wrong = state.board.findIndex(
      (cell, at) => cell === 0 && at !== solutionOf(p),
    );
    expect(judgeMove(p, state, wrong, 0)).toBe("wrong");
  });
});

describe("사활 문제(두 눈 만들기·눈 빼앗기)", () => {
  it.each(rows(lives))(
    "%s: 처음에는 산 모양이 아니고, 정답은 하나뿐이며 다른 수는 반대 결과가 된다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const problem = lifeProblem(p);
      const owner = board[problem.target] as 1 | 2;
      expect(passAliveStones(board, owner).has(problem.target)).toBe(false);
      const keys = lifeKeyMoves(board, problem, 1, lifeDepth(p));
      expect(keys.map(name)).toEqual([p.solution]);
      expect(lifeWrongMovesFail(board, problem, 1, lifeDepth(p), keys)).toBe(
        true,
      );
    },
  );

  it.each(rows(lives))("%s: 정답만 푼 것이고 해설이 나온다", (_id, p) => {
    const state = puzzleState(p);
    const other = p.area.find((a) => a !== p.solution) as string;
    expect(judgeMove(p, state, solutionOf(p), 0)).toBe("solved");
    expect(judgeMove(p, state, solutionOf({ ...p, solution: other }), 0)).toBe(
      "wrong",
    );
    expect(explainSolved(p, state.board, solutionOf(p), 1).length).toBe(3);
  });
});
