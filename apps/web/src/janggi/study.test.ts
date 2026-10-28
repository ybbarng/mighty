import {
  inCheck,
  kingsFacing,
  legalMoves,
  mateInOneMoves,
  mateInTwoMoves,
  pointName,
  step,
} from "@mighty/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS } from "./puzzles";
import {
  defenseFor,
  explainMate,
  judgeMove,
  parseMove,
  puzzleState,
} from "./study";

const all = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles);
const name = (m: { from: number; to: number }) =>
  `${pointName(m.from)}-${pointName(m.to)}`;

describe("장기 외통 문제 데이터", () => {
  it("문제 번호는 겹치지 않는다", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it.each(all.map((p) => [p.id, p] as const))(
    "%s: 초가 둘 차례이고, 장군도 빅장도 아닌 판에서 시작한다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(inCheck(state.board, "c")).toBe(false);
      expect(inCheck(state.board, "h")).toBe(false);
      expect(kingsFacing(state.board)).toBe(false);
    },
  );

  it.each(all.filter((p) => p.mateIn === 1).map((p) => [p.id, p] as const))(
    "%s: 한 수 외통은 정답 하나뿐이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(mateInOneMoves(board, "c").map(name)).toEqual([p.solution]);
    },
  );

  it.each(all.filter((p) => p.mateIn === 2).map((p) => [p.id, p] as const))(
    "%s: 한 수 외통은 없고, 두 수 외통의 첫 수는 정답 하나뿐이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(mateInOneMoves(board, "c")).toEqual([]);
      expect(mateInTwoMoves(board, "c").map(name)).toEqual([p.solution]);
    },
  );
});

describe("문제 풀기", () => {
  it.each(all.map((p) => [p.id, p] as const))(
    "%s: 정답대로 두면(상대는 고수가 받는다) 외통으로 이기고 해설이 나온다",
    (_id, p) => {
      let state = puzzleState(p);
      for (let i = 0; i < p.mateIn; i++) {
        const move =
          i === 0
            ? parseMove(p.solution)
            : (mateInOneMoves(state.board, "c")[0] as {
                from: number;
                to: number;
              });
        const verdict = judgeMove(p, state, move, i);
        expect(verdict).toBe(i === p.mateIn - 1 ? "solved" : "next");
        if (verdict === "solved") {
          expect(explainMate(state.board, move).length).toBeGreaterThan(1);
        }
        const mine = step(state, 0, { type: "move", ...move });
        if (!mine.ok) throw new Error(mine.error);
        state = mine.state;
        if (state.phase !== "play") break;
        const reply = defenseFor(state);
        const theirs = step(state, 1, reply);
        if (!theirs.ok) throw new Error(theirs.error);
        state = theirs.state;
      }
      expect(state.result).toEqual({ kind: "checkmate", seat: 0 });
    },
  );

  it("외통이 아닌 마지막 수와 정답이 아닌 첫 수는 틀린 것이다", () => {
    const one = all.find((p) => p.mateIn === 1);
    const two = all.find((p) => p.mateIn === 2);
    if (!one || !two) throw new Error("문제 없음");
    /** 정답이 아닌, 둘 수 있는 첫 수 */
    const otherMove = (p: typeof one) => {
      const state = puzzleState(p);
      const move = legalMoves(state.board, "c").find(
        (m) => name(m) !== p.solution,
      );
      if (!move) throw new Error("다른 수 없음");
      return { state, move };
    };
    for (const p of [one, two]) {
      const { state, move } = otherMove(p);
      expect(judgeMove(p, state, move, 0)).toBe("wrong");
    }
  });
});
