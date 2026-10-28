import {
  type ChessRules,
  type ChessState,
  createMatch,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/chess-engine";
import { createRng } from "@mighty/engine";

import type { ChessBot } from "./bots";

/** 봇 둘이 한 게임을 끝까지 둔다(세기 비교·시험용). 자리 0이 `bots[0]` */
export function playGame(
  bots: readonly [ChessBot, ChessBot],
  rules: ChessRules,
  seed: number,
  start?: ChessState,
): ChessState {
  let state = start ?? createMatch(rules, seed).state;
  const rng = createRng(seed + 1);
  for (let guard = 0; guard < 3000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return state;
    const bot = bots[seat] as ChessBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${bot.name}이 둘 수 없는 수: ${result.error}`);
    state = result.state;
  }
  throw new Error("판이 끝나지 않는다");
}
