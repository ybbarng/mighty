import { describe, expect, it } from "vitest";

import {
  decodeGostopRules,
  encodeGostopRules,
  GOSTOP3_RULES,
  MATGO_RULES,
} from "./rules";
import { piCountOf, piToGive, scoreCaptured } from "./score";

describe("규칙 문자열", () => {
  it("맞고·3명 규칙이 되돌아온다", () => {
    for (const rules of [
      MATGO_RULES,
      GOSTOP3_RULES,
      { players: 3 as const, rounds: 20, gukjin: "animal" as const },
      { players: 2 as const, rounds: 1, gukjin: "best" as const },
    ]) {
      const code = encodeGostopRules(rules);
      expect(code).toMatch(/^g1-/);
      expect(decodeGostopRules(code)).toEqual({ ok: true, rules });
    }
    expect(encodeGostopRules(MATGO_RULES)).toBe("g1-2b3");
  });

  it("잘못된 문자열은 거절한다", () => {
    for (const bad of [
      "",
      "g1-4b3",
      "g1-2x3",
      "g1-2b0",
      "g1-2b21",
      "g2-2b3",
      "j1-s1",
      "g1-2b3x",
    ])
      expect(decodeGostopRules(bad).ok).toBe(false);
  });
});

describe("점수", () => {
  it("광: 3광 3점, 비광 섞이면 2점, 4광 4점, 5광 15점", () => {
    expect(scoreCaptured(["01g", "03g", "08g"], "best").gwang).toBe(3);
    expect(scoreCaptured(["01g", "03g", "12g"], "best").gwang).toBe(2);
    expect(scoreCaptured(["01g", "03g", "08g", "12g"], "best").gwang).toBe(4);
    expect(
      scoreCaptured(["01g", "03g", "08g", "11g", "12g"], "best").gwang,
    ).toBe(15);
    expect(scoreCaptured(["01g", "03g"], "best").total).toBe(0);
  });

  it("띠·열끗은 5장 1점부터 한 장마다 +1", () => {
    expect(
      scoreCaptured(["01r", "04r", "06r", "10r", "12r"], "best").ribbon,
    ).toBe(1);
    expect(
      scoreCaptured(["01r", "04r", "06r", "10r", "12r", "05r"], "best").ribbon,
    ).toBe(2);
    expect(
      scoreCaptured(["05a", "06a", "07a", "10a", "12a"], "best").animal,
    ).toBe(1);
  });

  it("피는 10장 1점부터, 쌍피는 두 장으로 센다", () => {
    const nine = [
      "01p",
      "01q",
      "02p",
      "02q",
      "03p",
      "03q",
      "04p",
      "04q",
      "05p",
    ];
    expect(scoreCaptured(nine, "best").pi).toBe(0);
    expect(scoreCaptured([...nine, "05q"], "best").pi).toBe(1);
    expect(scoreCaptured([...nine, "11d"], "best").pi).toBe(2);
  });

  it("고도리 5점, 홍단·청단·초단 3점", () => {
    expect(scoreCaptured(["02a", "04a", "08a"], "best").total).toBe(5);
    expect(scoreCaptured(["01r", "02r", "03r"], "best").hongdan).toBe(3);
    expect(scoreCaptured(["06r", "09r", "10r"], "best").cheongdan).toBe(3);
    expect(scoreCaptured(["04r", "05r", "07r"], "best").chodan).toBe(3);
  });

  it("국진은 점수가 더 나는 쪽으로 센다(규칙이 best일 때)", () => {
    const pis = ["01p", "01q", "02p", "02q", "03p", "03q", "04p", "04q"];
    // 피 8장 + 국진 쌍피 = 10장 → 1점. 열끗으로 두면 0점.
    const best = scoreCaptured([...pis, "09a"], "best");
    expect(best.gukjinAsPi).toBe(true);
    expect(best.pi).toBe(1);
    expect(scoreCaptured([...pis, "09a"], "animal").total).toBe(0);
    // 열끗 4장 + 국진 → 열끗 5장 1점이 낫다(피는 0장)
    const animals = scoreCaptured(["05a", "06a", "07a", "10a", "09a"], "best");
    expect(animals.gukjinAsPi).toBe(false);
    expect(animals.animal).toBe(1);
  });

  it("피를 줄 때 보통 피를 먼저, 없으면 쌍피", () => {
    expect(piToGive(["11d", "01p"])).toBe("01p");
    expect(piToGive(["11d", "01g"])).toBe("11d");
    expect(piToGive(["01g"])).toBeNull();
    expect(piCountOf(["11d", "01p", "09a"], "best")).toBe(5);
    expect(piCountOf(["11d", "01p", "09a"], "animal")).toBe(3);
  });
});
