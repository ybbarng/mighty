import { describe, expect, it } from "vitest";

import {
  baseBoard,
  type Cell,
  inCheck,
  kingsFacing,
  legalMoves,
  materialScore,
  type Piece,
  placeSetup,
  pointAt,
  pointName,
  pseudoTargets,
} from "./board";
import { CELLS } from "./rules";

/** 기물만 놓은 판 */
function boardOf(pieces: Record<string, Piece>): Cell[] {
  const board = new Array<Cell>(CELLS).fill("");
  for (const [name, piece] of Object.entries(pieces))
    board[pointAt(name)] = piece;
  return board;
}

/** 그 자리 기물이 갈 수 있는 곳 이름(정렬) */
function targets(pieces: Record<string, Piece>, from: string): string[] {
  return pseudoTargets(boardOf(pieces), pointAt(from)).map(pointName).sort();
}

describe("자리 이름(기보 관례: 세로 줄 1~0 + 가로 줄 1~9)", () => {
  it("초 궁은 95, 한 궁은 25, 초 왼쪽 차는 01", () => {
    const board = baseBoard();
    expect(pointName(board.indexOf("cK"))).toBe("95");
    expect(pointName(board.indexOf("hK"))).toBe("25");
    expect(board[pointAt("01")]).toBe("cR");
  });

  it("pointName과 pointAt은 서로 반대다", () => {
    for (let at = 0; at < CELLS; at++) expect(pointAt(pointName(at))).toBe(at);
    expect(() => pointAt("50")).toThrow();
  });
});

describe("상차림", () => {
  it("마상마상은 내 편에서 본 왼쪽부터 마·상·…·마·상이다(한은 판에서 거꾸로)", () => {
    const board = baseBoard();
    placeSetup(board, "c", "NENE");
    placeSetup(board, "h", "NENE");
    expect(["02", "03", "07", "08"].map((n) => board[pointAt(n)])).toEqual([
      "cN",
      "cE",
      "cN",
      "cE",
    ]);
    // 한의 왼쪽은 판의 오른쪽(18)이다.
    expect(["18", "17", "13", "12"].map((n) => board[pointAt(n)])).toEqual([
      "hN",
      "hE",
      "hN",
      "hE",
    ]);
    expect(board.filter((c) => c.startsWith("c"))).toHaveLength(16);
    expect(board.filter((c) => c.startsWith("h"))).toHaveLength(16);
  });

  it("상마마상은 바깥에 상, 안에 마", () => {
    const board = baseBoard();
    placeSetup(board, "c", "ENNE");
    expect(["02", "03", "07", "08"].map((n) => board[pointAt(n)])).toEqual([
      "cE",
      "cN",
      "cN",
      "cE",
    ]);
  });
});

