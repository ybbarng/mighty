import { createRng } from "@mighty/engine";
import {
  createMatch,
  type JanggiRules,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/janggi-engine";
import { expect, it } from "vitest";

import {
  type JanggiBot,
  janggiBeginnerBot,
  janggiExpertBot,
  janggiIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(오목 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

const RULES: JanggiRules = STANDARD_RULES;

/** `strong`이 초·한을 번갈아 쥐고 `games`판 두어 이긴 판을 센다 */
function duel(strong: JanggiBot, weak: JanggiBot, games: number) {
  let wins = 0;
  const kinds: Record<string, number> = {};
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [JanggiBot, JanggiBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, RULES, seed);
    if (end.wins[seat] === 1) wins++;
    const kind = end.result?.kind ?? "?";
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  console.log(
    `${strong.name} 대 ${weak.name}: ${wins}승 / ${games}판`,
    JSON.stringify(kinds),
  );
  return wins;
}

it("고수 한 수에 걸리는 시간", () => {
  let { state } = createMatch(RULES, 1);
  const rng = createRng(2);
  const times: number[] = [];
  for (let i = 0; i < 80 && state.phase !== "gameOver"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const bot =
      seat === state.choSeat ? janggiExpertBot : janggiIntermediateBot;
    const t = performance.now();
    const action = bot.decide(viewOf(state, seat), rng);
    if (bot === janggiExpertBot && action.type === "move")
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

it("단계가 높을수록 이긴다", () => {
  expect(
    duel(janggiIntermediateBot, janggiBeginnerBot, 10),
  ).toBeGreaterThanOrEqual(8);
  expect(
    duel(janggiExpertBot, janggiIntermediateBot, 10),
  ).toBeGreaterThanOrEqual(7);
});
