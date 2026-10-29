// @vitest-environment node
import {
  type Action,
  createMatch,
  pointAt,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/baduk-engine";
import { describe, expect, it } from "vitest";

import { badukKit, explainBaduk, summarizeBaduk } from "./kit";

describe("바둑 키트", () => {
  it("규칙 문자열이 오간다", () => {
    const code = badukKit.encodeRules({ ...STANDARD_RULES, size: 13 });
    expect(code).toBe("b1-13k75w1");
    expect(badukKit.decodeRules(code)).toEqual({
      ok: true,
      rules: { ...STANDARD_RULES, size: 13 },
    });
  });

  it("참가자는 시간패·그만두기를 보낼 수 없다. 쓴 시간은 행동에 실었다가 뺀다", () => {
    const guestMayAct = badukKit.guestMayAct as (a: Action) => boolean;
    expect(guestMayAct({ type: "timeout", spent: 1 })).toBe(false);
    expect(guestMayAct({ type: "retire" })).toBe(false);
    expect(guestMayAct({ type: "pass" })).toBe(true);
    const timing = badukKit.timing;
    if (!timing) throw new Error("시간 규칙이 없다");
    const stamped = timing.stamp({ type: "place", at: 40 }, 1234);
    expect(stamped).toEqual({ type: "place", at: 40, spent: 1234 });
    expect(timing.strip(stamped)).toEqual({ type: "place", at: 40 });
    expect(timing.stamp({ type: "resign" }, 99)).toEqual({ type: "resign" });
    expect(timing.strip({ type: "timeout", spent: 5 })).toBeNull();
  });

  it("판 기록은 내 돌·크기·결과를 남기고 통계로 모인다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const black = state.blackSeat;
    let s = state;
    const events = [];
    for (const [seat, action] of [
      [black, { type: "place", at: pointAt("E5", 9) }],
      [1 - black, { type: "pass" }],
      [black, { type: "pass" }],
    ] as const) {
      const r = step(s, seat, action);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      events.push(...r.events);
    }
    const round = badukKit.stats.round(null, viewOf(s, black), events);
    expect(round).toEqual({
      stone: "black",
      size: 9,
      outcome: "win",
      by: "score",
      margin: 81 - 7.5,
      moves: 3,
    });
    const summary = summarizeBaduk([
      {
        game: "baduk",
        data: round,
      } as unknown as Parameters<typeof summarizeBaduk>[0][number],
    ]);
    expect(summary.wins).toBe(1);
    expect(summary.black).toEqual({ n: 1, won: 1 });
    expect(summary.sizes).toEqual({ 9: 1 });
  });

  it("다시 보기 해설은 둔 수를 고수 수와 견준다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const c = explainBaduk(
      state,
      { seat: state.blackSeat, action: { type: "place", at: 0 } },
      null,
      1,
      () => "나",
    );
    expect(c.situation[0]).toContain("1판 1수째");
    // 귀 첫 수(A9)는 고수가 고르지 않는 나쁜 수다.
    expect(c.verdict === "slip" || c.verdict === "bad").toBe(true);
    expect(c.reasons[0]).toContain("A9");
  });
});
