import { describe, expect, it } from "vitest";

import {
  areaOwners,
  areaScore,
  boardHash,
  type Cell,
  emptyBoard,
  groupOf,
  pointAt,
  pointName,
  starPoints,
  tryPlace,
} from "./board";

/** 그림으로 판을 만든다: X 흑, O 백, . 빈 자리. 첫 줄이 판 위쪽이다 */
function draw(rows: string[]): Cell[] {
  return rows.flatMap((row) =>
    [...row.replace(/ /g, "")].map((c) => (c === "X" ? 1 : c === "O" ? 2 : 0)),
  );
}

describe("자리 이름", () => {
  it("가로는 A~T(I 없음), 세로는 아래가 1이다", () => {
    expect(pointName(0, 9)).toBe("A9");
    expect(pointName(80, 9)).toBe("J1");
    expect(pointName(40, 9)).toBe("E5");
    expect(pointName(18, 19)).toBe("T19");
    expect(pointAt("D4", 19)).toBe(15 * 19 + 3);
    for (const size of [9, 13, 19])
      for (let at = 0; at < size * size; at++)
        expect(pointAt(pointName(at, size), size)).toBe(at);
  });

  it("없는 이름과 판 밖은 받지 않는다", () => {
    expect(() => pointAt("I5", 9)).toThrow();
    expect(() => pointAt("K5", 9)).toThrow();
    expect(() => pointAt("A10", 9)).toThrow();
    expect(() => pointAt("zz", 9)).toThrow();
  });

  it("화점은 9줄 다섯, 13줄 다섯, 19줄 아홉", () => {
    expect(starPoints(9).map((p) => pointName(p, 9))).toEqual([
      "C7",
      "G7",
      "E5",
      "C3",
      "G3",
    ]);
    expect(starPoints(13)).toHaveLength(5);
    expect(starPoints(19)).toHaveLength(9);
    expect(starPoints(19).map((p) => pointName(p, 19))).toContain("K10");
  });
});

describe("따내기와 자살수", () => {
  it("무리와 활로를 센다", () => {
    const board = draw([
      "XX.......",
      "O........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const g = groupOf(board, 0);
    expect(g.stones.sort()).toEqual([0, 1]);
    expect(g.liberties.sort((a, b) => a - b)).toEqual([2, 10]);
  });

  it("마지막 활로를 막으면 한 점을 따낸다", () => {
    const board = draw([
      ".X.......",
      "XO.......",
      ".X.......",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const r = tryPlace(board, pointAt("C8", 9), 1);
    expect(r.ok && r.captured.map((p) => pointName(p, 9))).toEqual(["B8"]);
  });

  it("두 점 무리를 따낸다", () => {
    const board = draw([
      ".XX......",
      "XOOX.....",
      ".X.......",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const r = tryPlace(board, pointAt("C7", 9), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured.map((p) => pointName(p, 9)).sort()).toEqual(["B8", "C8"]);
    expect(r.board[pointAt("B8", 9)]).toBe(0);
  });

  it("활로가 없는 자리는 자살수지만, 따내면서 두면 둘 수 있다", () => {
    const board = draw([
      ".X.......",
      "X........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    expect(tryPlace(board, 0, 2)).toEqual({ ok: false, error: "suicide" });
    expect(tryPlace(board, 1, 2)).toEqual({ ok: false, error: "occupied" });
    const capture = draw([
      ".XO......",
      "XO.......",
      "O........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    // 백이 귀(A9)에 두면 활로가 없어 보이지만 흑 두 점을 따내 산다.
    const r = tryPlace(capture, 0, 2);
    expect(r.ok && r.captured.length).toBe(2);
  });
});

describe("자리 세기(Tromp-Taylor)", () => {
  it("돌과 한 색으로만 둘러싼 빈 자리를 센다. 두 색에 닿은 빈 자리는 누구 것도 아니다", () => {
    const board = draw([
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
      "..X.O....",
    ]);
    // 흑: 돌 9 + 왼쪽 18 = 27, 백: 돌 9 + 오른쪽 36 = 45, 가운데 줄 9는 누구 것도 아니다.
    expect(areaScore(board)).toEqual({ black: 27, white: 45 });
    expect(areaOwners(board)[3]).toBe(0);
  });

  it("빈 판은 아무도 갖지 않는다", () => {
    expect(areaScore(emptyBoard(9))).toEqual({ black: 0, white: 0 });
  });

  it("판 지문은 판 모양마다 다르다", () => {
    const a = emptyBoard(9);
    const b = emptyBoard(9);
    b[40] = 1;
    const c = emptyBoard(9);
    c[40] = 2;
    expect(boardHash(a)).toBe(boardHash(emptyBoard(9)));
    expect(new Set([boardHash(a), boardHash(b), boardHash(c)]).size).toBe(3);
  });
});
