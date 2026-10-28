import type { HwatuFairSpec } from "@mighty/fair-play";
import {
  type Action,
  createMatch,
  dealSizes,
  decisionFor,
  type GameEvent,
  type GostopRules,
  type GostopState,
  type GostopView,
  pendingSeats,
  step,
  viewOf,
} from "@mighty/gostop-engine";
import { monthOf } from "@mighty/hwatu";

import { withPreset } from "@/hwatu/fair";

/** 내 손패의 그 달 카드 */
function sameMonth(hand: readonly string[], month: number): string[] {
  return hand.filter((id) => monthOf(id) === month);
}

/**
 * 고스톱 멘탈 포커(docs/28).
 * - 손패를 내면 그 카드, 흔들면 그 달 석 장, 폭탄이면 그 달 석 장을 모두에게 연다
 * - 더미에서 뒤집는 카드는 그 순간 모두에게 연다
 * - 총통: 손패가 열리면 같은 달 넉 장을 받은 사람이 그 넉 장을 먼저 보이고 판을 시작한다(엔진이 바로 끝낸다)
 * - 낼 수 있는 카드·흔들기·폭탄은 내 손패로 다시 계산한다(엔진 `decisionFor`)
 */
export const gostopFair: HwatuFairSpec<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent
> = {
  players: (rules) => rules.players,
  layout: (rules) => {
    const size = dealSizes(rules);
    return {
      hands: Array.from({ length: rules.players }, () => size.hand),
      floor: size.floor,
    };
  },
  redealOnFour: true,
  chongtong: true,
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
  revealsOf: (action, view) => {
    if (action.type === "play")
      return action.shake
        ? sameMonth(view.hand, monthOf(action.card))
        : [action.card];
    if (action.type === "bomb") return sameMonth(view.hand, action.month);
    return [];
  },
  claimedOf: (action) => (action.type === "play" ? [action.card] : []),
  refreshView: (view) => {
    const { mySeat, hand, handCounts, deckCount } = view;
    const pseudo = {
      ...view,
      seed: 0,
      hands: handCounts.map((_, seat) => (seat === mySeat ? hand : [])),
      deck: Array.from({ length: deckCount }, () => ""),
    } as unknown as GostopState;
    return { ...view, decision: decisionFor(pseudo, mySeat) };
  },
};
