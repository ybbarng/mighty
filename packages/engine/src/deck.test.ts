import { describe, expect, it } from "vitest";

import { deckFor } from "./deck";
import { presetRules } from "./presets";
import { createRng, nextFloat, shuffleInPlace } from "./rng";

describe("인원별 덱", () => {
  it("5·6·7·2마는 53장", () => {
    for (const id of [
      "standard5",
      "standard6",
      "standard7",
      "standard2",
    ] as const) {
      expect(deckFor(presetRules(id))).toHaveLength(53);
    }
  });

  it("4마는 43장. 기본 조커콜(♣3·♠3)이면 2·3·4를 빼고 조커콜 두 장만 남긴다", () => {
    const deck = deckFor(presetRules("standard4"));
    expect(deck).toHaveLength(43);
    expect(deck).toContain("C3");
    expect(deck).toContain("S3");
    expect(deck).not.toContain("H3");
    expect(deck).not.toContain("D2");
    expect(deck).not.toContain("S4");
    expect(deck).toContain("D5");
  });

  it("4마에서 조커콜 숫자가 서로 다르면 낮은 숫자부터 ♣♥◆♠ 순으로 10장을 뺀다", () => {
    const rules = {
      ...presetRules("standard4"),
      alterJokerCall: "H7" as const,
    };
    const deck = deckFor(rules);
    expect(deck).toHaveLength(43);
    // 2 네 장, 3 중 조커콜 ♣3을 건너뛴 세 장, 4 중 ♣♥◆ 세 장
    for (const card of [
      "C2",
      "H2",
      "D2",
      "S2",
      "H3",
      "D3",
      "S3",
      "C4",
      "H4",
      "D4",
    ]) {
      expect(deck).not.toContain(card);
    }
    expect(deck).toContain("C3");
    expect(deck).toContain("S4");
  });

  it("3마는 33장. 기본 조커콜이면 2·4·5·6·7을 뺀다", () => {
    const deck = deckFor(presetRules("standard3"));
    expect(deck).toHaveLength(33);
    expect(deck).toContain("H3");
    expect(deck).toContain("D8");
    expect(
      deck.some((c) => ["2", "4", "5", "6", "7"].includes(c.slice(1))),
    ).toBe(false);
  });
});

describe("난수", () => {
  it("같은 시드면 같은 순서로 섞인다", () => {
    const a = shuffleInPlace(createRng(42), deckFor(presetRules("standard5")));
    const b = shuffleInPlace(createRng(42), deckFor(presetRules("standard5")));
    const c = shuffleInPlace(createRng(43), deckFor(presetRules("standard5")));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("0 이상 1 미만", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
