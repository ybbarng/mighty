import type { Card } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { step } from "./match";
import { WINDOWS_RULES } from "./rules";
import { createHeartsScenario } from "./scenario";
import { viewOf } from "./view";

const rules = WINDOWS_RULES;

describe("정해진 장면(튜토리얼 미션)", () => {
  it("넘기기 단계: 정한 방향으로 넘기기를 기다린다", () => {
    const state = createHeartsScenario({
      rules,
      phase: "passing",
      direction: "right",
      fill: true,
      hands: [["SQ", "SK", "SA"], [], [], []],
    });
    const view = viewOf(state, 0);
    expect(view.phase).toBe("passing");
    expect(view.direction).toBe("right");
    expect(view.hand).toHaveLength(13);
    expect(view.hand).toEqual(expect.arrayContaining(["SQ", "SK", "SA"]));
    expect(view.decision).toEqual({
      kind: "pass",
      direction: "right",
      count: 3,
    });
  });

  it("턴 중간: 이미 나온 카드를 깔고 내 차례에서 시작한다", () => {
    const state = createHeartsScenario({
      rules,
      phase: "play",
      leader: 1,
      trick: ["D5", "DK", "D3"],
      hands: [["HA", "C4"], ["C2"], ["C3"], ["C5"]],
    });
    const view = viewOf(state, 0);
    expect(view.turn).toBe(0);
    expect(view.trick?.plays.map((p) => p.seat)).toEqual([1, 2, 3]);
    // 무늬가 없으니 하트도 낼 수 있다
    expect(view.decision).toEqual({
      kind: "play",
      cards: ["HA", "C4"],
      leading: false,
    });
  });

  it("손패를 다 내면 판이 끝난다", () => {
    let state = createHeartsScenario({
      rules,
      phase: "play",
      leader: 1,
      trick: ["D5", "DK", "D3"],
      hands: [["HA", "C4"], ["C2"], ["C3"], ["C5"]],
    });
    const moves: [number, Card][] = [
      [0, "HA"],
      [2, "C3"],
      [3, "C5"],
      [0, "C4"],
      [1, "C2"],
    ];
    for (const [seat, card] of moves) {
      const result = step(state, seat, { type: "play", card });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(state.round.phase).toBe("roundEnd");
    // ♥A는 ◆K를 낸 2번 자리가 먹었다
    expect(state.round.roundPoints).toEqual([0, 0, 1, 0]);
  });
});
