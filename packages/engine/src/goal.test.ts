import { describe, expect, it } from "vitest";

import type { Card } from "./cards";
import { isDealMiss, isValidBid, isValidGoalChange } from "./goal";
import { presetRules } from "./presets";

const standard = presetRules("standard5");
const daegu = presetRules("daegu5"); // 최소 12, 노기루다 혜택, 25까지 부를 수 있음

describe("선거 중 공약", () => {
  it("최소 공약 13부터 20까지 부를 수 있다", () => {
    expect(isValidBid(standard, null, { kiruda: "S", score: 13 })).toBe(true);
    expect(isValidBid(standard, null, { kiruda: "S", score: 12 })).toBe(false);
    expect(isValidBid(standard, null, { kiruda: "S", score: 20 })).toBe(true);
    expect(isValidBid(standard, null, { kiruda: "S", score: 21 })).toBe(false);
  });

  it("직전 공약보다 숫자가 커야 한다. 무늬 사이 우열은 없다", () => {
    const current = { kiruda: "S" as const, score: 14 };
    expect(isValidBid(standard, current, { kiruda: "NT", score: 14 })).toBe(
      false,
    );
    expect(isValidBid(standard, current, { kiruda: "H", score: 15 })).toBe(
      true,
    );
  });

  it("노기루다 혜택이 있으면 노기루다는 최소 공약보다 1 적게 부를 수 있다", () => {
    expect(isValidBid(daegu, null, { kiruda: "NT", score: 11 })).toBe(true);
    expect(isValidBid(daegu, null, { kiruda: "S", score: 11 })).toBe(false);
    expect(isValidBid(daegu, null, { kiruda: "S", score: 25 })).toBe(true);
  });

  it("노기루다를 늘 1 적게 치는 규칙이면 같은 숫자의 노기루다를 부를 수 있다", () => {
    const rules = { ...standard, noKirudaAlways: true };
    const spade15 = { kiruda: "S" as const, score: 15 };
    expect(isValidBid(rules, spade15, { kiruda: "NT", score: 15 })).toBe(true);
    const nt15 = { kiruda: "NT" as const, score: 15 };
    expect(isValidBid(rules, nt15, { kiruda: "S", score: 16 })).toBe(false);
    expect(isValidBid(rules, nt15, { kiruda: "S", score: 17 })).toBe(true);
    const nt19 = { kiruda: "NT" as const, score: 19 };
    expect(isValidBid(rules, nt19, { kiruda: "S", score: 20 })).toBe(true);
  });
});

describe("당선 후 공약 변경", () => {
  const current = { kiruda: "S" as const, score: 14 };

  it("기루다를 그대로 두면 낮출 수만 없다", () => {
    expect(
      isValidGoalChange(standard, current, { kiruda: "S", score: 14 }),
    ).toBe(true);
    expect(
      isValidGoalChange(standard, current, { kiruda: "S", score: 13 }),
    ).toBe(false);
    expect(
      isValidGoalChange(standard, current, { kiruda: "S", score: 15 }),
    ).toBe(true);
  });

  it("기루다를 바꾸려면 2 이상 올린다", () => {
    expect(
      isValidGoalChange(standard, current, { kiruda: "H", score: 15 }),
    ).toBe(false);
    expect(
      isValidGoalChange(standard, current, { kiruda: "H", score: 16 }),
    ).toBe(true);
  });

  it("노기루다 혜택이 있으면 노기루다로 바꿀 때 1 덜 올린다", () => {
    const d = { kiruda: "S" as const, score: 14 };
    expect(isValidGoalChange(daegu, d, { kiruda: "NT", score: 15 })).toBe(true);
    expect(isValidGoalChange(standard, d, { kiruda: "NT", score: 15 })).toBe(
      false,
    );
  });

  it("19에서 기루다를 바꾸면 20으로 충분하다", () => {
    const high = { kiruda: "S" as const, score: 19 };
    expect(isValidGoalChange(standard, high, { kiruda: "H", score: 20 })).toBe(
      true,
    );
  });
});

