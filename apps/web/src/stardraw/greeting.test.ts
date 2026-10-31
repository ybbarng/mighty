import { describe, expect, it } from "vitest";
import { greetingLines, kstHour, pickGreeting } from "./greeting";

/** 한국 시각 h시의 ms */
const at = (h: number) => Date.UTC(2026, 9, 31, h - 9, 30);

describe("인사 고르기", () => {
  it("한국 시각으로 시간대를 고른다", () => {
    expect(kstHour(at(7))).toBe(7);
    expect(greetingLines(at(7))).toContain("좋은 아침이에요.");
    expect(greetingLines(at(23))).toContain("별이 잘 보이는 밤이에요.");
    expect(greetingLines(at(2))).toContain("늦은 밤까지 관측하시네요.");
    // 늘 쓰는 인사도 함께
    expect(greetingLines(at(15))).toContain("어서 오세요.");
  });

  it("무작위를 넣으면 결정적이고, 바로 앞 인사는 피한다", () => {
    const first = pickGreeting({
      now: at(8),
      place: "enter",
      random: () => 0,
    });
    expect(first).toBe("좋은 아침이에요.");
    const next = pickGreeting({
      now: at(8),
      place: "enter",
      random: () => 0,
      last: first,
    });
    expect(next).not.toBe(first);
  });

  it("응모 자리는 창구 말을 뒤에 붙이고, 모든 문장은 마침표나 물음표로 끝난다", () => {
    expect(
      pickGreeting({ now: at(19), place: "submit", random: () => 0 }),
    ).toBe("좋은 저녁이에요. 응모를 접수하겠습니다.");
    for (let h = 0; h < 24; h++)
      for (const l of greetingLines(at(h))) expect(l).toMatch(/[.?]$/);
  });
});
