import { presetRules } from "@mighty/engine";
import { afterEach, describe, expect, it } from "vitest";
import { suitText } from "./suit-style";
import {
  cardLabel,
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

  it("설정을 켜면 화면 문구에 은어를 함께 적는다", () => {
    expect(goalLabel({ kiruda: "H", score: 13 })).toBe("♥13");
    setSlangTerms(true);
    expect(goalLabel({ kiruda: "H", score: 13 })).toBe("♥13 (셋트)");
    expect(
      friendLabel({ kind: "card", card: "HA" }, String, { rules, kiruda: "H" }),
    ).toBe("♥A (기아) 프렌드");
    expect(jokerSuitLabel("S")).toBe("삽컴!");
    expect(jokerCallLabel()).toBe("쪼카컴!");
    expect(cardTipText("HA", rules, "H", new Set())).toBe("기아 (보스카)");
  });
});

describe("무늬는 기호로 적고 화면이 표기 방식대로 바꾼다", () => {
  it("공약과 노기루다", () => {
    expect(goalLabel({ kiruda: "S", score: 13 })).toBe("♠13");
    expect(goalLabel({ kiruda: "NT", score: 12 })).toBe("노기루다 12");
    expect(suitText(goalLabel({ kiruda: "S", score: 13 }), "name")).toBe(
      "스페이드 13",
    );
  });

  it("프렌드 카드는 마이티·조커콜일 때만 역할을 괄호로 붙인다", () => {
    const friend = (card: "SA" | "C3" | "DK") =>
      friendLabel({ kind: "card", card }, String, { rules, kiruda: "H" });
    expect(friend("SA")).toBe("♠A (마이티) 프렌드");
    expect(friend("C3")).toBe("♣3 (조커콜) 프렌드");
    expect(friend("DK")).toBe("◆K 프렌드");
    expect(suitText(friend("SA"), "name")).toBe("스페이드 A (마이티) 프렌드");
    expect(friendLabel({ kind: "card", card: "JK" }, String)).toBe(
      "조커 프렌드",
    );
  });

  it("작은 칩은 첫 글자 방식이면 스K·클10", () => {
    expect(suitText(cardLabel("SK"), "initial")).toBe("스K");
    expect(suitText(cardLabel("C10"), "initial")).toBe("클10");
    expect(cardLabel("JK")).toBe("조커");
  });
});
