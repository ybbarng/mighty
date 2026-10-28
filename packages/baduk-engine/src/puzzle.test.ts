import { describe, expect, it } from "vitest";

import { type Cell, emptyBoard, pointAt } from "./board";
import {
  canCapture,
  canKill,
  canLive,
  captureMoves,
  lifeKeyMoves,
  passAliveStones,
} from "./puzzle";

const SIZE = 9;
const p = (name: string) => pointAt(name, SIZE);

function board(black: string[], white: string[]): Cell[] {
  const b = emptyBoard(SIZE);
  for (const n of black) b[p(n)] = 1;
  for (const n of white) b[p(n)] = 2;
  return b;
}

describe("벤슨 방법(쉬어도 사는 무리)", () => {
  it("떨어진 두 눈이 있는 귀 무리는 산다", () => {
    const b = board(["B9", "A8", "B8", "C8", "D8", "D9"], []);
    expect(passAliveStones(b, 1).has(p("B9"))).toBe(true);
  });

  it("한 눈뿐인 무리는 살았다고 보지 않는다", () => {
    const b = board(["B9", "A8", "B8"], []);
    expect(passAliveStones(b, 1).has(p("B9"))).toBe(false);
  });
});

describe("잡기 읽기", () => {
  it("활로 하나인 돌은 한 수에 따낸다", () => {
    const b = board(["C5", "D6", "E5"], ["D5"]);
    expect(captureMoves(b, 1, p("D5"), 1)).toEqual([p("D4")]);
  });

  it("쉬어도 활로가 남으면 정한 수 안에 따낼 수 없다", () => {
    const b = board([], ["E5"]);
    expect(canCapture(b, 1, p("E5"), 3)).toBe(false);
  });
});

describe("사활 읽기", () => {
  // 귀의 곧은 세 집(A9·A8·A7)을 백이 둘러쌌다. 가운데(A8)가 급소다.
  const b = board(
    ["C9", "C8", "C7", "C6", "A5", "B5"],
    ["B9", "B8", "B7", "A6", "B6"],
  );
  const problem = { target: p("B9"), area: [p("A9"), p("A8"), p("A7")] };

  it("백이 먼저 두면 급소를 차지해 산다", () => {
    expect(canLive(b, problem, 2, 8)).toBe(true);
  });

  it("흑이 먼저 급소에 두면 끝내 따낸다. 급소는 하나뿐이다", () => {
    expect(lifeKeyMoves(b, problem, 1, 8)).toEqual([p("A8")]);
    expect(canKill(b, problem, 1, 8)).toBe(true);
  });
});
