import {
  applyMove,
  inCheck,
  isCheckmate,
  legalMoves,
  type Move,
  mateInOneMoves,
  mateInTwoMoves,
  moveToSan,
  step,
} from "@mighty/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS, type ChessPuzzle } from "./puzzles";
import {
  defenseFor,
  explainMate,
  judgeMove,
  puzzleState,
  solutionMove,
} from "./study";

const all = CHESS_PUZZLE_SETS.flatMap((s) => s.puzzles);
const rows = (ps: readonly ChessPuzzle[]) => ps.map((p) => [p.id, p] as const);
const mates = all.filter((p) => p.kind === "mate");
const one = mates.filter((p) => p.kind === "mate" && p.mateIn === 1);
const two = mates.filter((p) => p.kind === "mate" && p.mateIn === 2);

describe("체스 문제 데이터", () => {
  it("한 수 10개 이상, 두 수 6개 이상이고 번호가 겹치지 않는다", () => {
    expect(one.length).toBeGreaterThanOrEqual(10);
    expect(two.length).toBeGreaterThanOrEqual(6);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it.each(rows(all))(
    "%s: 백이 둘 차례이고, 어느 편도 체크가 아닌 판에서 시작한다",
    (_id, p) => {
      const { position } = puzzleState(p);
      expect(position.turn).toBe("w");
      expect(inCheck(position.board, "w")).toBe(false);
      expect(inCheck(position.board, "b")).toBe(false);
    },
  );
});

describe("메이트 문제", () => {
  it.each(rows(one))("%s: 한 수 메이트는 정답 하나뿐이다", (_id, p) => {
    const { position } = puzzleState(p);
    const found = mateInOneMoves(position).map((m) => moveToSan(position, m));
    expect(found).toEqual([p.solution]);
  });

  it.each(rows(two))(
    "%s: 한 수 메이트는 없고, 두 수 메이트의 첫 수는 정답 하나뿐이다",
    (_id, p) => {
      const { position } = puzzleState(p);
      expect(mateInOneMoves(position)).toEqual([]);
      const found = mateInTwoMoves(position).map((m) => moveToSan(position, m));
      expect(found).toEqual([p.solution]);
    },
  );

  it.each(rows(two))(
    "%s: 정답 뒤 고수가 받아도 다음 수에 메이트가 있다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(judgeMove(p, state, solutionMove(p), 0)).toBe("next");
      const first = step(state, 0, { type: "move", ...solutionMove(p) });
      if (!first.ok) throw new Error(first.error);
      const reply = defenseFor(first.state);
      const second = step(first.state, 1, reply);
      if (!second.ok) throw new Error(second.error);
      const mates = mateInOneMoves(second.state.position);
      expect(mates.length).toBeGreaterThan(0);
      expect(judgeMove(p, second.state, mates[0] as Move, 1)).toBe("solved");
    },
  );

  it.each(rows(all))("%s: 메이트도 정답도 아닌 수는 틀린 수다", (_id, p) => {
    const state = puzzleState(p);
    const answer = solutionMove(p);
    const wrong = legalMoves(state.position).find(
      (m) =>
        m.from !== answer.from && !isCheckmate(applyMove(state.position, m)),
    );
    expect(wrong).toBeDefined();
    expect(judgeMove(p, state, wrong as Move, 0)).toBe("wrong");
  });

  it("해설은 체크한 기물과 킹이 피할 칸을 말한다", () => {
    const p = one[0] as ChessPuzzle;
    const lines = explainMate(puzzleState(p).position, solutionMove(p));
    expect(lines[0]).toBe("룩을 b8로(Rb8#): 체크!");
    expect(lines.join(" ")).toContain("흑 자기 기물이 막고 있다");
    expect(lines.at(-1)).toBe("막거나 잡을 수도 없어 체크메이트다");
  });
});
