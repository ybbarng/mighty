import { WINDOWS_RULES } from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import type { HeartsBot } from "./knowledge";
import { heartsBeginnerBot, heartsNormalBot } from "./rule-bot";
import { createHeartsSearchBot } from "./search-bot";
import { simulateHearts } from "./simulate";

/**
 * 도전자를 기준 봇과 섞어 앉혀 판당 점수 차이를 잰다(하트는 점수가 낮을수록 좋다).
 * 같은 판을 자리만 바꿔 두 번 두어 패 운을 줄인다. 돌려주는 값이 클수록 도전자가 잘한 것이다.
 */
function duel(
  challenger: HeartsBot,
  baseline: HeartsBot,
  seeds: number,
  rounds = 8,
): number {
  let edge = 0;
  let played = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const seats of [
      [0, 2],
      [1, 3],
    ]) {
      const bots = [0, 1, 2, 3].map((s) =>
        seats.includes(s) ? challenger : baseline,
      );
      const result = simulateHearts({
        rules: WINDOWS_RULES,
        seed,
        bots,
        rounds,
      });
      let mine = 0;
      let theirs = 0;
      result.points.forEach((p, s) => {
        if (seats.includes(s)) mine += p / 2;
        else theirs += p / 2;
      });
      edge += theirs - mine;
      played += result.rounds;
    }
  }
  return edge / played;
}

/*
 * 2026-10-21 측정(판당 점수 차이):
 * - 중수 vs 입문 5.5점 (3200판)
 * - 고수 vs 중수 2.4점 (300판)
 */
describe("하트 실력 단계 사이의 세기 (pnpm --filter @mighty/hearts-ai bench)", () => {
  it("중수는 입문보다 점수를 덜 받는다", () => {
    expect(duel(heartsNormalBot, heartsBeginnerBot, 100)).toBeGreaterThan(3);
  });

  it("고수는 중수보다 점수를 덜 받는다", () => {
    expect(
      duel(createHeartsSearchBot(), heartsNormalBot, 20, 6),
    ).toBeGreaterThan(1);
  });
});
