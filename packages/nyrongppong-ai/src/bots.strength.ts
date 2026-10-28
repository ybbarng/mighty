import { createRng } from "@mighty/engine";
import {
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/nyrongppong-engine";
import { expect, it } from "vitest";

import {
  type NyrongppongBot,
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "./bots";
import { nyrongppongExpertBot } from "./expert";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(장기 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

/**
 * 4인 판(5판씩): 같은 시드로 두 번 한다. 한 번은 한 자리에 `strong`, 나머지 셋은 `weak`,
 * 한 번은 넷 모두 `weak`. 그 자리 합계 차이를 모으면 패 운이 많이 지워진다(짝 비교).
 * 자리는 시드마다 돌린다. 1등(같은 점수 포함) 횟수도 센다
 */
function paired(strong: NyrongppongBot, weak: NyrongppongBot, games: number) {
  let diff = 0;
  let firsts = 0;
  let baseFirsts = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 4;
    const mixed = playGame(
      [0, 1, 2, 3].map((s) => (s === seat ? strong : weak)),
      STANDARD_RULES,
      seed,
    );
    const base = playGame([weak, weak, weak, weak], STANDARD_RULES, seed);
    const mine = mixed.totals[seat] as number;
    const before = base.totals[seat] as number;
    diff += mine - before;
    if (mixed.totals.every((t) => t >= mine)) firsts++;
    if (base.totals.every((t) => t >= before)) baseFirsts++;
  }
  const result = { diff: diff / games, firsts, baseFirsts };
  console.log(
    `4인 ${games}게임: ${weak.name} 자리에 ${strong.name}를 앉히면 합계 ${result.diff.toFixed(1)}점, 1등 ${baseFirsts}번 → ${firsts}번`,
  );
  return result;
}

/** 2인 판: 둘이 자리를 바꿔 가며 `games`게임, 센 봇이 이긴(합계가 낮은) 게임 수 */
function duel(strong: NyrongppongBot, weak: NyrongppongBot, games: number) {
  let wins = 0;
  let ties = 0;
  const rules = { ...STANDARD_RULES, players: 2 };
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots = seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, rules, seed);
    const mine = end.totals[seat] as number;
    const theirs = end.totals[1 - seat] as number;
    if (mine < theirs) wins++;
    if (mine === theirs) ties++;
  }
  console.log(
    `2인 ${games}게임: ${strong.name} 대 ${weak.name} ${wins}승 ${ties}비김`,
  );
  return wins;
}

it("고수 한 수에 걸리는 시간", () => {
  let { state } = createMatch(STANDARD_RULES, 3);
  const rng = createRng(4);
  const times: number[] = [];
  for (let i = 0; i < 400 && state.phase !== "gameOver"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const t = performance.now();
    const action = nyrongppongExpertBot.decide(viewOf(state, seat), rng);
    times.push(performance.now() - t);
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  times.sort((a, b) => a - b);
  console.log(
    `고수 한 수: 가운데 ${times[times.length >> 1]?.toFixed(2)}ms, 가장 긴 ${times.at(-1)?.toFixed(1)}ms (${times.length}수)`,
  );
  expect(times.at(-1)).toBeLessThan(1000);
});

it("단계가 높을수록 합계가 낮고 1등을 많이 한다(4인)", () => {
  const a = paired(nyrongppongIntermediateBot, nyrongppongBeginnerBot, 600);
  expect(a.diff).toBeLessThan(0);
  expect(a.firsts).toBeGreaterThan(a.baseFirsts);
  const b = paired(nyrongppongExpertBot, nyrongppongIntermediateBot, 600);
  expect(b.diff).toBeLessThan(0);
  expect(b.firsts).toBeGreaterThan(b.baseFirsts);
});

it("단계가 높을수록 이긴다(2인)", () => {
  expect(
    duel(nyrongppongIntermediateBot, nyrongppongBeginnerBot, 400),
  ).toBeGreaterThan(220);
  expect(
    duel(nyrongppongExpertBot, nyrongppongIntermediateBot, 400),
  ).toBeGreaterThan(200);
});
