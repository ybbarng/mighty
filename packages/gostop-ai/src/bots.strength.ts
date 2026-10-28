import { createRng } from "@mighty/engine";
import {
  createMatch,
  GOSTOP3_RULES,
  type GostopRules,
  MATGO_RULES,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/gostop-engine";
import { expect, it } from "vitest";

import {
  type GostopBot,
  gostopBeginnerBot,
  gostopExpertBot,
  gostopIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(장기 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

const ONE_ROUND: GostopRules = { ...MATGO_RULES, rounds: 1 };
const GAMES = Number(
  (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env.GOSTOP_BENCH_GAMES ?? 400,
);

/**
 * 맞고 한 판씩 `games`판. 같은 패를 자리만 바꿔 두 번씩 한다(패 운을 지운다).
 * 판 승패와 점수 합을 센다
 */
function duel(strong: GostopBot, weak: GostopBot, games: number) {
  let won = 0;
  let lost = 0;
  let money = 0;
  for (let g = 0; g < games; g++) {
    const seat = g % 2;
    const seed = (g >> 1) + 1;
    const bots = seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, ONE_ROUND, seed);
    const winner = end.result?.winner ?? null;
    if (winner === seat) won++;
    else if (winner !== null) lost++;
    money += end.scores[seat] ?? 0;
  }
  console.log(
    `${strong.name} 대 ${weak.name}: ${won}승 ${lost}패 ${games - won - lost}나가리, 판마다 평균 ${(money / games).toFixed(2)}점`,
  );
  return { won, lost, money };
}

it("고수 한 수에 걸리는 시간", () => {
  const times: number[] = [];
  const goTimes: number[] = [];
  for (const rules of [ONE_ROUND, { ...GOSTOP3_RULES, rounds: 1 }]) {
    for (let seed = 1; seed <= 10; seed++) {
      let { state } = createMatch(rules, seed);
      const rng = createRng(seed);
      while (state.phase === "play") {
        const seat = pendingSeats(state)[0] as number;
        const view = viewOf(state, seat);
        const t = performance.now();
        const action = gostopExpertBot.decide(view, rng);
        if (view.decision?.kind === "goStop")
          goTimes.push(performance.now() - t);
        else times.push(performance.now() - t);
        const r = step(state, seat, action);
        if (!r.ok) throw new Error(r.error);
        state = r.state;
      }
    }
  }
  for (const [label, list] of [
    ["카드 내기", times],
    ["고·스톱", goTimes],
  ] as const) {
    list.sort((a, b) => a - b);
    console.log(
      `고수 ${label}: 가운데 ${list[list.length >> 1]?.toFixed(0)}ms, 가장 긴 ${list.at(-1)?.toFixed(0)}ms (${list.length}번)`,
    );
  }
});

it("단계가 높을수록 이긴다(맞고)", () => {
  const mid = duel(gostopIntermediateBot, gostopBeginnerBot, GAMES);
  expect(mid.money).toBeGreaterThan(0);
  expect(mid.won).toBeGreaterThan(mid.lost);
  // 고수는 카드 내기가 중수와 거의 같아 이긴 판 수는 비슷하고, 고·스톱을 잘 골라 점수로 앞선다.
  const top = duel(gostopExpertBot, gostopIntermediateBot, GAMES);
  expect(top.money).toBeGreaterThan(0);
});

it("3명: 고수 한 명과 중수 두 명", () => {
  let money = 0;
  const games = Math.floor(GAMES / 2);
  for (let g = 0; g < games; g++) {
    const seat = g % 3;
    const seed = Math.floor(g / 3) + 1;
    const bots = [0, 1, 2].map((s) =>
      s === seat ? gostopExpertBot : gostopIntermediateBot,
    );
    const end = playGame(bots, { ...GOSTOP3_RULES, rounds: 1 }, seed);
    money += end.scores[seat] ?? 0;
  }
  console.log(`3명 고수: 판마다 평균 ${(money / games).toFixed(2)}점`);
  expect(money).toBeGreaterThan(0);
});
