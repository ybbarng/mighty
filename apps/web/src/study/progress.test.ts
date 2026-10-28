import { describe, expect, it } from "vitest";

import { nextPuzzle } from "./progress";

describe("다음 문제 고르기", () => {
  it("안 푼 문제를 차례대로 먼저 낸다", () => {
    expect(nextPuzzle(["a", "b", "c"], { a: { solvedAt: 1, misses: 0 } })).toBe(
      "b",
    );
  });

  it("다 풀었으면 많이 틀린 문제를 다시 낸다", () => {
    expect(
      nextPuzzle(["a", "b"], {
        a: { solvedAt: 1, misses: 0 },
        b: { solvedAt: 1, misses: 3 },
      }),
    ).toBe("b");
  });

  it("문제가 없으면 null", () => {
    expect(nextPuzzle([], {})).toBeNull();
  });
});
