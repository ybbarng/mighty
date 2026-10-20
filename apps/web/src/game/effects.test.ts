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
  it("딜미스는 그 사람의 패를 함께 보여 준다", () => {
    const hand = [
      "S2",
      "S3",
      "H4",
      "H5",
      "D6",
      "D7",
      "C8",
      "C9",
      "S9",
      "H2",
    ] as const;
    const shown = effect({ type: "dealMiss", seat: 3, hand: [...hand] });
    expect(shown?.text).toBe("P3 딜미스! 다시 섞습니다");
    expect(shown?.cards).toEqual(hand);
  });

  it("기루다가 ♠이면 ◆A가 마이티다", () => {
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "DA",
        jokerSuit: null,
        jokerCall: false,
        slot: null,
      })?.text,
    ).toBe("마이티!");
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "SA",
        jokerSuit: null,
        jokerCall: false,
        slot: null,
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
        slot: null,
      })?.text,
    ).toBe("조커콜!");
    expect(
      effect({
        type: "played",
        seat: 1,
        card: "JK",
        jokerSuit: "H",
        jokerCall: false,
        slot: null,
      })?.text,
    ).toBe("조커!");
  });

  it("당선과 프렌드 공개", () => {
    expect(
      effect({ type: "elected", seat: 2, goal: { kiruda: "H", score: 15 } }),
    ).toMatchObject({
      text: "P2 당선",
      lines: ["공약 ♥ 15", "바닥 카드를 가져갑니다"],
    });
    expect(effect({ type: "friendRevealed", seat: 3 })?.text).toBe(
      "프렌드는 P3!",
    );
    expect(effect({ type: "friendRevealed", seat: null })?.text).toBe(
      "프렌드 없음",
    );
  });

  it("공약을 바꾸면 크게 알리고, 그대로면 알리지 않는다", () => {
    const elected = {
      ...view,
      election: { ...view.election, goal: { kiruda: "S" as const, score: 14 } },
    };
    expect(
      effectFor(
        elected,
        [{ type: "exchanged", seat: 0, goal: { kiruda: "H", score: 16 } }],
        name,
      ),
    ).toMatchObject({ text: "공약 변경", lines: ["♠ 14 → ♥ 16"] });
    expect(
      effectFor(
        elected,
        [{ type: "exchanged", seat: 0, goal: { kiruda: "S", score: 14 } }],
        name,
      ),
    ).toBeNull();
  });

  it("프렌드 선언을 크게 알린다", () => {
    expect(
      effect({ type: "friendDeclared", friend: { kind: "card", card: "SA" } }),
    ).toMatchObject({ text: "프렌드 선언" });
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
        slot: null,
      }),
    ).toBeNull();
  });
});
