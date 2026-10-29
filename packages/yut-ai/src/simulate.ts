import { createRng } from "@mighty/engine";
import {
  createMatch,
  pendingSeats,
  step,
  viewOf,
  type YutRules,
  type YutState,
} from "@mighty/yut-engine";

import type { YutBot } from "./bots";

/** 봇들이 한 게임을 끝까지 둔다(세기 비교·시험용). 자리 s가 `bots[s]` */
export function playGame(
  bots: readonly YutBot[],
  rules: YutRules,
  seed: number,
): YutState {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 50_000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as YutBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 둘 수 없는 수: ${result.error}`);
    state = result.state;
  }
  throw new Error("게임이 끝나지 않는다");
}
