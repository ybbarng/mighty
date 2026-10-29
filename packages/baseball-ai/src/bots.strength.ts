import {
  type BaseballRules,
  createBaseballScenario,
  STANDARD_RULES,
  viewOf,
} from "@mighty/baseball-engine";
import { createRng } from "@mighty/engine";
import { expect, it } from "vitest";

import {
  type BaseballBot,
  baseballBeginnerBot,
  baseballExpertBot,
  baseballIntermediateBot,
} from "./bots";
import { playGame, solvePuzzle } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(오목 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

const BOTS = [baseballBeginnerBot, baseballIntermediateBot, baseballExpertBot];

/** 퍼즐을 `games`판 풀어 평균·가장 많이 물은 횟수 */
function average(bot: BaseballBot, rules: BaseballRules, games: number) {
  const counts: number[] = [];
  for (let seed = 1; seed <= games; seed++)
    counts.push(solvePuzzle(bot, rules, seed));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  return { mean, max: Math.max(...counts) };
}

/** `strong`이 선을 번갈아 쥐고 `games`판 두어 이긴·비긴 판을 센다 */
function duel(
  strong: BaseballBot,
  weak: BaseballBot,
  games: number,
  rules: BaseballRules = STANDARD_RULES,
) {
  let wins = 0;
  let losses = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [BaseballBot, BaseballBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, rules, seed);
    if (end.wins[seat] === 1) wins++;
    else if (end.wins[1 - seat] === 1) losses++;
  }
  console.log(
    `${rules.digits}자리 ${strong.name} 대 ${weak.name}: ${wins}승 ${games - wins - losses}무 ${losses}패 / ${games}판`,
  );
  return { wins, losses };
}

it("평균 맞힌 횟수: 단계가 높을수록 적다", () => {
  for (const rules of [
    STANDARD_RULES,
    { ...STANDARD_RULES, digits: 4 as const, zero: true },
  ]) {
    const result = BOTS.map((bot) => average(bot, rules, 300));
    console.log(
      `${rules.digits}자리${rules.zero ? "·0 씀" : ""}: ${BOTS.map((b, i) => `${b.name} 평균 ${result[i]?.mean.toFixed(2)}번(최대 ${result[i]?.max})`).join(", ")}`,
    );
    const [beginner, intermediate, expert] = result.map((r) => r?.mean ?? 0);
    expect(beginner).toBeGreaterThan(intermediate as number);
    expect(intermediate).toBeGreaterThan(expert as number);
  }
});

it("대결: 위 단계가 아래 단계에 더 많이 이긴다", () => {
  // 숫자야구는 운이 크다. 평균 횟수 차이가 작아 판을 많이 둬야 차이가 보인다.
  const a = duel(baseballIntermediateBot, baseballBeginnerBot, 1000);
  expect(a.wins).toBeGreaterThan(a.losses);
  const b = duel(baseballExpertBot, baseballIntermediateBot, 4000);
  expect(b.wins).toBeGreaterThan(b.losses);
  const four = { ...STANDARD_RULES, digits: 4 as const, zero: true };
  const c = duel(baseballExpertBot, baseballIntermediateBot, 1000, four);
  expect(c.wins).toBeGreaterThan(c.losses);
});

it("고수 한 수에 걸리는 시간(네 자리·0 씀, 가장 무거운 둘째 수)", () => {
  const rules = { ...STANDARD_RULES, digits: 4 as const, zero: true };
  const times: number[] = [];
  for (const first of ["0123", "4567", "1023"]) {
    const state = createBaseballScenario({
      rules,
      secret: "9876",
      guesses: [first],
    });
    const t = performance.now();
    baseballExpertBot.decide(viewOf(state, 0), createRng(1));
    times.push(performance.now() - t);
  }
  console.log(
    `고수 둘째 수: ${times.map((t) => `${t.toFixed(0)}ms`).join(", ")}`,
  );
});
