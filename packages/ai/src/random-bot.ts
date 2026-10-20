import {
  type Action,
  type Card,
  nextFloat,
  nextInt,
  type PlayerView,
  type RngState,
  SUITS,
  shuffleInPlace,
} from "@mighty/engine";

import type { Bot } from "./bot";

function pickOne<T>(rng: RngState, items: readonly T[]): T {
  const item = items[nextInt(rng, items.length)];
  if (item === undefined) throw new Error("고를 것이 없다");
  return item;
}

/** 할 수 있는 행동 중 아무거나 고른다. 비교 기준과 테스트용. */
export const randomBot: Bot = {
  name: "random",
  decide(view: PlayerView, rng: RngState): Action {
    const decision = view.decision;
    if (decision === null) throw new Error("결정할 것이 없다");
    switch (decision.kind) {
      case "pick":
        return { type: "pick", index: nextInt(rng, 2) as 0 | 1 };
      case "election": {
        if (decision.canDealMiss) return { type: "dealMiss" };
        const lowest = decision.bids.slice(0, 1);
        if (lowest.length > 0 && (!decision.canPass || nextFloat(rng) < 0.3)) {
          return { type: "bid", goal: pickOne(rng, lowest) };
        }
        if (decision.canPass) return { type: "pass" };
        return { type: "bid", goal: pickOne(rng, decision.bids) };
      }
      case "kill":
        return { type: "kill", card: pickOne(rng, decision.candidates) };
      case "exchange": {
        const hand: Card[] = shuffleInPlace(rng, [...view.hand]);
        return {
          type: "exchange",
          goal: decision.electedGoal,
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
        };
      }
      case "continue":
        return { type: "continue" };
    }
  },
};
