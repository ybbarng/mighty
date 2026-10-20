import { createMatch, presetRules, viewOf } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { cuesFor } from "./cues";

const rules = presetRules("standard5");
const base = viewOf(createMatch({ rules, seed: 1 }).state, 0);
const view = {
  ...base,
  goal: { kiruda: "H" as const, score: 14 },
  declarer: 0,
};

describe("효과음 고르기", () => {
  it("카드 종류에 따라 다른 소리", () => {
    const play = (card: "SA" | "JK" | "C3" | "H7", jokerCall = false) =>
      cuesFor(view, [
        { type: "played", seat: 1, card, jokerSuit: null, jokerCall },
      ]);
    expect(play("SA")).toEqual(["mighty"]);
    expect(play("JK")).toEqual(["joker"]);
    expect(play("C3", true)).toEqual(["jokerCall"]);
    expect(play("H7")).toEqual(["card"]);
  });

  it("내가 이긴 편이면 승리, 진 편이면 패배 소리", () => {
    const scored = (rulingWon: boolean) =>
      cuesFor(view, [
        {
          type: "roundScored",
          result: {
            rulingWon,
            rulingPoints: 0,
            oppositionPoints: 0,
            base: 0,
            staticRun: false,
            multipliers: [],
            moved: 0,
            money: [],
          },
        },
      ]);
    expect(scored(true)).toEqual(["win"]);
    expect(scored(false)).toEqual(["lose"]);
  });

  it("같은 소리는 한 번만", () => {
    expect(
      cuesFor(view, [
        { type: "passed", seat: 1 },
        { type: "passed", seat: 2 },
      ]),
    ).toEqual(["pass"]);
  });
});
