import { createRng } from "@mighty/engine";
import {
  createMatch,
  type GostopRules,
  type GostopState,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/gostop-engine";

import type { GostopBot } from "./bots";

/** 봇끼리 한 게임을 끝까지 한다(세기 비교·시험용). 자리 i가 `bots[i]` */
export function playGame(
  bots: readonly GostopBot[],
  rules: GostopRules,
  seed: number,
): GostopState {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 5000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as GostopBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 둘 수 없는 수: ${result.error}`);
    state = result.state;
  }
  throw new Error("게임이 끝나지 않는다");
}
