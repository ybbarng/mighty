import { cardOf, sortCards } from "@mighty/hwatu";
import {
  greedyValue,
  minhwatuBotFor,
  minhwatuExpertBot,
} from "@mighty/minhwatu-ai";
import {
  type Action,
  createMatch,
  DEAL_SIZES,
  decodeMinhwatuRules,
  encodeMinhwatuRules,
  type GameEvent,
  type MinhwatuRules,
  type MinhwatuState,
  type MinhwatuView,
  pendingSeats,
  replay,
  step,
  sumPoints,
  viewOf,
  YAK_NAMES,
  yaksOf,
} from "@mighty/minhwatu-engine";

import type { Commentary, GameKit, Verdict } from "@/game/kit";

import { minhwatuStats } from "./stats";

export type MinhwatuKit = GameKit<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  undefined
>;

/** 행동 한 줄 설명 */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "play":
      return action.target
        ? `${cardOf(action.card).name} → ${cardOf(action.target).name}`
        : cardOf(action.card).name;
    case "pick":
      return `${cardOf(action.target).name} 고르기`;
    case "continue":
      return "다음 판";
    case "retire":
      return "끝내기";
  }
}

/** 지금 먹는 값의 차이(점)로 평가한다 */
function verdictOf(loss: number): Verdict {
  if (loss <= 2) return "good";
  if (loss <= 10) return "fine";
  if (loss <= 25) return "slip";
  return "bad";
}

/** 다시 보기 해설: 둔 수를 고수가 고르는 수와 견준다 */
export function explainMinhwatu(
  state: MinhwatuState,
  next: { seat: number; action: unknown },
  _after: MinhwatuState | null,
  seed: number,
  name: (seat: number) => string,
): Commentary {
  const action = next.action as Action;
  const situation = [
    `${state.roundNumber}판, ${name(next.seat)} 차례 · 더미 ${state.deck.length}장`,
  ];
  if (action.type !== "play" && action.type !== "pick")
    return { situation, verdict: null, reasons: [] };
  const view = viewOf(state, next.seat);
  const suggested = minhwatuExpertBot.decide(view, { seed: seed + 1 });
  const same = JSON.stringify(suggested) === JSON.stringify(action);
  if (same)
    return {
      situation,
      verdict: "good",
      reasons: [`${describeAction(action)}: 고수도 같은 수를 둔다`],
    };
  const mine = greedyValue(view, action);
  const best = Math.max(greedyValue(view, suggested), mine);
  return {
    situation,
    verdict: verdictOf(best - mine),
    reasons: [
      `둔 수: ${describeAction(action)}`,
      `고수의 수: ${describeAction(suggested)}`,
    ],
  };
}

/** 민화투 엔진을 대국 진행·온라인 방에 잇는다 */
export const minhwatuKit: MinhwatuKit = {
  id: "minhwatu",
  createMatch: (rules, seed) => createMatch(rules, seed),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, log),
  pendingSeats,
  playerCount: (rules) => rules.players,
  encodeRules: encodeMinhwatuRules,
  decodeRules: decodeMinhwatuRules,
  startEvents: (view) => [
    {
      type: "roundStarted",
      roundNumber: view.roundNumber,
      dealer: view.dealer,
      handSize: DEAL_SIZES[view.rules.players].hand,
    },
  ],
  isOver: (view) => view.phase === "gameOver",
  // 끝내기는 게임 전체를 끝내므로 참가자에게는 허락하지 않는다.
  guestMayAct: (action) => action.type !== "retire",
  retireAction: { type: "retire" },
  stats: minhwatuStats,
  // 방장 기기가 시드로 섞는다. 판마다 넣을 패가 없다.
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: state.hands.map(() => []),
      tally: state.captured.map((ids, seat) => {
        const yaks = yaksOf(ids, state.rules).map((y) => YAK_NAMES[y.id]);
        return {
          seat,
          label: "이번 판",
          value: `${sumPoints(ids)}점${yaks.length > 0 ? ` · ${yaks.join("·")}` : ""}`,
        };
      }),
    }),
    describe: (action) => describeAction(action as Action),
    sortHand: (_state, cards) => sortCards(cards),
    explain: explainMinhwatu,
  },
  botFor: (level) => minhwatuBotFor(level),
};
