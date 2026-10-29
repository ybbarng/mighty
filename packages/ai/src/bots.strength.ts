import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import type { Bot } from "./bot";
import { beginnerBot, heuristicBot } from "./heuristic-bot";
import { randomBot } from "./random-bot";
import { createSearchBot } from "./search-bot";
import { simulate } from "./simulate";

const standard5 = presetRules("standard5");

/**
 * 도전자를 기준 봇과 섞어 앉혀 판당 돈 차이를 잰다.
 * 같은 판을 도전자 자리만 바꿔 두 번 두어 패 운을 줄인다.
 */
function duel(challenger: Bot, baseline: Bot, seeds: number, rounds = 6) {
  const rules = presetRules("standard5");
  let edge = 0;
  let played = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const seats of [
      [0, 2],
      [1, 3, 4],
    ]) {
      const bots = [0, 1, 2, 3, 4].map((s) =>
        seats.includes(s) ? challenger : baseline,
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

/*
 * 2026-10-21 측정(판당 돈, 같은 판을 자리 바꿔 두 번):
 * - 중수 vs 입문 +0.46 (6000판)
 * - 고수 vs 중수 +1.25 (480판)
 * 2026-10-25 고수 2차 정리(성향·공약 기록 추측·기억·포기 이득 비교) 뒤:
 * - 고수 vs 중수 +2.01 (480판), 예전 고수 상대 +0.21 (480판)
 * 2026-10-25 가망 없는 패 바로 포기(`hopelessGap` 2):
 * - 그런 패 40개를 추측 판 200개로 견주면 출마가 포기보다 판당 −3.07(표준 오차 0.19), 40개 모두 손해
 * - 예전 고수와 맞대결은 −0.35(720판)였지만, 두 고수가 다르게 두는 곳이 위 패뿐이라 측정 잡음으로 본다
 */
describe("실력 단계 사이의 세기 (pnpm --filter @mighty/ai bench)", () => {
  it("중수은 입문보다 판당 돈을 더 번다", () => {
    expect(duel(heuristicBot, beginnerBot, 300)).toBeGreaterThan(0.25);
  });

  it("고수는 중수보다 판당 돈을 더 번다", () => {
    expect(duel(createSearchBot(), heuristicBot, 60)).toBeGreaterThan(0.8);
  });
});

// 단위 시험(bots.test)에서 옮겨 왔다: 세기 측정이라 bench에서 돈다(2026-10-29)
describe("규칙 기반 봇의 실력", () => {
  it("무작위 봇과 섞어 앉히면 규칙 기반 봇이 돈을 더 번다", () => {
    let heuristicTotal = 0;
    let randomTotal = 0;
    for (let seed = 0; seed < 40; seed++) {
      // 자리 효과를 없애려고 시드마다 봇 자리를 바꾼다.
      const heuristicSeats = seed % 2 === 0 ? [0, 2, 4] : [1, 3];
      const bots = [0, 1, 2, 3, 4].map((s) =>
        heuristicSeats.includes(s) ? heuristicBot : randomBot,
      );
      const result = simulate({ rules: standard5, seed, bots, rounds: 8 });
      result.moneyDelta.forEach((delta, seat) => {
        if (heuristicSeats.includes(seat))
          heuristicTotal += delta / heuristicSeats.length;
        else randomTotal += delta / (5 - heuristicSeats.length);
      });
    }
    expect(heuristicTotal).toBeGreaterThan(randomTotal);
  });

  it("규칙 기반 봇끼리 하면 주공이 공약을 꽤 자주 지킨다", () => {
    let wins = 0;
    let rounds = 0;
    for (let seed = 0; seed < 20; seed++) {
      const result = simulate({
        rules: standard5,
        seed,
        bots: Array(5).fill(heuristicBot),
        rounds: 10,
      });
      wins += result.declarerWins;
      rounds += result.declarerRounds;
    }
    const rate = wins / rounds;
    // 너무 낮으면 공약을 무리하게 부르고, 너무 높으면 너무 소심하게 부른다는 뜻이다.
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.9);
  });
});
