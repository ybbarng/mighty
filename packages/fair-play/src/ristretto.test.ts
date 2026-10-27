import { beforeAll, describe, expect, it } from "vitest";

import { loadRistretto255 } from "./ristretto";
import { combine, newKey, type SraGroup, unlockExponent } from "./sra";

let g: SraGroup;
beforeAll(async () => {
  g = await loadRistretto255();
});

describe("ristretto255 군", () => {
  it("잠근 순서와 상관없이 같고, 열쇠의 역으로 풀면 카드로 돌아온다", () => {
    const m = g.encodeIndex(7);
    const [a, b] = [newKey(g), newKey(g)];
    const ab = g.pow(g.pow(m, a), b);
    expect(g.pow(g.pow(m, b), a)).toBe(ab);
    expect(g.pow(g.pow(ab, unlockExponent(g, a)), unlockExponent(g, b))).toBe(
      m,
    );
    expect(
      g.pow(ab, combine(g, [unlockExponent(g, a), unlockExponent(g, b)])),
    ).toBe(m);
  });

  it("카드 53장은 서로 다른 군의 원소다", () => {
    const cards = Array.from({ length: 53 }, (_, i) => g.encodeIndex(i));
    expect(new Set(cards).size).toBe(53);
    expect(cards.every((c) => g.isElement(c))).toBe(true);
    expect(g.isElement(g.generator)).toBe(true);
  });

  it("곱과 거듭이 맞물린다: x^a · x^b = x^(a+b), 항등원은 원소가 아니다", () => {
    const x = g.encodeIndex(3);
    const [a, b] = [newKey(g), newKey(g)];
    expect(g.mul(g.pow(x, a), g.pow(x, b))).toBe(g.pow(x, (a + b) % g.q));
    expect(g.mul(g.one, x)).toBe(x);
    expect(g.pow(x, g.q)).toBe(g.one);
    expect(g.isElement(g.one)).toBe(false);
  });

  it("표준 인코딩이 아닌 값은 원소로 받지 않는다", () => {
    expect(g.isElement(1n)).toBe(false);
    expect(g.isElement((1n << 256n) - 1n)).toBe(false);
    expect(g.isElement(1n << 256n)).toBe(false);
    expect(g.isElement(g.encodeIndex(0) + 1n)).toBe(false);
  });
});
