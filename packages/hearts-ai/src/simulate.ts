import { createRng } from "@mighty/engine";
import {
  createMatch,
  type HeartsRules,
  type MatchState,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/hearts-engine";

import type { HeartsBot } from "./knowledge";

export interface HeartsSimulationResult {
  state: MatchState;
  /** 끝낸 판 수 */
  rounds: number;
  /** 자리별 받은 점수 합(낮을수록 잘했다) */
  points: number[];
}

/** 봇끼리 하트를 둔다. `rounds`판을 끝내거나 게임이 끝나면 멈춘다 */
export function simulateHearts(options: {
  rules: HeartsRules;
  seed: number;
  bots: readonly HeartsBot[];
  rounds: number;
}): HeartsSimulationResult {
  const rng = createRng(options.seed ^ 0x2545f491);
  let { state } = createMatch({ rules: options.rules, seed: options.seed });
  let rounds = 0;
  for (let guard = 0; guard < 100_000 && rounds < options.rounds; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) break;
    const bot = options.bots[seat] as HeartsBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(
        `${bot.name}(${seat}): ${result.error} ${JSON.stringify(action)}`,
      );
    state = result.state;
    for (const e of result.events) if (e.type === "roundScored") rounds++;
  }
  return { state, rounds, points: [...state.scores] };
}
