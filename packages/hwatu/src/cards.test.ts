import { describe, expect, it } from "vitest";

import { cardOf, HWATU_DECK, MONTH_NAMES, sameMonth } from "./cards";
import {
  CHEONGDAN,
  CHODAN,
  GODORI,
  groupByMonth,
  HONGDAN,
  hasAll,
  shuffledDeck,
  sortCards,
  splitCaptured,
} from "./deck";

describe("화투 48장", () => {
  it("12달 × 4장이고 번호는 겹치지 않는다", () => {
    expect(HWATU_DECK).toHaveLength(48);
    expect(new Set(HWATU_DECK.map((c) => c.id)).size).toBe(48);
    for (const month of Object.keys(MONTH_NAMES).map(Number))
      expect(HWATU_DECK.filter((c) => c.month === month)).toHaveLength(4);
  });

  it("광 5장, 열끗 9장, 띠 10장, 피 24장(쌍피 2장 포함)", () => {
    const count = (kind: string) =>
      HWATU_DECK.filter((c) => c.kind === kind).length;
    expect(count("gwang")).toBe(5);
    expect(count("animal")).toBe(9);
    expect(count("ribbon")).toBe(10);
    expect(count("pi")).toBe(24);
    expect(HWATU_DECK.filter((c) => c.piValue === 2).map((c) => c.id)).toEqual([
      "11d",
      "12d",
    ]);
  });

  it("홍단·청단·초단·고도리 묶음이 맞는 카드다", () => {
    expect(HONGDAN.map((id) => cardOf(id).ribbon)).toEqual([
      "red",
      "red",
      "red",
    ]);
    expect(CHEONGDAN.map((id) => cardOf(id).ribbon)).toEqual([
      "blue",
      "blue",
      "blue",
    ]);
    expect(CHODAN.map((id) => cardOf(id).ribbon)).toEqual([
      "grass",
      "grass",
      "grass",
    ]);
    expect(GODORI.every((id) => cardOf(id).bird)).toBe(true);
    expect(cardOf("12g").special).toBe("rainGwang");
    expect(cardOf("09a").special).toBe("cup");
  });

  it("같은 시드면 같은 순서로 섞고, 48장이 다 있다", () => {
    expect(shuffledDeck(7)).toEqual(shuffledDeck(7));
    expect(shuffledDeck(7)).not.toEqual(shuffledDeck(8));
    expect(new Set(shuffledDeck(7)).size).toBe(48);
  });

  it("정리·달별 묶기·먹은 패 나누기", () => {
    expect(sortCards(["12d", "01p", "01g"])).toEqual(["01g", "01p", "12d"]);
    expect([...groupByMonth(["03p", "01g", "03g"]).entries()]).toEqual([
      [1, ["01g"]],
      [3, ["03g", "03p"]],
    ]);
    const split = splitCaptured(["11d", "01p", "01g", "02r"]);
    expect(split.piCount).toBe(3);
    expect(split.gwang).toEqual(["01g"]);
    expect(hasAll(["01r", "02r", "03r", "05p"], HONGDAN)).toBe(true);
    expect(sameMonth("01g", "01p")).toBe(true);
    expect(() => cardOf("13g")).toThrow();
  });
});
