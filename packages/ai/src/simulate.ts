import {
  createMatch,
  createRng,
  decisionFor,
  type MatchState,
  type RuleSet,
  step,
  viewOf,
} from "@mighty/engine";

import type { Bot } from "./bot";

export interface SimulationOptions {
  rules: RuleSet;
  seed: number;
  /** 자리 순서대로 앉힐 봇 */
  bots: readonly Bot[];
  /** 점수 계산까지 끝낸 판 수. 그 전에 누가 파산하면 멈춘다 */
  rounds: number;
}

export interface SimulationResult {
  state: MatchState;
  roundsPlayed: number;
  /** 자리별 돈 변화 */
  moneyDelta: number[];
  /** 주공이 이긴 판 수 / 주공을 한 판 수 */
  declarerWins: number;
  declarerRounds: number;
}

/** 지금 결정할 자리. 판이 끝났으면 아직 넘어가지 않은 첫 자리. */
export function actingSeat(state: MatchState): number | null {
  const { round } = state;
  if (round.phase === "gameOver") return null;
  if (round.phase === "roundEnd")
    return state.order.find((s) => decisionFor(state, s) !== null) ?? null;
  return round.turn;
}

/** 봇끼리 대국을 돌린다. */
export function simulate(options: SimulationOptions): SimulationResult {
  const { rules, bots } = options;
  if (bots.length !== rules.playerCount)
    throw new Error("인원과 봇 수가 다르다");
  const rng = createRng(options.seed ^ 0x5bd1e995);
  let { state } = createMatch({ rules, seed: options.seed });
  const startMoney = [...state.money];
  let roundsPlayed = 0;
  let declarerWins = 0;

  for (
    let guard = 0;
    guard < 100_000 && roundsPlayed < options.rounds;
    guard++
  ) {
    const seat = actingSeat(state);
    if (seat === null) break;
    const bot = bots[seat] as Bot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(
        `${bot.name}(${seat}): ${result.error} ${JSON.stringify(action)}`,
      );
    state = result.state;
    for (const event of result.events) {
      if (event.type !== "roundScored") continue;
      roundsPlayed++;
      if (event.result.rulingWon) declarerWins++;
    }
  }

  return {
    state,
    roundsPlayed,
    moneyDelta: state.money.map((m, i) => m - (startMoney[i] ?? 0)),
    declarerWins,
    declarerRounds: roundsPlayed,
  };
}
