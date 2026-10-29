import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./bytes";
import { drawNumbers, drawSeed, rankOf } from "./draw";

// drand quicknet 1000000회차 난수(drand.test.ts의 실제 값)
const RANDOMNESS = fromHex(
  "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
);

describe("당첨 번호", () => {
  // 같은 값을 파이썬 hashlib으로 따로 계산해 맞춰 봤다(규칙 문서만 보고 짠 다른 구현)
  it("시험 값: 회차 1 + 실제 drand 난수 → seed → 번호", () => {
    const seed = drawSeed(1, RANDOMNESS);
    expect(toHex(seed)).toBe(
      "7b7a451b60cccb19ef15e24b8880f62c7961ecce5ea34daf6e68bf82101a22f1",
    );
    expect(drawNumbers(seed)).toEqual({
      order: [45, 29, 5, 38, 37, 41, 4],
      numbers: [5, 29, 37, 38, 41, 45],
      bonus: 4,
    });
  });

  it("회차가 다르면 같은 난수라도 다른 seed", () => {
    expect(toHex(drawSeed(1, RANDOMNESS))).not.toBe(
      toHex(drawSeed(2, RANDOMNESS)),
    );
  });

  it("어떤 seed든 1~45의 서로 다른 7개, 당첨 번호는 오름차순", () => {
    for (let round = 1; round <= 300; round++) {
      const draw = drawNumbers(drawSeed(round, RANDOMNESS));
      expect(new Set(draw.order).size).toBe(7);
      for (const n of draw.order) expect(n >= 1 && n <= 45).toBe(true);
      expect(draw.numbers).toEqual(
        [...draw.order.slice(0, 6)].sort((a, b) => a - b),
      );
      expect(draw.bonus).toBe(draw.order[6]);
    }
  });
});

describe("등수(6/45 로또와 같다)", () => {
  const draw = { numbers: [3, 11, 19, 27, 38, 44], bonus: 7 };

  it("1등 6개, 2등 5개 + 보너스, 3등 5개, 4등 4개, 5등 3개, 그 밖은 낙첨", () => {
    expect(rankOf(draw, [3, 11, 19, 27, 38, 44])).toBe(1);
    expect(rankOf(draw, [3, 7, 11, 19, 27, 38])).toBe(2);
    expect(rankOf(draw, [3, 8, 11, 19, 27, 38])).toBe(3);
    expect(rankOf(draw, [3, 7, 8, 11, 19, 27])).toBe(4);
    expect(rankOf(draw, [1, 2, 3, 7, 11, 19])).toBe(5);
    expect(rankOf(draw, [1, 2, 3, 7, 11, 20])).toBeNull();
  });
});
