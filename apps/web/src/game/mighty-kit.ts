import {
  type Action,
  type Card,
  createMatch,
  decisionFor,
  decodeRuleString,
  encodeRuleString,
  type GameEvent,
  isJoker,
  isPointCard,
  leadSuitOf,
  type MatchState,
  mightyOf,
  type PlayerView,
  type PresetDeal,
  type RuleSet,
  replay,
  step,
  suitOf,
  viewOf,
} from "@mighty/engine";

import { realAction } from "@mighty/fair-play";

import { type BotLevel, botFor } from "./bots";
import type { GameKit } from "./kit";

/** 멘탈 포커 판 하나의 실제 패(복기용) */
interface MightyDeal {
  deal: PresetDeal;
  redeal?: Card[];
}

import { mightyStats } from "./mighty-stats";
import { cardLabel, goalLabel, SUIT_SYMBOL, sortHand } from "./terms";

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
  // 그만두기는 게임 전체를 끝내므로 참가자에게는 허락하지 않는다(모의 침투 B6).
  guestMayAct: (action) => action.type !== "retire",
  retireAction: { type: "retire" },
  stats: mightyStats,
  // 멘탈 포커 판의 판 패: { deal: 처음 나눈 패, redeal?: 6·7마 다시 나눈 순서 }(fair-play RoundDeal과 같다).
  review: {
    firstExtra: (deals) => (deals.get(1) as MightyDeal | undefined)?.deal,
    prepare: (state, deals) => {
      const next = structuredClone(state);
      const round = next.roundNumber;
      next.presetDeal =
        (deals.get(round + 1) as MightyDeal | undefined)?.deal ?? null;
      const redeal = (deals.get(round) as MightyDeal | undefined)?.redeal;
      if (next.round.phase === "kill" && redeal) next.presetRedeal = redeal;
      return next;
    },
    realAction: (action, deal) => {
      const cards = (deal as { cards?: [number, Card][] } | undefined)?.cards;
      return cards ? realAction(action as Action, new Map(cards)) : action;
    },
    situation: (state) => {
      const round = state.round;
      const mighty = round.goal
        ? mightyOf(state.rules, round.goal.kiruda)
        : null;
      const voids = state.order.map(() => new Set<string>());
      let ruling = 0;
      let opposition = 0;
      const ruler = (seat: number) =>
        seat === round.declarer || seat === round.friend;
      const tricks = [...round.tricks, ...(round.trick ? [round.trick] : [])];
      for (const trick of tricks) {
        const lead = leadSuitOf({
          cards: trick.plays.map((p) => p.card),
          jokerSuit: trick.jokerSuit,
          jokerCalled: trick.jokerCalled,
        });
        for (const play of trick.plays.slice(1)) {
          // 마이티와 조커는 언제든 낼 수 있어 무늬를 따르지 않아도 떨어진 것이 아니다.
          if (!lead || isJoker(play.card) || play.card === mighty) continue;
          if (suitOf(play.card) !== lead)
            voids[play.seat]?.add(SUIT_SYMBOL[lead]);
        }
        if ("winner" in trick) {
          const points = trick.plays.filter((p) => isPointCard(p.card)).length;
          if (ruler(trick.winner as number)) ruling += points;
          else opposition += points;
        }
      }
      const total = 20;
      return {
        voids: voids.map((v) => [...v]),
        tally:
          round.declarer === null
            ? []
            : [
                { label: "여당 점수 카드", value: `${ruling}장` },
                { label: "야당 점수 카드", value: `${opposition}장` },
                {
                  label: "남은 점수 카드",
                  value: `${total - ruling - opposition}장`,
                },
                ...(round.goal
                  ? [{ label: "공약", value: `${round.goal.score}장` }]
                  : []),
              ],
      };
    },
    describe: (action) => {
      const a = action as Action;
      switch (a.type) {
        case "play":
          return `${cardLabel(a.card)}${a.jokerCall ? " 조커콜" : ""}${a.jokerSuit ? ` (${SUIT_SYMBOL[a.jokerSuit]} 지정)` : ""}`;
        case "bid":
          return `공약 ${goalLabel(a.goal)}`;
        case "pass":
          return "포기";
        case "kill":
          return `${cardLabel(a.card)} 죽이기`;
        case "exchange":
          return `버리기 ${a.discard.map(cardLabel).join(" ")}`;
        case "friend":
          return "프렌드 정하기";
        case "dealMiss":
          return "딜미스";
        case "pick":
          return a.index === 0 ? "앞면 고르기" : "뒷면 고르기";
        case "continue":
          return "다음 판";
        case "retire":
          return "그만두기";
      }
    },
    cleanup: (state, before) => {
      // 판을 새로 시작하지 않았으면 다음 판 패는 넣지 않은 상태로 둔다.
      if (state.roundNumber === before.roundNumber) state.presetDeal = null;
      delete state.presetRedeal;
      return state;
    },
  },
  botFor: (level) => botFor(level as BotLevel),
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
