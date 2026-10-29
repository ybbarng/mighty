// @vitest-environment node
import { describe, expect, it } from "vitest";

import { splitSuits, suitText } from "./suit-style";

describe("무늬 표기", () => {
  it("문구를 글자와 무늬 조각으로 나눈다", () => {
    expect(splitSuits("♠A (마이티) 프렌드")).toEqual([
      { suit: "S" },
      "A (마이티) 프렌드",
    ]);
    expect(splitSuits("◆K 지목 — ♣10")).toEqual([
      { suit: "D" },
      "K 지목 — ",
      { suit: "C" },
      "10",
    ]);
  });

  it("이름 방식은 숫자·영문 앞에서 띄운다", () => {
    expect(suitText("♠13", "name")).toBe("스페이드 13");
    expect(suitText("♥A (마이티) 프렌드", "name")).toBe(
      "하트 A (마이티) 프렌드",
    );
    expect(suitText("◆ 무늬를 따라 내야 합니다", "name")).toBe(
      "다이아몬드 무늬를 따라 내야 합니다",
    );
  });

  it("첫 글자 방식은 붙여 쓴다", () => {
    expect(suitText("♣10", "initial")).toBe("클10");
    expect(suitText("♠K", "initial")).toBe("스K");
  });

  it("그림 방식은 문구의 기호를 그대로 둔다(그림은 SuitText가 그린다)", () => {
    expect(suitText("♠13 · ♣A", "outline")).toBe("♠13 · ♣A");
  });

  it("기호 방식은 ◆·♣를 속이 빈 글자로", () => {
    expect(suitText("♠13 · ♣A · ♥Q · ◆K", "symbol")).toBe("♠13 · ♧A · ♥Q · ♢K");
  });

  it("무늬가 없으면 그대로", () => {
    expect(suitText("노기루다 13", "name")).toBe("노기루다 13");
  });
});
