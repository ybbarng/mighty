import { nextInt, type RngState } from "@mighty/engine";
import { HWATU_DECK, monthOf } from "@mighty/hwatu";
import {
  handValue,
  monthCounts,
  type NyrongppongState,
  type NyrongppongView,
} from "@mighty/nyrongppong-engine";

import { type NyrongppongBot, nyrongppongIntermediateBot } from "./bots";

/*
 * 고수(docs/30 5절): 중수처럼 짝을 남기고 큰 카드부터 버리되, 두 가지를 더 따진다.
 * - 스톱: 보이지 않는 카드(남의 손패와 더미)를 시드 난수로 여러 번 나눠 짐작하고,
 *   짐작한 상대 손패 합보다 내 합이 낮은 경우가 90%를 넘을 때만 스톱한다(스톱 바가지를 피한다).
 * - 뽕한 뒤 석 장에서 한 장 버리기: 낮은 짝(합 6 이하)이면 짝을 남겨 박을 노리고,
 *   아니면 가장 큰 카드를 버려 낮은 두 장으로 스톱을 노린다.
 * 버리기를 판 끝까지 이어 가 보는 방식(몬테카를로)도 해 봤지만 운이 커서 나아지지 않았다(docs/30 5절).
 */

/** 스톱을 따질 때 짐작해 보는 횟수 */
export const EXPERT_SAMPLES = 60;
/** 이 확률보다 높게 가장 낮아야 스톱한다 */
const STOP_CONFIDENCE = 0.9;

/** 내가 볼 수 없는 카드(남의 손패 + 더미) */
export function unseenCards(view: NyrongppongView): string[] {
  const seen = new Set([...view.hand, ...view.pile, ...view.melds.flat(2)]);
  return HWATU_DECK.map((c) => c.id).filter((id) => !seen.has(id));
}

/** 짐작 하나: 보이지 않는 카드를 섞어 상대 손패와 더미를 채운 엔진 상태(이번 판에서 끝난다) */
export function determinize(
  view: NyrongppongView,
  unseen: readonly string[],
  rng: RngState,
): NyrongppongState {
  const pool = [...unseen];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  let at = 0;
  const hands = view.handCounts.map((count, seat) => {
    if (seat === view.mySeat) return [...view.hand];
    const hand = pool.slice(at, at + count);
    at += count;
    return hand;
  });
  const n = view.rules.players;
  return {
    rules: { ...view.rules, rounds: view.roundNumber },
    seed: 0,
    roundNumber: view.roundNumber,
    dealer: view.dealer,
    turn: view.turn,
    phase: view.phase,
    deck: pool.slice(at),
    hands,
    pile: [...view.pile],
    melds: view.melds.map((m) => m.map((g) => [...g])),
    drawn: view.drawn,
    // 한 장에 뽕할 수 있는 자리는 많아야 하나라, 내게 물었으면 나 혼자다.
    call: view.call
      ? {
          from: view.call.from,
          card: view.call.card,
          responses: [{ seat: view.mySeat, answer: null }],
          used: 0,
        }
      : null,
    totals: new Array<number>(n).fill(0),
    result: null,
    continued: new Array<boolean>(n).fill(false),
  };
}

/** 지금 스톱하면 내가 가장 낮을 확률(짐작한 상대 손패로) */
export function stopChance(
  view: NyrongppongView,
  rng: RngState,
  samples = EXPERT_SAMPLES,
): number {
  const mine = handValue(view.hand);
  const unseen = unseenCards(view);
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const { hands } = determinize(view, unseen, rng);
    if (
      hands.every(
        (hand, seat) => seat === view.mySeat || handValue(hand) > mine,
      )
    )
      wins++;
  }
  return wins / samples;
}

/** 뽕한 뒤 석 장에서 버릴 카드: 낮은 짝은 남기고, 아니면 가장 큰 카드 */
export function discardFromThree(hand: readonly string[]): string {
  const counts = monthCounts(hand);
  const single = hand.filter((id) => (counts.get(monthOf(id)) ?? 0) < 2);
  if (single.length === 1) {
    const pair = hand.filter((id) => id !== single[0]);
    if (handValue(pair) <= 6) return single[0] as string;
  }
  return hand.reduce((a, b) => (monthOf(b) > monthOf(a) ? b : a));
}

export const nyrongppongExpertBot: NyrongppongBot = {
  name: "nyrongppong-expert",
  decide(view, rng) {
    const d = view.decision;
    if (d?.kind === "draw" && d.canStop)
      return stopChance(view, rng) > STOP_CONFIDENCE
        ? { type: "stop" }
        : { type: "draw" };
    if (d?.kind === "discard" && !d.yak && view.hand.length === 3)
      return { type: "discard", card: discardFromThree(view.hand) };
    return nyrongppongIntermediateBot.decide(view, rng);
  },
};
