import {
  type Action,
  createMatch,
  decisionFor,
  decodeRuleString,
  encodeRuleString,
  type GameEvent,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  type RuleSet,
  replay,
  step,
  viewOf,
} from "@mighty/engine";

import type { GameKit } from "./kit";
import { sortHand } from "./terms";

export type MightyKit = GameKit<
  RuleSet,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  PresetDeal
>;

/** 마이티 엔진을 대국 진행·온라인 방에 잇는다 */
export const mightyKit: MightyKit = {
  id: "mighty",
  createMatch: (rules, seed, presetDeal) =>
    createMatch({ rules, seed, ...(presetDeal ? { presetDeal } : {}) }),
  step,
  viewOf,
  replay: (rules, seed, log, presetDeal) =>
    replay({ rules, seed, ...(presetDeal ? { presetDeal } : {}) }, log),
  pendingSeats(state) {
    const { round } = state;
    if (round.phase === "gameOver") return [];
    if (round.phase === "roundEnd")
      return state.order.filter((s) => decisionFor(state, s) !== null);
    return round.turn !== null ? [round.turn] : [];
  },
  playerCount: (rules) => rules.playerCount,
  encodeRules: encodeRuleString,
  decodeRules: (code) => {
    const result = decodeRuleString(code);
    return result.ok
      ? { ok: true, rules: result.rules }
      : { ok: false, reason: result.reason };
  },
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      beginner: view.beginner,
    },
    { type: "dealt", handSize: view.hand.length },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 튜토리얼 미션처럼 손패가 짧은 장면에서는 낼 카드가 떨어지면 멈춘다.
  botCanAct: (view) =>
    !(view.decision?.kind === "play" && view.decision.cards.length === 0),
  // 봇도 사람처럼 손패를 기본 순서로 펼쳐 들었다고 치고, 낸 카드의 위치를 알린다.
  annotateBotAction: (view, action) =>
    action.type === "play" && action.slot === undefined
      ? {
          ...action,
          slot: sortHand(
            view.hand,
            view.rules,
            view.goal?.kiruda ?? null,
          ).indexOf(action.card),
        }
      : action,
};
