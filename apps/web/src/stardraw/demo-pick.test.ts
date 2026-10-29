// @vitest-environment node
import { RANKS, rankOf } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { demoPick } from "./demo-pick";

describe("데모: n등이 되는 번호", () => {
  const draw = { numbers: [3, 11, 19, 27, 38, 44], bonus: 7 };

  it("고른 등수 그대로 나온다", () => {
    for (const rank of RANKS) {
      const pick = demoPick(draw, rank);
      expect(pick).toHaveLength(6);
      expect(new Set(pick).size).toBe(6);
      expect(rankOf(draw, pick)).toBe(rank);
    }
  });

  it("낙첨은 하나도 맞지 않는다", () => {
    const pick = demoPick(draw, null);
    expect(rankOf(draw, pick)).toBeNull();
    expect(pick.some((n) => draw.numbers.includes(n))).toBe(false);
  });
});
