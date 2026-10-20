import { describe, expect, it } from "vitest";

import { decisionFor } from "./decision";
import { step } from "./match";
import { presetRules } from "./presets";
import { createScenario } from "./scenario";

const rules = presetRules("standard5");

describe("정해진 장면에서 시작", () => {
  it("트릭 단계: 주공이 선이고 낼 수 있는 카드가 정해진다", () => {
    const state = createScenario({
      rules,
      phase: "play",
      declarer: 0,
      goal: { kiruda: "H", score: 13 },
      hands: [
        ["HA", "S2"],
        ["S3", "S4"],
        ["S5", "S6"],
        ["S7", "S8"],
        ["S9", "S10"],
      ],
    });
    const decision = decisionFor(state, 0);
    expect(decision?.kind).toBe("play");
    // 첫 트릭이 아니라서 선도 기루다를 낼 수 있다.
    expect(decision?.kind === "play" && decision.cards).toEqual(["HA", "S2"]);
  });

  it("트릭 단계에서 실제로 한 트릭을 진행할 수 있다", () => {
    let state = createScenario({
      rules,
      phase: "play",
      declarer: 0,
      goal: { kiruda: "H", score: 13 },
      hands: [["S2"], ["SK"], ["S5"], ["H3"], ["S9"]],
    });
    const events = [];
    for (const [seat, card] of [
      [0, "S2"],
      [1, "SK"],
      [2, "S5"],
      [3, "H3"],
      [4, "S9"],
    ] as const) {
      const result = step(state, seat, { type: "play", card });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      events.push(...result.events);
    }
    // ♠ 선에 기루다(♥3)를 낸 3번이 이긴다.
    expect(events).toContainEqual({
      type: "trickWon",
      seat: 3,
      trickIndex: 1,
      points: 1,
    });
  });

  it("교환 단계: 키티가 주공 손에 들어가 있다", () => {
    const state = createScenario({
      rules,
      phase: "exchange",
      declarer: 0,
      goal: { kiruda: "S", score: 14 },
      hands: [["SA", "SK"], [], [], [], []],
      kitty: ["H2", "D3", "C4"],
    });
    expect(state.round.hands[0]).toEqual(["SA", "SK", "H2", "D3", "C4"]);
    expect(decisionFor(state, 0)?.kind).toBe("exchange");
  });

  it("카드 프렌드는 그 카드를 가진 사람이다(공개 전)", () => {
    const state = createScenario({
      rules,
      phase: "play",
      declarer: 0,
      goal: { kiruda: "S", score: 14 },
      friend: { kind: "card", card: "DA" },
      hands: [["S2"], ["S3"], ["DA"], ["S5"], ["S6"]],
    });
    expect(state.round.friend).toBe(2);
    expect(state.round.friendRevealed).toBe(false);
  });
});
