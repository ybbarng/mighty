import { SUITS } from "./cards";
import type { Decision } from "./decision";
import { decisionFor } from "./decision";
import { nextFloat, nextInt, type RngState, shuffleInPlace } from "./rng";
import type { Action, MatchState } from "./state";

function pickOne<T>(rng: RngState, items: readonly T[]): T {
  const item = items[nextInt(rng, items.length)];
  if (item === undefined) throw new Error("고를 것이 없다");
  return item;
}

/** 결정에 맞는 행동을 무작위로 고른다. 공약은 낮은 쪽을 자주 골라 선거가 너무 빨리 끝나지 않게 한다. */
export function randomAction(
  state: MatchState,
  seat: number,
  decision: Decision,
  rng: RngState,
): Action {
  switch (decision.kind) {
    case "pick":
      return { type: "pick", index: nextInt(rng, 2) as 0 | 1 };
    case "election": {
      if (decision.canDealMiss && nextFloat(rng) < 0.5)
        return { type: "dealMiss" };
      const bids = [...decision.bids]
        .sort((a, b) => a.score - b.score)
        .slice(0, 6);
      if (bids.length > 0 && (!decision.canPass || nextFloat(rng) < 0.4)) {
        return { type: "bid", goal: pickOne(rng, bids) };
      }
      if (decision.canPass) return { type: "pass" };
      return { type: "bid", goal: pickOne(rng, decision.bids) };
    }
    case "kill":
      return { type: "kill", card: pickOne(rng, decision.candidates) };
    case "exchange": {
      const hand = shuffleInPlace(rng, [...(state.round.hands[seat] ?? [])]);
      const goal =
        nextFloat(rng) < 0.7
          ? decision.electedGoal
          : pickOne(rng, decision.goals);
      return {
        type: "exchange",
        goal,
        discard: hand.slice(0, decision.discardCount),
      };
    }
    case "friend":
      return { type: "friend", friend: pickOne(rng, decision.options) };
    case "play": {
      const card = pickOne(rng, decision.cards);
      return {
        type: "play",
        card,
        ...(decision.leading && card === "JK"
          ? { jokerSuit: pickOne(rng, SUITS) }
          : {}),
        ...(card === decision.jokerCallCard
          ? { jokerCall: nextFloat(rng) < 0.5 }
          : {}),
      };
    }
    case "continue":
      return { type: "continue" };
  }
}

/** 지금 결정할 자리. 판이 끝났으면 아직 넘어가지 않은 첫 자리. */
export function actingSeat(state: MatchState): number | null {
  const { round } = state;
  if (round.phase === "gameOver") return null;
  if (round.phase === "roundEnd") {
    return state.order.find((s) => decisionFor(state, s) !== null) ?? null;
  }
  return round.turn;
}
