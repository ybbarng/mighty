import { describe, expect, it } from "vitest";

import {
  CHAIN_LENGTH,
  chainCommit,
  chainHash,
  chainLink,
  derivedSeed,
  seatKey,
  sticksFrom,
  valueOfSticks,
} from "./chain";
import { throwOdds } from "./rules";

describe("해시 사슬", () => {
  const seed = derivedSeed(seatKey(7, 0), 0);

  it("고리를 해시하면 앞 고리가 된다", () => {
    for (const i of [1, 2, 300, CHAIN_LENGTH]) {
      expect(chainHash(chainLink(seed, i))).toBe(chainLink(seed, i - 1));
    }
    expect(chainLink(seed, 0)).toBe(chainCommit(seed));
    expect(chainLink(seed, CHAIN_LENGTH)).toBe(seed);
  });

  it("같은 재료·세대면 같은 씨앗, 다르면 다른 씨앗", () => {
    expect(derivedSeed(seatKey(7, 0), 0)).toBe(seed);
    expect(derivedSeed(seatKey(7, 0), 1)).not.toBe(seed);
    expect(derivedSeed(seatKey(7, 1), 0)).not.toBe(seed);
  });
});

describe("가락과 결과", () => {
  it("평평한 개수로 정하고, 표시 가락 하나만이면 빽도", () => {
    const rules = { backDo: true };
    expect(valueOfSticks([false, false, false, false], rules)).toBe(5);
    expect(valueOfSticks([true, false, false, false], rules)).toBe(-1);
    expect(valueOfSticks([false, true, false, false], rules)).toBe(1);
    expect(valueOfSticks([true, true, false, false], rules)).toBe(2);
    expect(valueOfSticks([true, true, true, false], rules)).toBe(3);
    expect(valueOfSticks([true, true, true, true], rules)).toBe(4);
    expect(valueOfSticks([true, false, false, false], { backDo: false })).toBe(
      1,
    );
  });

  it("확률은 합이 1이고, 많이 던지면 확률대로 나온다", () => {
    const rules = { flatPercent: 60 as const, backDo: true };
    const odds = throwOdds(rules);
    expect(odds.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 10);
    const counts = new Map<number, number>();
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const value = valueOfSticks(
        sticksFrom(i, [`${i}`.padStart(64, "0")], rules.flatPercent),
        rules,
      );
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const { value, p } of odds) {
      // 표준편차의 5배 안(해시는 정해진 값이라 늘 같은 결과가 나온다)
      const sd = Math.sqrt(n * p * (1 - p));
      expect(Math.abs((counts.get(value) ?? 0) - n * p)).toBeLessThan(5 * sd);
    }
  });
});
