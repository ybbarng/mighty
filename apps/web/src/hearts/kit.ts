import type { Card } from "@mighty/engine";
import { realHeartsAction } from "@mighty/fair-play";
import {
  type Action,
  createMatch,
  decodeHeartsRules,
  encodeHeartsRules,
  type GameEvent,
  type HeartsRules,
  type MatchState,
  PLAYER_COUNT,
  type PlayerView,
  pendingSeats,
  pointsOf,
  replay,
  step,
  viewOf,
} from "@mighty/hearts-engine";
import type { GameKit } from "@/game/kit";
import { cardLabel, SUIT_SYMBOL } from "@/game/terms";

import { heartsBotFor } from "./bots";
import { explainHearts } from "./commentary";
import type { HeartsLevel } from "./settings";
import { heartsStats } from "./stats";

import { sortHearts } from "./terms";

export type HeartsKit = GameKit<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  Card[][]
>;

/** 하트 엔진을 대국 진행·온라인 방에 잇는다 */
export const heartsKit: HeartsKit = {
  id: "hearts",
  // 정해진 패(멘탈 포커의 자리 표)로 시작할 수 있다.
  createMatch: (rules, seed, presetHands) =>
    createMatch({ rules, seed, ...(presetHands ? { presetHands } : {}) }),
  step,
  viewOf,
  replay: (rules, seed, log, presetHands) =>
    replay({ rules, seed, ...(presetHands ? { presetHands } : {}) }, log),
  pendingSeats,
  playerCount: () => PLAYER_COUNT,
  encodeRules: encodeHeartsRules,
  decodeRules: decodeHeartsRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      direction: view.direction,
    },
    { type: "dealt", handSize: 13 },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 끝내기는 게임 전체를 끝내므로 참가자에게는 허락하지 않는다.
  guestMayAct: (action) => action.type !== "retire",
  retireAction: { type: "retire" },
  stats: heartsStats,
  // 멘탈 포커 판의 판 패: { hands: 자리마다 처음 패 }(fair-play HeartsRoundDeal과 같다).
  review: {
    firstExtra: (deals) =>
      (deals.get(1) as { hands: Card[][] } | undefined)?.hands,
    prepare: (state, deals) => {
      const next = structuredClone(state);
      const hands = (
        deals.get(next.roundNumber + 1) as { hands: Card[][] } | undefined
      )?.hands;
      if (hands) next.presetHands = hands;
      else delete next.presetHands;
      return next;
    },
    realAction: (action, deal) => {
      const cards = (deal as { cards?: [number, Card][] } | undefined)?.cards;
      return cards
        ? realHeartsAction(action as Action, new Map(cards))
        : action;
    },
    situation: (state) => {
      const round = state.round;
      const voids = state.players.map(() => new Set<string>());
      const tricks = [...round.tricks, ...(round.trick ? [round.trick] : [])];
      for (const trick of tricks) {
        const lead = trick.plays[0]?.card[0];
        for (const play of trick.plays.slice(1))
          if (lead && play.card[0] !== lead)
            voids[play.seat]?.add(
              SUIT_SYMBOL[lead as keyof typeof SUIT_SYMBOL],
            );
      }
      return {
        voids: voids.map((v) => [...v]),
        tally: state.players.map((seat) => ({
          seat,
          label: "이번 판",
          value: `${pointsOf(round.taken[seat] ?? [], state.rules)}점`,
        })),
      };
    },
    sortHand: (_state, cards) => sortHearts(cards as Card[]),
    explain: explainHearts,
    describe: (action) => {
      const a = action as Action;
      switch (a.type) {
        case "pass":
          return `넘기기 ${a.cards.map((c) => cardLabel(c)).join(" ")}`;
        case "play":
          return cardLabel(a.card);
        default:
          return a.type === "continue" ? "다음 판" : a.type;
      }
    },
    cleanup: (state) => {
      delete state.presetHands;
      return state;
    },
  },
  botFor: (level) => heartsBotFor(level as HeartsLevel),
  annotateBotAction: (view, action) =>
    action.type === "play" && action.slot === undefined
      ? { ...action, slot: sortHearts(view.hand).indexOf(action.card) }
      : action,
};
