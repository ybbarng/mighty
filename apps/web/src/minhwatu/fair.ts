import type { HwatuFairSpec } from "@mighty/fair-play";
import { sortCards } from "@mighty/hwatu";
import {
  type Action,
  createMatch,
  DEAL_SIZES,
  type GameEvent,
  type MinhwatuRules,
  type MinhwatuState,
  type MinhwatuView,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/minhwatu-engine";

import { withPreset } from "@/hwatu/fair";

/**
 * 민화투 멘탈 포커(docs/29). 손패를 내면 그 카드를, 더미를 뒤집으면 그 카드를 모두에게 연다.
 * 결정(낼지·고를지)은 손패에 달려 있지 않아 다시 계산할 것이 없다. 손패만 달 순서로 정리한다
 */
export const minhwatuFair: HwatuFairSpec<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent
> = {
  players: (rules) => rules.players,
  layout: (rules) => {
    const size = DEAL_SIZES[rules.players];
    return {
      hands: Array.from({ length: rules.players }, () => size.hand),
      floor: size.floor,
    };
  },
  redealOnFour: true,
  createMatch: (rules, seed, preset) => createMatch(rules, seed, preset),
  step,
  viewOf,
  pendingSeats,
  withPreset,
  roundOf: (state) => state.roundNumber,
  deckOf: (state) => state.deck,
  roundOver: (state) =>
    state.phase === "roundEnd" || state.phase === "gameOver",
  gameOver: (state) => state.phase === "gameOver",
  viewRoundOver: (view) =>
    view.phase === "roundEnd" || view.phase === "gameOver",
  viewGameOver: (view) => view.phase === "gameOver",
  deckUses: (_events, consumed) => Array.from({ length: consumed }, () => null),
  revealsOf: (action) => (action.type === "play" ? [action.card] : []),
  claimedOf: (action) => (action.type === "play" ? [action.card] : []),
  refreshView: (view) => ({ ...view, hand: sortCards(view.hand) }),
  // 더미는 손패를 낸 차례에만 뒤집는다.
  deckGuard: (_view, fresh) => fresh.length > 0,
};
