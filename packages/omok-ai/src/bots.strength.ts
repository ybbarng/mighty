import { createRng } from "@mighty/engine";
import {
  createMatch,
  type OmokRules,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/omok-engine";
import { expect, it } from "vitest";

import {
  type OmokBot,
  omokBeginnerBot,
  omokExpertBot,
  omokIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(fair-play 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

const STANDARD: OmokRules = { variant: "standard", winsToFinish: 1 };

/** `strong`이 흑백을 번갈아 쥐고 `games`판 두어 이긴 판·비긴 판을 센다 */
function duel(strong: OmokBot, weak: OmokBot, games: number) {
  let wins = 0;
  let draws = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [OmokBot, OmokBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, STANDARD, seed);
    if (end.wins[seat] === 1) wins++;
    else if (end.result?.kind === "draw") draws++;
  }
  console.log(
    `${strong.name} 대 ${weak.name}: ${wins}승 ${draws}무 / ${games}판`,
  );
  return wins;
}

it("단계가 높을수록 이긴다", () => {
  expect(duel(omokIntermediateBot, omokBeginnerBot, 20)).toBeGreaterThanOrEqual(
    16,
  );
  expect(duel(omokExpertBot, omokIntermediateBot, 20)).toBeGreaterThanOrEqual(
    14,
  );
});

it("고수 한 수에 걸리는 시간", () => {
  let { state } = createMatch(STANDARD, 1);
  const rng = createRng(2);
  const times: number[] = [];
  for (let i = 0; i < 40 && state.phase === "play"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const bot = seat === state.blackSeat ? omokExpertBot : omokIntermediateBot;
    const t = performance.now();
    const action = bot.decide(viewOf(state, seat), rng);
    if (bot === omokExpertBot) times.push(performance.now() - t);
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  times.sort((a, b) => a - b);
  console.log(
    `고수 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms`,
  );
});
