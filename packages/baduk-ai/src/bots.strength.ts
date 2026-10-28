import {
  type BadukRules,
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/baduk-engine";
import { createRng } from "@mighty/engine";
import { expect, it } from "vitest";

import {
  type BadukBot,
  badukBeginnerBot,
  badukExpertBot,
  badukIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(장기 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

const RULES: BadukRules = STANDARD_RULES;

/** `strong`이 흑·백을 번갈아 쥐고 `games`판 두어 이긴 판을 센다 */
function duel(strong: BadukBot, weak: BadukBot, games: number, rules = RULES) {
  let wins = 0;
  const margins: number[] = [];
  for (let seed = 1; seed <= games; seed++) {
    const black = createMatch(rules, seed).state.blackSeat;
    const seat = seed % 2 === 0 ? black : 1 - black;
    const bots: [BadukBot, BadukBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, rules, seed);
    if (end.wins[seat] === 1) wins++;
    if (end.result?.kind === "score")
      margins.push(Math.abs(end.result.count.black - end.result.count.white));
  }
  console.log(
    `${rules.size}줄 ${strong.name} 대 ${weak.name}: ${wins}승 / ${games}판, 집 차이 ${margins.join(",")}`,
  );
  return wins;
}

/** 한 판을 두며 `bot`의 한 수 시간을 잰다 */
function timeBot(bot: BadukBot, rules: BadukRules) {
  let { state } = createMatch(rules, 1);
  const rng = createRng(2);
  const times: number[] = [];
  for (let i = 0; i < 400 && state.phase === "play"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const mine = seat === state.blackSeat;
    const t = performance.now();
    const action = (mine ? bot : badukIntermediateBot).decide(
      viewOf(state, seat),
      rng,
    );
    if (mine) times.push(performance.now() - t);
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  times.sort((a, b) => a - b);
  console.log(
    `${rules.size}줄 ${bot.name} 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms (${times.length}수)`,
  );
}

it("한 수에 걸리는 시간", () => {
  for (const size of [9, 13, 19] as const)
    for (const bot of [badukIntermediateBot, badukExpertBot])
      timeBot(bot, { ...RULES, size });
});

it("단계가 높을수록 이긴다(9줄)", () => {
  expect(
    duel(badukIntermediateBot, badukBeginnerBot, 10),
  ).toBeGreaterThanOrEqual(8);
  expect(duel(badukExpertBot, badukIntermediateBot, 10)).toBeGreaterThanOrEqual(
    7,
  );
});
