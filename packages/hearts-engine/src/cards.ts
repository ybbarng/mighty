import { type Card, RANKS, SUITS, type Suit, suitOf } from "@mighty/engine";

import type { HeartsRules } from "./rules";

export const QUEEN_OF_SPADES: Card = "SQ";
export const JACK_OF_DIAMONDS: Card = "DJ";
export const TWO_OF_CLUBS: Card = "C2";

/** 조커 없는 52장 */
export function heartsDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank): Card => `${suit}${rank}`));
}

export function isHeart(card: Card): boolean {
  return suitOf(card) === "H";
}

/** 받으면 점수가 붙는 카드: 하트와 ♠Q. ◆J(빼 주는 카드)는 넣지 않는다 */
export function isPenaltyCard(card: Card): boolean {
  return isHeart(card) || card === QUEEN_OF_SPADES;
}

/** 카드 한 장의 점수. 하트 1, ♠Q 13, ◆J −10(옵션) */
export function cardPoints(card: Card, rules: HeartsRules): number {
  if (isHeart(card)) return 1;
  if (card === QUEEN_OF_SPADES) return 13;
  if (rules.jackOfDiamonds && card === JACK_OF_DIAMONDS) return -10;
  return 0;
}

export function pointsOf(cards: readonly Card[], rules: HeartsRules): number {
  return cards.reduce((sum, c) => sum + cardPoints(c, rules), 0);
}

/** 화면 정렬 순서: ♣ ◆ ♠ ♥(윈도우 하트와 같다), 같은 무늬는 낮은 숫자부터 */
export const SORT_SUIT_ORDER: readonly Suit[] = ["C", "D", "S", "H"];
