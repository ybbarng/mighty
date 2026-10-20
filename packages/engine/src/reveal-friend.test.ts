import { describe, expect, it } from "vitest";

import { step } from "./match";
import { presetRules } from "./presets";
import { createScenario } from "./scenario";
import type { GameEvent } from "./state";

/** 주공 0번, ♥A 프렌드(2번이 가짐). 0번이 ◆2를 내고 2번이 ◆K로 이긴다 */
function play(revealFriendOnScore: boolean) {
  const rules = { ...presetRules("standard5"), revealFriendOnScore };
  let state = createScenario({
    rules,
    phase: "play",
    declarer: 0,
    goal: { kiruda: "S", score: 13 },
    friend: { kind: "card", card: "HA" },
    leader: 0,
    hands: [
      ["D2", "C4"],
      ["D3", "C5"],
      ["DK", "HA"],
      ["D4", "C6"],
      ["D5", "C7"],
    ],
  });
  const events: GameEvent[] = [];
  for (const [seat, card] of [
    [0, "D2"],
    [1, "D3"],
    [2, "DK"],
    [3, "D4"],
    [4, "D5"],
  ] as const) {
    const result = step(state, seat, { type: "play", card });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe("프렌드가 득점하면 바로 공개 (bShowFriend)", () => {
  it("켜면 프렌드 카드를 내지 않아도 점수 카드를 딴 순간 공개된다", () => {
    const { state, events } = play(true);
    expect(state.round.friendRevealed).toBe(true);
    expect(events).toContainEqual({ type: "friendRevealed", seat: 2 });
    // 딴 카드는 야당 더미가 아니라 여당 몫이다.
    expect(state.round.pointPiles[2]).toEqual([]);
  });

  it("끄면(기본) 프렌드 카드를 낼 때까지 숨는다", () => {
    const { state } = play(false);
    expect(state.round.friendRevealed).toBe(false);
    expect(state.round.pointPiles[2]).toEqual(["DK"]);
  });

  it("기본 규칙 중에서는 경기 5마만 켜져 있다", () => {
    expect(presetRules("gyeonggi5").revealFriendOnScore).toBe(true);
    expect(presetRules("standard5").revealFriendOnScore).toBe(false);
    expect(presetRules("comban5").revealFriendOnScore).toBe(false);
  });
});
