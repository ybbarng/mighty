import { describe, expect, it } from "vitest";

import {
  combine,
  encodeIndex,
  GROUP_1024,
  GROUP_2048,
  isProbablePrime,
  isQuadraticResidue,
  modPow,
  newKey,
  unlockExponent,
} from "./sra";

describe("SRA 교환 가능한 암호", () => {
  it.each([GROUP_1024, GROUP_2048])(
    "$name: p와 q=(p−1)/2가 모두 소수(안전 소수)",
    (g) => {
      expect(isProbablePrime(g.p)).toBe(true);
      expect(isProbablePrime(g.q)).toBe(true);
    },
  );

  it("잠근 순서와 상관없이 풀린다", () => {
    const g = GROUP_1024;
    const m = encodeIndex(g, 7);
    const [a, b] = [newKey(g), newKey(g)];
    const ab = modPow(modPow(m, a, g.p), b, g.p);
    const ba = modPow(modPow(m, b, g.p), a, g.p);
    expect(ab).toBe(ba);
    // a로 먼저 풀든 b로 먼저 풀든 원래 값
    const back = modPow(
      modPow(ab, unlockExponent(g, a), g.p),
      unlockExponent(g, b),
      g.p,
    );
    expect(back).toBe(m);
    // 여러 열쇠를 지수 곱 하나로 한꺼번에 풀 수 있다
    expect(
      modPow(ab, combine(g, [unlockExponent(g, a), unlockExponent(g, b)]), g.p),
    ).toBe(m);
  });

  it("카드 값은 모두 이차잉여이고, 잠가도 이차잉여다(이차잉여 여부로 정보가 새지 않는다)", () => {
    const g = GROUP_1024;
    const key = newKey(g);
    for (let i = 0; i < 53; i++) {
      const m = encodeIndex(g, i);
      expect(isQuadraticResidue(g, m)).toBe(true);
      expect(isQuadraticResidue(g, modPow(m, key, g.p))).toBe(true);
    }
  });
});
