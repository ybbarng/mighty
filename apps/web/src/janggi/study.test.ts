import { negamax } from "@mighty/janggi-ai";
import {
  applyMove,
  forcesMate,
  inCheck,
  type Kind,
  kingsFacing,
  legalMoves,
  type Move,
  mateInMoves,
  mateInOneMoves,
  mateInThreeMoves,
  mateInTwoMoves,
  PIECE_VALUE,
  pointName,
  pseudoTargets,
  step,
} from "@mighty/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS, type JanggiPuzzle } from "./puzzles";
import {
  cannonOpening,
  defenseFor,
  explainBlock,
  explainCannon,
  explainFork,
  explainMate,
  explainTrade,
  judgeMove,
  legBlock,
  parseMove,
  puzzleState,
} from "./study";

type Mate = Extract<JanggiPuzzle, { kind: "mate" }>;
type Fork = Extract<JanggiPuzzle, { kind: "fork" }>;
type Trade = Extract<JanggiPuzzle, { kind: "trade" }>;

const all = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles);
const mates = all.filter((p): p is Mate => p.kind === "mate");
const forks = all.filter((p): p is Fork => p.kind === "fork");
const trades = all.filter((p): p is Trade => p.kind === "trade");

/** 두 수 앞까지 읽은 초 쪽 값(점수 ×100) */
const scoreOf = (board: Parameters<typeof applyMove>[0], m: Move) =>
  -negamax(applyMove(board, m), "h", 2, -Infinity, Infinity, {
    bikjangScore: true,
  });
const name = (m: Move) => `${pointName(m.from)}-${pointName(m.to)}`;
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);

/** 두 수 앞을 읽으면 정답이 가장 낫고, 둘째로 나은 수보다 졸 하나 반(150점 ×2) 이상 낫다 */
function expectClearBest(p: JanggiPuzzle) {
  const board = puzzleState(p).board;
  const scored = legalMoves(board, "c")
    .map((m) => ({ m, s: scoreOf(board, m) }))
    .sort((a, b) => b.s - a.s);
  expect(name(scored[0]?.m as Move)).toBe(p.solution);
  expect((scored[0]?.s ?? 0) - (scored[1]?.s ?? 0)).toBeGreaterThanOrEqual(300);
}

describe("포 길 열기 문제", () => {
  it.each(rows(all.filter((p) => p.kind === "cannon")))(
    "%s: 정답 수로 포가 새로 상대 큰 기물(또는 궁)을 노리고, 그 수가 가장 낫다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const open = cannonOpening(board, move);
      expect(open).not.toBeNull();
      expect(board[move.from]).not.toBe("cC");
      // 지금 잡을 수 있는 기물이 없는 조용한 판에서 낸다.
      expect(legalMoves(board, "c").every((m) => board[m.to] === "")).toBe(
        true,
      );
      expect(explainCannon(board, move)[0]).toMatch(/노린다/);
      expectClearBest(p);
    },
  );
});

describe("멱 막기 문제", () => {
  it.each(rows(all.filter((p) => p.kind === "block")))(
    "%s: 정답 수가 상대 마·상의 멱을 막아 내 큰 기물을 지키고, 그 수가 가장 낫다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const block = legBlock(board, move);
      expect(block).not.toBeNull();
      // 막는 수는 빈칸으로 간다(잡으면서 막는 것은 이 문제가 아니다).
      expect(board[move.to]).toBe("");
      expect(explainBlock(board, move)[0]).toMatch(/멱을 막아/);
      expectClearBest(p);
    },
  );
});

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

  it.each(rows(mates.filter((p) => p.mateIn === 3)))(
    "%s: 두 수 안 외통은 없고, 세 수 외통의 첫 수는 정답 하나뿐이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(forcesMate(board, "c", 2)).toBe(false);
      expect(mateInThreeMoves(board, "c").map(name)).toEqual([p.solution]);
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
            : ((mateInOneMoves(state.board, "c")[0] ??
                mateInMoves(state.board, "c", p.mateIn - i)[0]) as Move);
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

describe("잡을까 말까 문제", () => {
  it.each(rows(trades))(
    "%s: 정답과 함정이 모두 잡는 수이고, 정답은 이득·함정은 손해다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const solution = parseMove(p.solution);
      const trap = parseMove(p.trap);
      expect(board[solution.to]?.startsWith("h")).toBe(true);
      expect(board[trap.to]?.startsWith("h")).toBe(true);
      expect(p.trap).not.toBe(p.solution);
      const scored = legalMoves(board, "c")
        .map((m) => ({ m, s: scoreOf(board, m) }))
        .sort((a, b) => b.s - a.s);
      expect(name(scored[0]?.m as Move)).toBe(p.solution);
      expect(scored[0]?.s ?? 0).toBeGreaterThanOrEqual(100);
      expect((scored[0]?.s ?? 0) - (scored[1]?.s ?? 0)).toBeGreaterThanOrEqual(
        300,
      );
      expect(scoreOf(board, trap)).toBeLessThanOrEqual(-150);
      expect(explainTrade(board, solution, trap)).toHaveLength(2);
    },
  );
});

describe("판정", () => {
  it("정답이 아닌 첫 수는 틀린 것이다", () => {
    for (const p of [
      mates[0],
      forks[0],
      trades[0],
      mates.find((m) => m.mateIn === 2),
    ]) {
      if (!p) throw new Error("문제 없음");
      const state = puzzleState(p);
      const move = legalMoves(state.board, "c").find(
        (m) => name(m) !== p.solution,
      );
      if (!move) throw new Error("다른 수 없음");
      expect(judgeMove(p, state, move, 0)).toBe("wrong");
    }
  });

  it("세 수 외통의 가운데 수는 외통으로 이어지지 않으면 틀린 것이다", () => {
    const p = mates.find((m) => m.mateIn === 3);
    if (!p) throw new Error("문제 없음");
    const first = step(puzzleState(p), 0, {
      type: "move",
      ...parseMove(p.solution),
    });
    if (!first.ok) throw new Error(first.error);
    const reply = step(first.state, 1, defenseFor(first.state));
    if (!reply.ok) throw new Error(reply.error);
    const state = reply.state;
    const moves = legalMoves(state.board, "c");
    const good = mateInMoves(state.board, "c", 2);
    const bad = moves.filter((m) => !good.some((g) => name(g) === name(m)));
    expect(good.length).toBeGreaterThan(0);
    expect(bad.length).toBeGreaterThan(0);
    for (const m of good)
      expect(["next", "solved"]).toContain(judgeMove(p, state, m, 1));
    for (const m of bad) expect(judgeMove(p, state, m, 1)).toBe("wrong");
  });

  it("양수겸장은 정답 수면 바로 푼 것이다", () => {
    const p = forks[0];
    if (!p) throw new Error("문제 없음");
    expect(judgeMove(p, puzzleState(p), parseMove(p.solution), 0)).toBe(
      "solved",
    );
  });
});
