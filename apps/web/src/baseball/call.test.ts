// @vitest-environment node
import type { GuessEntry } from "@mighty/baseball-engine";
import { describe, expect, it } from "vitest";

import { CALL_TEXT, callOf, inningOf, inningText } from "./call";

describe("심판 콜", () => {
  it("다 맞히면 홈런, 스트라이크가 있으면 스트라이크, 볼만이면 볼, 없으면 아웃", () => {
    expect(callOf(3, 0, 3)).toBe("homerun");
    expect(callOf(4, 0, 4)).toBe("homerun");
    expect(callOf(3, 0, 4)).toBe("strike");
    expect(callOf(1, 2, 3)).toBe("strike");
    expect(callOf(0, 3, 3)).toBe("ball");
    expect(callOf(0, 0, 3)).toBe("out");
    expect(CALL_TEXT[callOf(0, 0, 3)]).toBe("아웃!");
  });
});

type Input = Parameters<typeof inningOf>[0];
const textOf = (v: Input) => {
  const inning = inningOf(v);
  return inning ? inningText(inning) : null;
};

const g = (seat: number, answered = true): GuessEntry => ({
  seat,
  guess: "123",
  strikes: answered ? 0 : null,
  balls: answered ? 1 : null,
});

describe("몇 회 초·말", () => {
  const duel = { mode: "duel" as const };
  it("선이 묻는 차례는 초, 다른 쪽은 말. 묻기 전에는 다음 회를 센다", () => {
    const inning = inningOf({
      phase: "play",
      turn: 1,
      starter: 1,
      guesses: [],
      rules: duel,
    });
    expect(inning).toEqual({ number: 1, half: "top", batter: 1 });
    expect(
      textOf({
        phase: "play",
        turn: 0,
        starter: 1,
        guesses: [g(1)],
        rules: duel,
      }),
    ).toBe("1회 말");
    expect(
      textOf({
        phase: "play",
        turn: 1,
        starter: 1,
        guesses: [g(1), g(0)],
        rules: duel,
      }),
    ).toBe("2회 초");
  });

  it("답을 기다리면 방금 물은 회, 퍼즐은 초·말 없이 회만", () => {
    expect(
      textOf({
        phase: "answer",
        turn: 0,
        starter: 0,
        guesses: [g(0), g(1), g(0, false)],
        rules: duel,
      }),
    ).toBe("2회 초");
    expect(
      textOf({
        phase: "play",
        turn: 0,
        starter: 0,
        guesses: [g(0), g(0)],
        rules: { mode: "puzzle" },
      }),
    ).toBe("3회");
  });

  it("비밀을 정하거나 판이 끝나면 회가 없다", () => {
    for (const phase of ["setup", "reveal", "roundEnd", "gameOver"] as const)
      expect(
        inningOf({ phase, turn: 0, starter: 0, guesses: [], rules: duel }),
      ).toBeNull();
  });
});
