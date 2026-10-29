import {
  type BaseballRules,
  type BaseballState,
  cluesOf,
  createMatch,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/baseball-engine";
import { createRng } from "@mighty/engine";

import type { BaseballBot } from "./bots";

/** 봇 둘이 한 게임을 끝까지 둔다(세기 비교·시험용). 자리 0이 `bots[0]` */
export function playGame(
  bots: readonly [BaseballBot, BaseballBot],
  rules: BaseballRules,
  seed: number,
): BaseballState {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 20_000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as BaseballBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 둘 수 없는 수: ${result.error}`);
    state = result.state;
  }
  throw new Error("게임이 끝나지 않는다");
}

/** 퍼즐 한 판: 봇이 컴퓨터 수를 맞히기까지 물어본 횟수 */
export function solvePuzzle(
  bot: BaseballBot,
  rules: BaseballRules,
  seed: number,
): number {
  const state = playGame(
    [bot, bot],
    { ...rules, mode: "puzzle", winsToFinish: 1 },
    seed,
  );
  return cluesOf(state, 0).length;
}
