import { describe, expect, it } from "vitest";

import { isSealedForMe, sealedFor } from "./spoiler";

describe("isSealedForMe", () => {
  const mine = new Set([3, 5]);
  it("내가 응모했고 결과가 나왔는데 열어 보지 않은 회차만 가린다", () => {
    expect(isSealedForMe(3, mine, new Set(), true)).toBe(true);
  });
  it("추첨을 열어 본 회차는 보인다", () => {
    expect(isSealedForMe(3, mine, new Set([3]), true)).toBe(false);
  });
  it("내가 응모하지 않은 회차는 보인다", () => {
    expect(isSealedForMe(4, mine, new Set(), true)).toBe(false);
  });
  it("결과가 아직 없으면 가릴 것이 없다", () => {
    expect(isSealedForMe(5, mine, new Set(), false)).toBe(false);
  });
});

describe("sealedFor", () => {
  it("응모권·열어 본 회차·장부 기록으로 판정한다", () => {
    const sealed = sealedFor(
      [
        { ticket: { round: 1 } },
        { ticket: { round: 2 } },
        { ticket: { round: 3 } },
      ],
      new Set([2]),
      { record: (r) => (r <= 2 || r === 9 ? {} : undefined) },
    );
    expect([1, 2, 3, 9].map(sealed)).toEqual([true, false, false, false]);
  });
});
