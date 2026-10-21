import {
  type Card,
  type RngState,
  rankPower,
  type Suit,
  suitOf,
} from "@mighty/engine";
import {
  type Action,
  type PlayerView,
  passTarget,
  QUEEN_OF_SPADES,
} from "@mighty/hearts-engine";

/** 하트 컴퓨터. 자기 자리에서 보이는 정보만 받는다 */
export interface HeartsBot {
  readonly name: string;
  decide(view: PlayerView, rng: RngState): Action;
}

/** 지금까지 나온 카드(끝난 턴과 지금 턴) */
export function playedCards(view: PlayerView): Set<Card> {
  return new Set<Card>([
    ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(view.trick?.plays.map((p) => p.card) ?? []),
  ]);
}

/** 선 무늬를 따라 내지 못해 그 무늬가 떨어진 것이 드러난 자리 */
export function knownVoids(view: PlayerView): Map<number, Set<Suit>> {
  const voids = new Map<number, Set<Suit>>();
  const tricks = [...view.tricks, ...(view.trick ? [view.trick] : [])];
  for (const trick of tricks) {
    const first = trick.plays[0];
    if (!first) continue;
    const lead = suitOf(first.card);
    for (const play of trick.plays.slice(1)) {
      if (lead !== null && suitOf(play.card) !== lead) {
        const set = voids.get(play.seat) ?? new Set<Suit>();
        set.add(lead);
        voids.set(play.seat, set);
      }
    }
  }
  return voids;
}

/** 내가 넘겨준 카드 중 아직 안 나온 것과 받은 사람 */
export function passedTo(
  view: PlayerView,
): { seat: number; cards: Card[] } | null {
  const mine = view.myPass;
  if (!mine || view.direction === "none" || view.phase === "passing")
    return null;
  const played = playedCards(view);
  return {
    seat: passTarget(view.seat, view.direction),
    cards: mine.filter((c) => !played.has(c)),
  };
}

export function queenOut(view: PlayerView): boolean {
  return playedCards(view).has(QUEEN_OF_SPADES);
}

export function bySuit(cards: readonly Card[], suit: Suit): Card[] {
  return cards.filter((c) => suitOf(c) === suit);
}

export function highest(cards: readonly Card[]): Card | undefined {
  return [...cards].sort((a, b) => rankPower(b) - rankPower(a))[0];
}

export function lowest(cards: readonly Card[]): Card | undefined {
  return [...cards].sort((a, b) => rankPower(a) - rankPower(b))[0];
}

/**
 * 문 슛을 노리는 것 같은 자리: 점수를 한 사람만 먹었고 그게 꽤 많다.
 * 그 사람이 점수를 다 가져가지 못하게 막아야 한다.
 */
export function moonThreat(view: PlayerView): number | null {
  const scorers = view.takenPoints
    .map((p, s) => ({ p, s }))
    .filter(({ p }) => p > 0);
  const only = scorers.length === 1 ? scorers[0] : undefined;
  if (!only || only.s === view.seat) return null;
  return only.p >= 8 ? only.s : null;
}
