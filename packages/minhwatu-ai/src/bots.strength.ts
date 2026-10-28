import { createRng } from "@mighty/engine";
import {
  createMatch,
  type MinhwatuRules,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/minhwatu-engine";
import { expect, it } from "vitest";

import {
  type MinhwatuBot,
  minhwatuBeginnerBot,
  minhwatuExpertBot,
  minhwatuIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(장기 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

/**
 * `strong` 하나와 `weak` 둘(3인)이 자리를 돌려 가며 `games`게임(게임마다 한 판) 둔다.
 * 판 점수 합은 0이므로 `strong`의 평균 판 점수가 0보다 크면 더 세다. 1등 비율은 셋이 같으면 1/3이다
 */
function duel(
  strong: MinhwatuBot,
  weak: MinhwatuBot,
  games: number,
  players: 2 | 3 = 3,
) {
  const rules: MinhwatuRules = { ...STANDARD_RULES, players, rounds: 1 };
  let points = 0;
  let squares = 0;
  let firsts = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % players;
    const bots = Array.from({ length: players }, (_, i) =>
      i === seat ? strong : weak,
    );
    const end = playGame(bots, rules, seed);
    const total = end.totals[seat] ?? 0;
    points += total;
    squares += total * total;
    if (total === Math.max(...end.totals)) firsts++;
  }
  const average = points / games;
  const sd = Math.sqrt(squares / games - average * average);
  console.log(
    `${players}인 ${strong.name} 대 ${weak.name}: 평균 판 점수 ${average.toFixed(1)}(표준오차 ${(sd / Math.sqrt(games)).toFixed(1)}), 1등 ${firsts}/${games}판`,
  );
  return { average, firsts };
}

it("고수 한 수에 걸리는 시간", () => {
  let { state } = createMatch({ ...STANDARD_RULES, rounds: 1 }, 1);
  const rng = createRng(2);
  const times: number[] = [];
  while (state.phase !== "gameOver") {
    const seat = pendingSeats(state)[0] as number;
    const t = performance.now();
    const action = minhwatuExpertBot.decide(viewOf(state, seat), rng);
    times.push(performance.now() - t);
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  times.sort((a, b) => a - b);
  console.log(
    `고수 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms (${times.length}수)`,
  );
});

it("단계가 높을수록 점수를 많이 딴다", () => {
  const mid = duel(minhwatuIntermediateBot, minhwatuBeginnerBot, 600);
  expect(mid.average).toBeGreaterThan(5);
  const top = duel(minhwatuExpertBot, minhwatuIntermediateBot, 600);
  expect(top.average).toBeGreaterThan(3);
  duel(minhwatuExpertBot, minhwatuBeginnerBot, 150);
  duel(minhwatuExpertBot, minhwatuIntermediateBot, 150, 2);
});
