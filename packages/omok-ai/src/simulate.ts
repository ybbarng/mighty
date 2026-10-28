import { createRng } from "@mighty/engine";
import {
  createMatch,
  type OmokRules,
  type OmokState,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/omok-engine";

import type { OmokBot } from "./bots";

/** 봇 둘이 한 판을 끝까지 둔다(세기 비교·시험용). 자리 0이 `bots[0]` */
export function playGame(
  bots: readonly [OmokBot, OmokBot],
  rules: OmokRules,
  seed: number,
): OmokState {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 2000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as OmokBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 둘 수 없는 수: ${result.error}`);
    state = result.state;
  }
  throw new Error("판이 끝나지 않는다");
}