describe("딜미스", () => {
  const noPoints: Card[] = [
    "S2",
    "S3",
    "S4",
    "D5",
    "D6",
    "H7",
    "H8",
    "C9",
    "C2",
    "JK",
  ];
  const only10: Card[] = [
    "S2",
    "S3",
    "S4",
    "D5",
    "D6",
    "H7",
    "H8",
    "C9",
    "C2",
    "H10",
  ];
  const oneJack: Card[] = [
    "S2",
    "S3",
    "S4",
    "D5",
    "D6",
    "H7",
    "H8",
    "C9",
    "C2",
    "HJ",
  ];
  const mightyOnly: Card[] = [
    "SA",
    "S3",
    "S4",
    "D5",
    "D6",
    "H7",
    "H8",
    "C9",
    "C2",
    "D2",
  ];
  const twoPoints: Card[] = [
    "SA",
    "SK",
    "S4",
    "D5",
    "D6",
    "H7",
    "H8",
    "C9",
    "C2",
    "D2",
  ];

  it("표준 5마: 점수 카드 0장이거나 10 한 장뿐이면 딜미스", () => {
    expect(isDealMiss(standard, noPoints, "NT")).toBe(true);
    expect(isDealMiss(standard, only10, "NT")).toBe(true);
    expect(isDealMiss(standard, oneJack, "NT")).toBe(false);
    expect(isDealMiss(standard, twoPoints, "NT")).toBe(false);
  });

  it("관악 6마: 애꾸눈 J 한 장, 마이티뿐인 패도 딜미스", () => {
    const gwanak = presetRules("gwanak6");
    expect(isDealMiss(gwanak, oneJack, "NT")).toBe(true);
    expect(isDealMiss(gwanak, mightyOnly, "NT")).toBe(true);
    // 기루다가 ♠이면 ♠A는 마이티가 아니다.
    expect(isDealMiss(gwanak, mightyOnly, "S")).toBe(false);
  });

  it("조커가 점수 카드를 상쇄하는 규칙", () => {
    const rules = {
      ...standard,
      dealMiss: { ...standard.dealMiss, jokerCountsMinusOne: true },
    };
    const jokerAndKing: Card[] = [
      "SK",
      "S3",
      "S4",
      "D5",
      "D6",
      "H7",
      "H8",
      "C9",
      "C2",
      "JK",
    ];
    expect(isDealMiss(rules, jokerAndKing, "NT")).toBe(true);
    expect(isDealMiss(standard, jokerAndKing, "NT")).toBe(false);
  });

  it("관악컴반: 마이티 0·조커 −1을 뺀 뒤 0장이거나 애꾸눈 J 한 장이면 딜미스, 3.2의 '2장 이하' 버그는 없다", () => {
    const comban = presetRules("comban5");
    const hand = (...points: Card[]): Card[] => {
      const filler: Card[] = [
        "S2",
        "S3",
        "S4",
        "D5",
        "D6",
        "H7",
        "H8",
        "C9",
        "C2",
        "D3",
      ];
      return [...points, ...filler].slice(0, 10);
    };
    // 3.2 버그였다면 딜미스였을 점수 카드 2장 패는 딜미스가 아니다.
    expect(isDealMiss(comban, hand("SK", "HQ"), "NT")).toBe(false);
    expect(isDealMiss(comban, hand("D10", "C10"), "NT")).toBe(false);
    // 10 한 장은 딜미스가 아니다.
    expect(isDealMiss(comban, hand("H10"), "NT")).toBe(false);
    // 애꾸눈 J 한 장, 마이티 한 장, 조커 + 점수 카드 한 장은 딜미스다.
    expect(isDealMiss(comban, hand("HJ"), "NT")).toBe(true);
    expect(isDealMiss(comban, hand("SA"), "NT")).toBe(true);
    expect(isDealMiss(comban, hand("JK", "DK"), "NT")).toBe(true);
    // 조커 + 점수 카드 두 장은 아니다.
    expect(isDealMiss(comban, hand("JK", "DK", "CQ"), "NT")).toBe(false);
  });
});
