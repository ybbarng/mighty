import { createRng } from "@mighty/engine";
import {
  createMatch,
  type NyrongppongRules,
  type NyrongppongState,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/nyrongppong-engine";

import type { NyrongppongBot } from "./bots";

/** 봇들이 한 게임을 끝까지 한다(세기 비교·시험용). 자리 s에 `bots[s]` */
export function playGame(
  bots: readonly NyrongppongBot[],
  rules: NyrongppongRules,
  seed: number,
): NyrongppongState {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 20_000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as NyrongppongBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 할 수 없는 행동: ${result.error}`);
    state = result.state;
  }
  throw new Error("게임이 끝나지 않는다");
}
