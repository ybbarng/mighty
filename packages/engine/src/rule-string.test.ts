import { describe, expect, it } from "vitest";

import { presetRules, RULE_PRESETS } from "./presets";
import {
  cardToLegacyNumber,
  decodeRuleString,
  encodeRuleString,
  legacyNumberToCard,
} from "./rule-string";

describe("원작 카드 번호", () => {
  it("♠A=1, ◆A=14, ♣3=42, 조커=53", () => {
    expect(cardToLegacyNumber("SA")).toBe(1);
    expect(cardToLegacyNumber("DA")).toBe(14);
    expect(cardToLegacyNumber("C3")).toBe(42);
    expect(cardToLegacyNumber("SK")).toBe(13);
    expect(cardToLegacyNumber("JK")).toBe(53);
  });

  it("1~53 모두 되돌릴 수 있다", () => {
    for (let n = 1; n <= 53; n++) {
      const card = legacyNumberToCard(n);
      expect(card).not.toBeNull();
      expect(cardToLegacyNumber(card as NonNullable<typeof card>)).toBe(n);
    }
    expect(legacyNumberToCard(0)).toBeNull();
    expect(legacyNumberToCard(54)).toBeNull();
  });
});

describe("원작 규칙 문자열", () => {
  it.each(RULE_PRESETS.map((p) => [p.name, p.code]))(
    "%s: 해석한 뒤 다시 만들면 원작 문자열과 같다",
    (_name, code) => {
      const result = decodeRuleString(code);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(encodeRuleString(result.rules)).toBe(code);
    },
  );

  it("표준 5마의 값이 원작과 같다", () => {
    const rules = presetRules("standard5");
    expect(rules).toMatchObject({
      playerCount: 5,
      minGoal: 13,
      mighty: "SA",
      alterMighty: "DA",
      jokerCall: "C3",
      alterJokerCall: "S3",
      friend: true,
      jokerFriend: true,
      firstBidderMayPass: true,
      raise2ForKirudaChange: true,
      jokerInFirstTrick: false,
      jokerInLastTrick: false,
      jokerEffectInLastTrick: true,
      kirudaInFirstTrick: true,
      leaderKirudaInFirstTrick: false,
      winScoring: "risk20",
      loseScoring: "eyeForEye",
      doubleForRun: true,
      doubleForNoKiruda: true,
      doubleForReverseRun: false,
      reverseRunCondition: "goal",
    });
    expect(rules.dealMiss).toEqual({
      noPoint: true,
      oneOrLess: false,
      allPoint: false,
      jokerCountsMinusOne: false,
      mightyCountsZero: false,
      only10: true,
      oneEyedJack: false,
      duplicate: false,
    });
  });

  it("지역 규칙의 차이가 그대로 드러난다", () => {
    const sinchon = presetRules("sinchon5");
    expect(sinchon.minGoal).toBe(14);
    expect(sinchon.hideScoredCards).toBe(true);
    expect(sinchon.discardedPointsToOpposition).toBe(true);
    expect(sinchon.highGoal).toBe(true);
    expect(sinchon.doubleForNoFriend).toBe(true);

    const gyeonggi = presetRules("gyeonggi5");
    expect(gyeonggi.minGoal).toBe(12);
    expect(gyeonggi.alterJokerCall).toBe("H3");
    expect(gyeonggi.jokerInFirstTrick).toBe(true);
    expect(gyeonggi.calledJokerKeepsEffect).toBe(true);
    expect(gyeonggi.raise2ForKirudaChange).toBe(false);

    expect(presetRules("gwanak6").winScoring).toBe("eyeForEye");
    expect(presetRules("standard2").playerCount).toBe(2);
    expect(presetRules("standard2").minGoal).toBe(7);
  });

  it("규칙을 바꿔 만든 문자열을 다시 읽으면 같은 규칙이다", () => {
    const rules = {
      ...presetRules("standard5"),
      winScoring: "base13" as const,
      loseScoring: "toothForTooth" as const,
      reverseRunCondition: "eleven" as const,
      passAgain: true,
      mighty: "HA" as const,
    };
    const decoded = decodeRuleString(encodeRuleString(rules));
    expect(decoded).toEqual({ ok: true, rules });
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(decodeRuleString("  (0$1M&))2O%,C5%\n").ok).toBe(true);
  });

  it.each([
    ["길이가 다르다", "(0$1M&))2O%,C5"],
    ["쓸 수 없는 글자가 있다", "(0$1M&))2O%,C5 "],
    ["카드 번호가 범위를 벗어난다", "(0#1M&))2O%,C5%"],
    ["인원이 8명이다", "+0$1M&))2O%,C5%"],
  ])("%s → 실패", (_reason, code) => {
    expect(decodeRuleString(code).ok).toBe(false);
  });
});
