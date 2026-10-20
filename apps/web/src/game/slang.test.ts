import { presetRules } from "@mighty/engine";
import { afterEach, describe, expect, it } from "vitest";

import {
  cardSlang,
  cardTipText,
  friendLabel,
  goalLabel,
  goalSlang,
  jokerCallLabel,
  jokerSuitLabel,
  setSlangTerms,
} from "./terms";

const rules = presetRules("standard5");

afterEach(() => setSlangTerms(false));

describe("마이티 은어(원작 GetGoalString·GetString)", () => {
  it("공약: 숫자 은어 + 무늬 은어", () => {
    expect(goalSlang({ kiruda: "H", score: 13 })).toBe("셋트");
    expect(goalSlang({ kiruda: "NT", score: 12 })).toBe("둘노");
    expect(goalSlang({ kiruda: "S", score: 17 })).toBe("곱삽");
    expect(goalSlang({ kiruda: "D", score: 20 })).toBe("풀다리");
    expect(goalSlang({ kiruda: "C", score: 16 })).toBe("엿끌");
  });

  it("2마는 턴 수라 열·열한을 붙인다", () => {
    expect(goalSlang({ kiruda: "S", score: 10 }, 2)).toBe("열삽");
    expect(goalSlang({ kiruda: "S", score: 11 }, 2)).toBe("열한삽");
    expect(goalSlang({ kiruda: "S", score: 12 }, 2)).toBe("열둘삽");
    expect(goalSlang({ kiruda: "S", score: 13 }, 2)).toBe("풀삽");
    expect(goalSlang({ kiruda: "S", score: 8 }, 2)).toBe("덜삽");
  });

  it("카드: 마이티·쪼카·쪼콜, 기루다는 기", () => {
    expect(cardSlang("SA", rules, "H")).toBe("마이티");
    expect(cardSlang("JK", rules, "H")).toBe("쪼카");
    expect(cardSlang("C3", rules, "H")).toBe("쪼콜");
    expect(cardSlang("HA", rules, "H")).toBe("기아");
    expect(cardSlang("HK", rules, "H")).toBe("기카");
    expect(cardSlang("DQ", rules, "H")).toBe("다리큐");
    expect(cardSlang("C10", rules, "H")).toBe("끌10");
    expect(cardSlang("S7", rules, "H")).toBe("삽7");
  });

  it("설정을 켜면 화면 문구가 은어로 바뀐다", () => {
    expect(goalLabel({ kiruda: "H", score: 13 })).toBe("♥ 13");
    setSlangTerms(true);
    expect(goalLabel({ kiruda: "H", score: 13 })).toBe("셋트");
    expect(
      friendLabel({ kind: "card", card: "HA" }, String, { rules, kiruda: "H" }),
    ).toBe("기아 프렌드");
    expect(jokerSuitLabel("S")).toBe("삽컴!");
    expect(jokerCallLabel()).toBe("쪼카컴!");
    expect(cardTipText("HA", rules, "H", new Set())).toBe("기아 (보스카)");
  });
});
