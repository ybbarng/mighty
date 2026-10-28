import { negamax } from "@mighty/janggi-ai";
import {
  applyMove,
  inCheck,
  type Kind,
  kingsFacing,
  legalMoves,
  type Move,
  mateInOneMoves,
  mateInTwoMoves,
  PIECE_VALUE,
  pointName,
  pseudoTargets,
  step,
} from "@mighty/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS, type JanggiPuzzle } from "./puzzles";
import {
  defenseFor,
  explainFork,
  explainMate,
  judgeMove,
  parseMove,
  puzzleState,
} from "./study";

type Mate = Extract<JanggiPuzzle, { kind: "mate" }>;
type Fork = Extract<JanggiPuzzle, { kind: "fork" }>;

const all = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles);
const mates = all.filter((p): p is Mate => p.kind === "mate");
const forks = all.filter((p): p is Fork => p.kind === "fork");
const name = (m: Move) => `${pointName(m.from)}-${pointName(m.to)}`;
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);

describe("장기 문제 데이터", () => {
  it("문제 번호는 겹치지 않는다", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it.each(rows(all))(
    "%s: 초가 둘 차례이고, 장군도 빅장도 아닌 판에서 시작한다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(inCheck(state.board, "c")).toBe(false);
      expect(inCheck(state.board, "h")).toBe(false);
      expect(kingsFacing(state.board)).toBe(false);
    },
  );
});

describe("외통 문제", () => {
  it.each(rows(mates.filter((p) => p.mateIn === 1)))(
    "%s: 한 수 외통은 정답 하나뿐이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(mateInOneMoves(board, "c").map(name)).toEqual([p.solution]);
    },
  );

  it.each(rows(mates.filter((p) => p.mateIn === 2)))(
    "%s: 한 수 외통은 없고, 두 수 외통의 첫 수는 정답 하나뿐이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(mateInOneMoves(board, "c")).toEqual([]);
      expect(mateInTwoMoves(board, "c").map(name)).toEqual([p.solution]);
    },
  );

  it.each(rows(mates))(
    "%s: 정답대로 두면(상대는 고수가 받는다) 외통으로 이기고 해설이 나온다",
    (_id, p) => {
      let state = puzzleState(p);
      for (let i = 0; i < p.mateIn; i++) {
        const move =
          i === 0
            ? parseMove(p.solution)
            : (mateInOneMoves(state.board, "c")[0] as Move);
        const verdict = judgeMove(p, state, move, i);
        expect(verdict).toBe(i === p.mateIn - 1 ? "solved" : "next");
        if (verdict === "solved")
          expect(explainMate(state.board, move).length).toBeGreaterThan(1);
        const mine = step(state, 0, { type: "move", ...move });
        if (!mine.ok) throw new Error(mine.error);
        state = mine.state;
        if (state.phase !== "play") break;
        const theirs = step(state, 1, defenseFor(state));
        if (!theirs.ok) throw new Error(theirs.error);
        state = theirs.state;
      }
      expect(state.result).toEqual({ kind: "checkmate", seat: 0 });
    },
  );
});

describe("양수겸장 문제", () => {
  it.each(rows(forks))(
    "%s: 정답 수 뒤 옮긴 기물이 큰 기물 둘(또는 궁과 큰 기물)을 함께 노린다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const after = applyMove(board, move);
      const big = pseudoTargets(after, move.to).filter((t) => {
        const kind = after[t]?.[1] as Kind | undefined;
        return (
          after[t]?.startsWith("h") &&
          kind !== undefined &&
          (kind === "K" || PIECE_VALUE[kind] >= 5)
        );
      });
      expect(big.length).toBeGreaterThanOrEqual(2);
      // 지금 잡을 수 있는 기물이 없는 조용한 판에서 낸다.
      expect(legalMoves(board, "c").every((m) => board[m.to] === "")).toBe(
        true,
      );
      expect(explainFork(board, move)[0]).toMatch(/함께 노린다/);
    },
  );

  it.each(rows(forks))(
    "%s: 두 수 앞을 읽으면 정답이 다른 모든 수보다 졸 하나 반 이상 낫다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const options = { bikjangScore: true };
      const scored = legalMoves(board, "c")
        .map((m) => ({
          m,
          s: -negamax(
            applyMove(board, m),
            "h",
            2,
            -Infinity,
            Infinity,
            options,
          ),
        }))
        .sort((a, b) => b.s - a.s);
      expect(name(scored[0]?.m as Move)).toBe(p.solution);
      expect((scored[0]?.s ?? 0) - (scored[1]?.s ?? 0)).toBeGreaterThanOrEqual(
        300,
      );
    },
  );
});

describe("판정", () => {
  it("정답이 아닌 첫 수는 틀린 것이다", () => {
    for (const p of [mates[0], forks[0], mates.find((m) => m.mateIn === 2)]) {
      if (!p) throw new Error("문제 없음");
      const state = puzzleState(p);
      const move = legalMoves(state.board, "c").find(
        (m) => name(m) !== p.solution,
      );
      if (!move) throw new Error("다른 수 없음");
      expect(judgeMove(p, state, move, 0)).toBe("wrong");
    }
  });

  it("양수겸장은 정답 수면 바로 푼 것이다", () => {
    const p = forks[0];
    if (!p) throw new Error("문제 없음");
    expect(judgeMove(p, puzzleState(p), parseMove(p.solution), 0)).toBe(
      "solved",
    );
  });
});
