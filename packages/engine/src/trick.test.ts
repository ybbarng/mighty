import { describe, expect, it } from "vitest";

import type { Card, Kiruda, Suit } from "./cards";
import { presetRules } from "./presets";
import type { RuleSet } from "./rules";
import {
  canDeclareJokerCall,
  jokerCallOf,
  mightyOf,
  playableCards,
  type TrickCards,
  type TrickContext,
  trickWinnerIndex,
} from "./trick";

const standard = presetRules("standard5");

function ctx(
  kiruda: Kiruda,
  trickIndex = 3,
  rules: RuleSet = standard,
): TrickContext {
  return { rules, kiruda, trickIndex };
}

function trick(
  cards: Card[],
  opts: { jokerSuit?: Suit; jokerCalled?: boolean } = {},
): TrickCards {
  return {
    cards,
    jokerSuit: opts.jokerSuit ?? null,
    jokerCalled: opts.jokerCalled ?? false,
  };
}

describe("마이티와 조커콜 카드", () => {
  it("기본은 ♠A와 ♣3", () => {
    expect(mightyOf(standard, "H")).toBe("SA");
    expect(jokerCallOf(standard, "H")).toBe("C3");
    expect(mightyOf(standard, "NT")).toBe("SA");
  });

  it("기루다가 ♠이면 마이티는 ◆A, 기루다가 ♣이면 조커콜은 ♠3", () => {
    expect(mightyOf(standard, "S")).toBe("DA");
    expect(jokerCallOf(standard, "C")).toBe("S3");
  });
});

describe("트릭 승자", () => {
  it("선 무늬의 높은 카드가 이긴다. 다른 무늬는 못 이긴다", () => {
    expect(
      trickWinnerIndex(ctx("NT"), trick(["H10", "HK", "DA", "H2", "C5"])),
    ).toBe(1);
  });

  it("기루다가 선 무늬를 이긴다", () => {
    expect(
      trickWinnerIndex(ctx("S"), trick(["HA", "S2", "HK", "S3", "H5"])),
    ).toBe(3);
  });

  it("마이티가 기루다 A와 조커를 이긴다", () => {
    expect(
      trickWinnerIndex(ctx("H"), trick(["HA", "JK", "SA", "H2", "H5"])),
    ).toBe(2);
  });

  it("효력 있는 조커는 마이티 다음으로 세다", () => {
    expect(
      trickWinnerIndex(ctx("H"), trick(["HA", "JK", "HK", "H2", "H5"])),
    ).toBe(1);
  });

  it("선으로 낸 조커는 지정한 무늬를 따르게 한다", () => {
    const t = trick(["JK", "D2", "DA", "C5", "D9"], { jokerSuit: "D" });
    expect(trickWinnerIndex(ctx("NT"), t)).toBe(0);
  });

  it("막 트릭 조커는 표준 5마에서 효력이 있다", () => {
    expect(
      trickWinnerIndex(ctx("H", 9), trick(["HA", "JK", "H2", "H3", "H4"])),
    ).toBe(1);
  });

  it("첫 트릭 조커는 표준 5마에서 효력이 없어 가장 약하다", () => {
    expect(
      trickWinnerIndex(ctx("H", 0), trick(["D2", "JK", "D3", "D4", "D5"])),
    ).toBe(4);
  });

  it("조커콜을 당한 조커는 가장 약하다", () => {
    const t = trick(["C3", "JK", "C2", "C4", "C5"], { jokerCalled: true });
    expect(trickWinnerIndex(ctx("H"), t)).toBe(4);
  });

  it("조커콜 선언이 없으면 ♣3은 그냥 ♣3이다", () => {
    expect(
      trickWinnerIndex(ctx("H"), trick(["C3", "JK", "C2", "C4", "C5"])),
    ).toBe(1);
  });

  it("경기 5마: 조커콜로 끌려 나온 조커도 효력이 있다", () => {
    const rules = presetRules("gyeonggi5");
    const t = trick(["C3", "JK", "C2", "C4", "C5"], { jokerCalled: true });
    expect(trickWinnerIndex(ctx("H", 3, rules), t)).toBe(1);
  });

  it("대구 5마: 첫 트릭 마이티는 효력이 없어 일반 ♠A가 된다", () => {
    const rules = presetRules("daegu5");
    expect(
      trickWinnerIndex(
        ctx("H", 0, rules),
        trick(["D2", "SA", "DA", "D3", "D4"]),
      ),
    ).toBe(2);
    expect(
      trickWinnerIndex(
        ctx("H", 1, rules),
        trick(["D2", "SA", "DA", "D3", "D4"]),
      ),
    ).toBe(1);
  });
});

