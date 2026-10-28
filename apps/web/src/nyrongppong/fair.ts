import type { HwatuFairSpec } from "@mighty/fair-play";
import { sortCards } from "@mighty/hwatu";
import {
  type Action,
  createMatch,
  dealerOf,
  decisionFor,
  type GameEvent,
  HAND_SIZE,
  type NyrongppongRules,
  type NyrongppongState,
  type NyrongppongView,
  pendingSeats,
  sameMonthIn,
  step,
  viewOf,
} from "@mighty/nyrongppong-engine";

import { withPreset } from "@/hwatu/fair";

/**
 * 나이롱뽕 멘탈 포커(docs/30 4절).
 * - 더미에서 가져오는 카드는 가져가는 사람만 연다(다른 기기가 모두 열쇠를 공개한다)
 * - 버리는 카드는 모두에게 연다. 뽕은 그 달 두 장, 스톱·약은 손패 전부를 모두에게 연다
 * - 판이 끝나는 걸음 전에 모두 열쇠를 공개한다(남은 손패 합이 점수다)
 * - 엔진 멘탈 포커 판 규칙(state.fair): 버릴 때마다 모두에게 응답 창, 뽕한 적 있으면 늘 스톱을 묻는다
 */
export const nyrongppongFair: HwatuFairSpec<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent
> = {
  players: (rules) => rules.players,
  layout: (rules, seed, round) => {
    const dealer = dealerOf(rules, seed, round);
    return {
      hands: Array.from({ length: rules.players }, (_, seat) =>
        seat === dealer ? HAND_SIZE + 1 : HAND_SIZE,
      ),
      floor: 0,
    };
  },
  redealOnFour: false,
  revealBeforeEnd: true,
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
  deckUses: (events) =>
    events.flatMap((e) => (e.type === "drew" ? [e.seat] : [])),
  revealsOf: (action, view) => {
    switch (action.type) {
      case "discard":
        return [action.card];
      case "call":
        // 엔진이 고르는 두 장(같은 달을 달 순서로 앞의 두 장)을 보인다.
        return view.call
          ? sortCards(sameMonthIn(view.hand, view.call.card)).slice(0, 2)
          : [];
      case "stop":
      case "declare":
        return [...view.hand];
      default:
        return [];
    }
  },
  claimedOf: (action) => (action.type === "discard" ? [action.card] : []),
  refreshView: (view) => {
    const hand = sortCards(view.hand);
    const mine = view.call?.mine;
    const pseudo = {
      rules: view.rules,
      phase: view.phase,
      turn: view.turn,
      hands: view.handCounts.map((_, seat) =>
        seat === view.mySeat ? hand : [],
      ),
      melds: view.melds,
      continued: view.continued,
      call: view.call
        ? {
            from: view.call.from,
            card: view.call.card,
            responses:
              mine !== undefined ? [{ seat: view.mySeat, answer: mine }] : [],
            used: 0,
          }
        : null,
      fair: true,
    } as unknown as NyrongppongState;
    return { ...view, hand, decision: decisionFor(pseudo, view.mySeat) };
  },
};
