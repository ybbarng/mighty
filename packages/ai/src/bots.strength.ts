import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import type { Bot } from "./bot";
import { heuristicBot } from "./heuristic-bot";
import { createSearchBot } from "./search-bot";
import { simulate } from "./simulate";

/**
 * 도전자를 1단계 봇과 섞어 앉혀 판당 돈 차이를 잰다.
 * 같은 판을 도전자 자리만 바꿔 두 번 두어 패 운을 줄인다.
 */
function duel(challenger: Bot, seeds: number, rounds = 6) {
  const rules = presetRules("standard5");
  let edge = 0;
  let played = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const seats of [
      [0, 2],
      [1, 3, 4],
    ]) {
      const bots = [0, 1, 2, 3, 4].map((s) =>
        seats.includes(s) ? challenger : heuristicBot,
      );
      const result = simulate({ rules, seed, bots, rounds });
      let mine = 0;
      let theirs = 0;
      result.moneyDelta.forEach((delta, seat) => {
        if (seats.includes(seat)) mine += delta / seats.length;
        else theirs += delta / (5 - seats.length);
      });
      edge += mine - theirs;
      played += result.roundsPlayed;
    }
  }
  return edge / played;
}

describe("2단계 봇의 세기 (pnpm --filter @mighty/ai bench)", () => {
  it("1단계 봇과 섞어 앉히면 판당 돈을 더 번다", () => {
    const edge = duel(createSearchBot(), 60);
    // 2026-10-21 측정: 카드 내기만 내다볼 때 0.97, 공약·교환·프렌드까지 계획하면 2.24(40판)
    expect(edge).toBeGreaterThan(1.5);
  });
});
