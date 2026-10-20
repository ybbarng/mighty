import { describe, expect, it } from "vitest";

import { step } from "./match";
import { presetRules } from "./presets";
import { createScenario } from "./scenario";

function scenario() {
  return createScenario({
    rules: presetRules("standard5"),
    phase: "play",
    declarer: 0,
    goal: { kiruda: "S", score: 13 },
    friend: { kind: "none" },
    leader: 0,
    hands: [
      ["D2", "C4", "H5"],
      ["D3", "C5", "H6"],
      ["DK", "HA", "H7"],
      ["D4", "C6", "H8"],
      ["D5", "C7", "H9"],
    ],
  });
}

function playedSlot(slot: number | undefined) {
  const result = step(scenario(), 0, {
    type: "play",
    card: "D2",
    ...(slot === undefined ? {} : { slot }),
  });
  if (!result.ok) throw new Error(result.error);
  const event = result.events.find((e) => e.type === "played");
  return event?.type === "played" ? event.slot : "없음";
}

describe("카드를 낸 손패 위치(slot)", () => {
  it("알려 준 위치를 played 이벤트에 그대로 싣는다", () => {
    expect(playedSlot(2)).toBe(2);
    expect(playedSlot(0)).toBe(0);
  });

  it("없거나 손패 밖이면 null. 규칙에는 영향이 없다", () => {
    expect(playedSlot(undefined)).toBeNull();
    expect(playedSlot(3)).toBeNull();
    expect(playedSlot(-1)).toBeNull();
    expect(playedSlot(1.5)).toBeNull();
  });
});
