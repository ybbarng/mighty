import { describe, expect, it } from "vitest";

import {
  type Cell,
  emptyBoard,
  forbiddenReason,
  indexOf,
  legalMoves,
  pointName,
  winningLine,
} from "./board";

/**
 * 글자 그림으로 판을 만든다. X 흑, O 백, ? 시험할 자리, 나머지는 빈칸.
 * 그림의 왼쪽 위를 (3, 3)에 놓아 판 가장자리에 닿지 않게 한다. `edge`면 (0, 0)에 놓는다
 */
function parse(rows: string[], edge = false): { board: Cell[]; at: number } {
  const board = emptyBoard();
  const offset = edge ? 0 : 3;
  let at = -1;
  rows.forEach((row, y) => {
    [...row.replaceAll(" ", "")].forEach((ch, x) => {
      const i = indexOf(x + offset, y + offset);
      if (ch === "X") board[i] = 1;
      else if (ch === "O") board[i] = 2;
      else if (ch === "?") at = i;
    });
  });
  return { board, at };
}

/** `?`에 돌을 두고 이긴 줄을 본다 */
function winAfter(
  rows: string[],
  stone: 1 | 2,
  variant: "standard" | "free" | "renju",
) {
  const { board, at } = parse(rows);
  board[at] = stone;
  return winningLine(board, at, variant);
}

describe("자리 이름", () => {
  it("가운데는 H8, 왼쪽 위는 A15, 오른쪽 아래는 O1", () => {
    expect(pointName(indexOf(7, 7))).toBe("H8");
    expect(pointName(indexOf(0, 0))).toBe("A15");
    expect(pointName(indexOf(14, 14))).toBe("O1");
  });
});

describe("다섯 줄", () => {
  it("가로·세로·대각선 다섯이 이긴다", () => {
    expect(winAfter(["X X ? X X"], 1, "standard")).toHaveLength(5);
    expect(winAfter(["X", "X", "?", "X", "X"], 1, "standard")).toHaveLength(5);
    expect(
      winAfter(["X....", ".X...", "..?..", "...X.", "....X"], 1, "standard"),
    ).toHaveLength(5);
    expect(
      winAfter(["....X", "...X.", "..?..", ".X...", "X...."], 1, "standard"),
    ).toHaveLength(5);
  });

  it("넷은 이기지 않는다", () => {
    expect(winAfter(["X X ? X ."], 1, "standard")).toBeNull();
  });

  it("여섯: 일반은 이기지 않고, 자유는 이긴다", () => {
    expect(winAfter(["X X ? X X X"], 1, "standard")).toBeNull();
    expect(winAfter(["X X ? X X X"], 1, "free")).toHaveLength(6);
  });

  it("렌주: 백 여섯은 이기고, 흑 여섯은 이기지 않는다", () => {
    expect(winAfter(["O O ? O O O"], 2, "renju")).toHaveLength(6);
    expect(winAfter(["X X ? X X X"], 1, "renju")).toBeNull();
  });
});

describe("금지 수", () => {
  const doubleThree = [
    ". . . . . .",
    ". . X . . .",
    ". . X . . .",
    ". . ? X X .",
    ". . . . . .",
  ];

  it("열린 삼 둘을 한 번에 만드는 3·3: 일반은 흑·백 모두, 렌주는 흑만, 자유는 없음", () => {
    const { board, at } = parse(doubleThree);
    expect(forbiddenReason(board, at, 1, "standard")).toBe("3·3");
    expect(forbiddenReason(board, at, 1, "renju")).toBe("3·3");
    expect(forbiddenReason(board, at, 1, "free")).toBeNull();
    const white = board.map((c) => (c === 1 ? 2 : c)) as Cell[];
    expect(forbiddenReason(white, at, 2, "standard")).toBe("3·3");
    expect(forbiddenReason(white, at, 2, "renju")).toBeNull();
  });

  it("떨어진 삼(X.XX)도 열린 삼으로 센다", () => {
    const { board, at } = parse([
      ". . . . . . .",
      ". . X . . . .",
      ". . . . . . .",
      ". . X . . . .",
      ". . ? X . X .",
      ". . . . . . .",
    ]);
    expect(forbiddenReason(board, at, 1, "standard")).toBe("3·3");
  });

  it("한쪽이 막힌 삼은 열린 삼이 아니라 3·3이 아니다", () => {
    const { board, at } = parse([
      ". . . . . .",
      ". . X . . .",
      ". . X . . .",
      ". O ? X X .",
      ". . . . . .",
    ]);
    // 가로 O?XX. 는 사가 되어도 한쪽이 막혀 열린 사가 아니다.
    expect(forbiddenReason(board, at, 1, "standard")).toBeNull();
  });

  it("판 가장자리에 막힌 삼은 열린 삼이 아니다", () => {
    const { board, at } = parse(
      ["? X X . .", "X . . . .", "X . . . .", ". . . . .", ". . . . ."],
      true,
    );
    expect(forbiddenReason(board, at, 1, "standard")).toBeNull();
  });

  it("4·3은 금지가 아니다", () => {
    const { board, at } = parse([
      ". . . . . . .",
      ". . X . . . .",
      ". . X . . . .",
      ". . X . . . .",
      ". . ? X X . .",
      ". . . . . . .",
    ]);
    expect(forbiddenReason(board, at, 1, "standard")).toBeNull();
    expect(forbiddenReason(board, at, 1, "renju")).toBeNull();
  });

  it("렌주 4·4: 두 줄에 사를 한 번에", () => {
    const { board, at } = parse([
      ". . . . . . . .",
      ". . . . X . . .",
      ". . . . X . . .",
      ". . . . X . . .",
      "O X X X ? . . .",
      ". . . . . . . .",
    ]);
    expect(forbiddenReason(board, at, 1, "renju")).toBe("4·4");
    expect(forbiddenReason(board, at, 1, "standard")).toBeNull();
  });

  it("렌주 같은 줄 4·4(X.XX?.X)", () => {
    const { board, at } = parse(["X . X X ? . X"]);
    expect(forbiddenReason(board, at, 1, "renju")).toBe("4·4");
  });

  it("렌주 장목은 흑에게 금지, 그러나 다섯을 만들면 금지가 아니다", () => {
    expect(
      forbiddenReason(
        parse(["X X ? X X X"]).board,
        parse(["X X ? X X X"]).at,
        1,
        "renju",
      ),
    ).toBe("장목");
    // 3·3 모양이라도 다섯이 되면 이긴다.
    const { board, at } = parse([
      ". . . . . . . .",
      ". . X . . . . .",
      ". . X . . . . .",
      "X X ? X X . . .",
      ". . . . . . . .",
    ]);
    expect(forbiddenReason(board, at, 1, "renju")).toBeNull();
  });

  it("빈 판에서는 어디든 둘 수 있다", () => {
    expect(legalMoves(emptyBoard(), 1, "renju")).toHaveLength(225);
  });
});