describe("기물 움직임", () => {
  it("차: 가로·세로 직선으로 막힐 때까지, 상대 기물은 잡는다", () => {
    expect(targets({ "55": "cR" }, "55")).toHaveLength(17);
    const blocked = targets({ "55": "cR", "53": "cP", "57": "hP" }, "55");
    expect(blocked).toContain("54");
    expect(blocked).not.toContain("53");
    expect(blocked).toContain("57");
    expect(blocked).not.toContain("58");
  });

  it("차: 궁성 대각선 위에서는 대각선으로도 간다(모서리 → 가운데 → 맞은편 모서리)", () => {
    const t = targets({ "84": "cR" }, "84");
    expect(t).toContain("95");
    expect(t).toContain("06");
    // 궁성 변 가운데(85)는 대각선이 없다.
    expect(targets({ "85": "cR" }, "85")).not.toContain("94");
  });

  it("포: 기물 하나를 넘어서만 가고, 넘은 뒤 첫 상대 기물을 잡는다", () => {
    const t = targets({ "51": "cC", "54": "cP", "57": "hR" }, "51");
    expect(t).not.toContain("52");
    expect(t).not.toContain("53");
    expect(t).toEqual(expect.arrayContaining(["55", "56", "57"]));
    expect(t).not.toContain("58");
  });

  it("포: 포는 넘을 수도 잡을 수도 없다", () => {
    expect(targets({ "51": "cC", "54": "hC" }, "51")).not.toContain("55");
    const t = targets({ "51": "cC", "54": "cP", "57": "hC" }, "51");
    expect(t).not.toContain("57");
  });

  it("포: 궁성 모서리에서 가운데 기물을 넘어 맞은편 모서리로", () => {
    expect(targets({ "84": "cC", "95": "cA" }, "84")).toContain("06");
    expect(targets({ "84": "cC" }, "84")).not.toContain("06");
  });

  it("마: 직선 한 칸 + 대각선 한 칸. 직선 칸이 막히면(멱) 그쪽 둘을 못 간다", () => {
    expect(targets({ "55": "cN" }, "55")).toHaveLength(8);
    const blocked = targets({ "55": "cN", "45": "cP" }, "55");
    expect(blocked).toHaveLength(6);
    expect(blocked).not.toContain("34");
    expect(blocked).not.toContain("36");
  });

  it("상: 직선 한 칸 + 대각선 두 칸. 지나는 칸이 막히면 못 간다", () => {
    const free = targets({ "55": "cE" }, "55");
    expect(free).toHaveLength(8);
    expect(free).toContain("23");
    // 대각선 첫 칸(34)이 막히면 23으로 못 간다.
    expect(targets({ "55": "cE", "34": "hP" }, "55")).not.toContain("23");
  });

  it("졸: 앞과 옆으로 한 칸, 뒤로는 못 간다(초는 위, 한은 아래가 앞)", () => {
    expect(targets({ "65": "cP" }, "65")).toEqual(["55", "64", "66"]);
    expect(targets({ "65": "hP" }, "65")).toEqual(["64", "66", "75"]);
  });

  it("졸: 상대 궁성 안에서는 앞쪽 대각선 선을 따라서도 간다", () => {
    expect(targets({ "34": "cP" }, "34")).toEqual(["24", "25", "33", "35"]);
    expect(targets({ "25": "cP" }, "25")).toEqual([
      "14",
      "15",
      "16",
      "24",
      "26",
    ]);
  });

  it("궁·사: 궁성 안에서 선을 따라 한 칸", () => {
    expect(targets({ "95": "cK" }, "95")).toHaveLength(8);
    expect(targets({ "85": "cK" }, "85")).toEqual(["84", "86", "95"]);
    expect(targets({ "04": "cA" }, "04")).toEqual(["05", "94", "95"]);
  });
});

describe("장군과 둘 수 있는 수", () => {
  it("궁 앞이 트인 줄에 상대 차가 있으면 장군이다", () => {
    const board = boardOf({ "95": "cK", "15": "hR", "24": "hK" });
    expect(inCheck(board, "c")).toBe(true);
  });

  it("내 궁이 잡히게 되는 수(묶인 기물 옮기기)는 둘 수 없다", () => {
    const board = boardOf({ "95": "cK", "75": "cR", "35": "hR", "24": "hK" });
    const moves = legalMoves(board, "c").filter(
      (m) => m.from === pointAt("75"),
    );
    // 같은 세로줄로만 움직일 수 있다(상대 차를 잡는 것까지).
    expect(moves.map((m) => pointName(m.to)).sort()).toEqual([
      "35",
      "45",
      "55",
      "65",
      "85",
    ]);
  });

  it("빅장: 두 궁이 같은 세로줄에서 사이에 기물 없이 마주 본다", () => {
    expect(kingsFacing(boardOf({ "95": "cK", "25": "hK" }))).toBe(true);
    expect(kingsFacing(boardOf({ "95": "cK", "25": "hK", "65": "cP" }))).toBe(
      false,
    );
    // 빅장 금지 규칙이면 사이 기물을 비키는 수는 둘 수 없다.
    const board = boardOf({ "95": "cK", "25": "hK", "65": "cP" });
    const pawn = (forbidden: boolean) =>
      legalMoves(board, "c", forbidden).filter((m) => m.from === pointAt("65"));
    expect(
      pawn(false)
        .map((m) => pointName(m.to))
        .sort(),
    ).toEqual(["55", "64", "66"]);
    expect(pawn(true).map((m) => pointName(m.to))).toEqual(["55"]);
  });

  it("남은 기물 점수: 차 13·포 7·마 5·상 3·사 3·졸 2, 한은 덤 1.5", () => {
    const board = baseBoard();
    placeSetup(board, "c", "NENE");
    placeSetup(board, "h", "NENE");
    expect(materialScore(board, "c")).toBe(72);
    expect(materialScore(board, "h")).toBe(73.5);
  });
});
