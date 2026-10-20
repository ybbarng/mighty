import {
  createMatch,
  type GameEvent,
  presetRules,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { effectFor } from "./effects";

const rules = presetRules("standard5");
const view = {
  ...viewOf(createMatch({ rules, seed: 1 }).state, 0),
  goal: { kiruda: "S" as const, score: 14 },
};
const name = (seat: number) => `P${seat}`;

function effect(...events: GameEvent[]) {
  return effectFor(view, events, name);
}

describe("효과 글자", () => {
  it("기루다가 ♠이면 ◆A가 마이티다", () => {
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "DA",
        jokerSuit: null,
        jokerCall: false,
      })?.text,
    ).toBe("마이티!");
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "SA",
        jokerSuit: null,
        jokerCall: false,
      }),
    ).toBeNull();
  });

  it("조커콜과 조커", () => {
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "C3",
        jokerSuit: null,
        jokerCall: true,
      })?.text,
    ).toBe("조커콜!");
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "JK",
        jokerSuit: "H",
        jokerCall: false,
      })?.text,
    ).toBe("조커!");
  });

  it("당선과 프렌드 공개", () => {
    expect(
      effect({ type: "elected", seat: 2, goal: { kiruda: "H", score: 15 } })
        ?.text,
    ).toBe("P2 당선 · ♥ 15");
    expect(effect({ type: "friendRevealed", seat: 3 })?.text).toBe(
      "프렌드는 P3!",
    );
    expect(effect({ type: "friendRevealed", seat: null })?.text).toBe(
      "프렌드 없음",
    );
  });

  it("6마 죽이기", () => {
    expect(
      effect({ type: "killAttempt", seat: 0, card: "SK", killed: null })?.text,
    ).toBe("♠K 지목 — 헛다리");
    expect(
      effect({ type: "killAttempt", seat: 0, card: "SK", killed: 4 })?.text,
    ).toBe("♠K — P4 탈락");
  });

  it("보통 카드에는 효과가 없다", () => {
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "H7",
        jokerSuit: null,
        jokerCall: false,
      }),
    ).toBeNull();
  });
});