describe("낼 수 있는 카드", () => {
  it("선 무늬가 있으면 선 무늬만, 마이티·조커는 언제나", () => {
    const hand: Card[] = ["H2", "H9", "SA", "JK", "D5"];
    expect(playableCards(ctx("C"), hand, trick(["HK"]))).toEqual([
      "H2",
      "H9",
      "SA",
      "JK",
    ]);
  });

  it("선 무늬가 없으면 아무 카드나", () => {
    const hand: Card[] = ["D5", "C7", "S2"];
    expect(playableCards(ctx("C"), hand, trick(["HK"]))).toEqual(hand);
  });

  it("마이티 무늬가 선이면 마이티도 그 무늬로 쳐서 따라내야 한다", () => {
    expect(playableCards(ctx("H"), ["SA", "D5"], trick(["S5"]))).toEqual([
      "SA",
    ]);
  });

  it("첫 트릭 선(주공)은 기루다를 낼 수 없다", () => {
    const hand: Card[] = ["H2", "H9", "D5"];
    expect(playableCards(ctx("H", 0), hand, trick([]))).toEqual(["D5"]);
  });

  it("첫 트릭 선이 기루다만 가졌으면 아무 카드나 낸다", () => {
    const hand: Card[] = ["H2", "H9"];
    expect(playableCards(ctx("H", 0), hand, trick([]))).toEqual(hand);
  });

  it("첫 트릭에 선이 아닌 사람은 선 무늬가 없으면 기루다를 낼 수 있다", () => {
    const hand: Card[] = ["H2", "D5"];
    expect(playableCards(ctx("H", 0), hand, trick(["C9"]))).toEqual(hand);
  });

  it("표준 5마: 첫 트릭과 막 트릭에는 조커를 낼 수 없다", () => {
    expect(playableCards(ctx("H", 0), ["JK", "D5"], trick(["C9"]))).toEqual([
      "D5",
    ]);
  });

  it("조커콜을 당하면 조커를 가진 사람은 조커만 낸다", () => {
    const t = trick(["C3"], { jokerCalled: true });
    expect(playableCards(ctx("H"), ["C5", "JK", "SA"], t)).toEqual(["JK"]);
  });

  it("올마 규칙이면 조커콜에 마이티로 대신 낼 수 있다", () => {
    const rules = presetRules("gwanak6");
    const t = trick(["C3"], { jokerCalled: true });
    expect(playableCards(ctx("H", 3, rules), ["C5", "JK", "SA"], t)).toEqual([
      "JK",
      "SA",
    ]);
  });

  it("막 트릭에 조커를 못 내는 규칙이면 그 전 트릭에 강제로 낸다", () => {
    expect(playableCards(ctx("H", 8), ["JK", "D5"], trick(["D9"]))).toEqual([
      "JK",
    ]);
  });

  it("막 트릭 두 판 전에 마이티와 조커를 둘 다 못 낸다면 둘 중 하나를 낸다", () => {
    const rules = { ...standard, mightyInLastTrick: false };
    expect(
      playableCards(ctx("H", 7, rules), ["JK", "SA", "D5"], trick([])),
    ).toEqual(["SA", "JK"]);
  });
});

describe("조커콜 선언", () => {
  it("조커가 이미 나왔으면 선언할 수 없다", () => {
    expect(canDeclareJokerCall(ctx("H"), false)).toBe(true);
    expect(canDeclareJokerCall(ctx("H"), true)).toBe(false);
  });

  it("첫 트릭 조커콜 효력이 없는 규칙이면 첫 트릭에는 선언할 수 없다", () => {
    expect(canDeclareJokerCall(ctx("H", 0), false)).toBe(true);
    expect(
      canDeclareJokerCall(ctx("H", 0, presetRules("sinchon5")), false),
    ).toBe(false);
  });
});
