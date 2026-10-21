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
  replay,
  step,
  viewOf,
} from "@mighty/hearts-engine";

import type { GameKit } from "@/game/kit";

import { sortHearts } from "./terms";

export type HeartsKit = GameKit<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  undefined
>;

/** 하트 엔진을 대국 진행·온라인 방에 잇는다 */
export const heartsKit: HeartsKit = {
  id: "hearts",
  createMatch: (rules, seed) => createMatch({ rules, seed }),
  step,
  viewOf,
  replay: (rules, seed, log) => replay({ rules, seed }, log),
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
  annotateBotAction: (view, action) =>
    action.type === "play" && action.slot === undefined
      ? { ...action, slot: sortHearts(view.hand).indexOf(action.card) }
      : action,
};
