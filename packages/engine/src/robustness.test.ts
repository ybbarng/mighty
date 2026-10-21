import { describe, expect, it } from "vitest";

import { decisionFor } from "./decision";
import { createMatch, step } from "./match";
import { presetRules } from "./presets";
import type { Action } from "./state";

/** 고친 클라이언트가 보낼 수 있는 엉뚱한 행동(모의 침투 B7) */
describe("엉뚱한 행동", () => {
  it("모르는 행동은 차례여도 거절한다", () => {
    const { state } = createMatch({ rules: presetRules("standard5"), seed: 1 });
    const seat = state.order.find((s) => decisionFor(state, s) !== null) ?? 0;
    const result = step(state, seat, { type: "bogus" } as unknown as Action);
    expect(result.ok).toBe(false);
  });

  it("2마 카드 고르기는 0이나 1만 받는다", () => {
    const { state } = createMatch({ rules: presetRules("standard2"), seed: 1 });
    const seat = state.order.find((s) => decisionFor(state, s) !== null) ?? 0;
    for (const index of [2, -1, 0.5])
      expect(
        step(state, seat, { type: "pick", index } as unknown as Action).ok,
      ).toBe(false);
    expect(step(state, seat, { type: "pick", index: 0 }).ok).toBe(true);
  });
});
