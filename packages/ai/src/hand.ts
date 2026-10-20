import {
  type Card,
  isJoker,
  type Kiruda,
  mightyOf,
  type RuleSet,
  rankOf,
  rankPower,
  SUITS,
  type Suit,
  suitOf,
} from "@mighty/engine";

export const KIRUDAS: readonly Kiruda[] = ["S", "D", "H", "C", "NT"];

const KIRUDA_HONOR: Partial<Record<string, number>> = {
  A: 1.2,
  K: 0.8,
  Q: 0.5,
  J: 0.3,
};

/**
 * 이 기루다로 했을 때 패의 세기. 대략 "혼자서 가져올 수 있는 트릭 수"에 가까운 값이다.
 * 마이티·조커, 기루다 장수와 높은 기루다, 다른 무늬의 A, 기루다로 잘라 먹을 수 있는 빈 무늬를 센다.
 */
export function handStrength(
  rules: RuleSet,
  hand: readonly Card[],
  kiruda: Kiruda,
): number {
  const mighty = mightyOf(rules, kiruda);
  let strength = 0;
  if (hand.includes(mighty)) strength += 2;
  if (hand.some(isJoker)) strength += 1.7;

  const kirudaCards =
    kiruda === "NT"
      ? []
      : hand.filter((c) => suitOf(c) === kiruda && c !== mighty);
  strength += kirudaCards.length * 0.9;
  for (const card of kirudaCards)
    strength += KIRUDA_HONOR[rankOf(card) ?? ""] ?? 0;

  for (const suit of SUITS) {
    if (suit === kiruda) continue;
    const cards = hand.filter((c) => suitOf(c) === suit && c !== mighty);
    const hasAce = cards.some((c) => rankOf(c) === "A");
    const hasKing = cards.some((c) => rankOf(c) === "K");
    if (hasAce) strength += kiruda === "NT" ? 1.3 : 0.9;
    if (hasKing) strength += hasAce ? 0.5 : 0.2;
    if (cards.length === 0 && kirudaCards.length >= 3) strength += 0.4;
  }
  return strength;
}

/** 프렌드와 바닥 카드까지 생각해 여당이 가져갈 점수 카드 장수를 어림한다. */
export function estimatePoints(
  rules: RuleSet,
  hand: readonly Card[],
  kiruda: Kiruda,
): number {
  const base = 7 + handStrength(rules, hand, kiruda) * 0.9;
  // 노기루다는 이기면 2배지만 실패하기도 쉽다.
  return kiruda === "NT" ? base - 1 : base;
}

export function bestKiruda(
  rules: RuleSet,
  hand: readonly Card[],
): { kiruda: Kiruda; estimate: number } {
  let best: { kiruda: Kiruda; estimate: number } = {
    kiruda: "NT",
    estimate: -1,
  };
  for (const kiruda of KIRUDAS) {
    const estimate = estimatePoints(rules, hand, kiruda);
    if (estimate > best.estimate) best = { kiruda, estimate };
  }
  return best;
}

/** 패에 남겨 둘 가치. 높을수록 남긴다. 주공이 버릴 카드를 고를 때 쓴다. */
export function cardKeepValue(
  rules: RuleSet,
  hand: readonly Card[],
  kiruda: Kiruda,
  card: Card,
  jokerCall: Card,
): number {
  if (card === mightyOf(rules, kiruda)) return 100;
  if (isJoker(card)) return 90;
  const suit = suitOf(card) as Suit;
  const power = rankPower(card);
  if (suit === kiruda) return 50 + power;
  if (card === jokerCall && !hand.some(isJoker)) return 35;
  const sameSuit = hand.filter((c) => suitOf(c) === suit);
  const hasAce = sameSuit.some((c) => rankOf(c) === "A");
  let value = power;
  if (rankOf(card) === "A") value = 40;
  else if (rankOf(card) === "K") value = hasAce ? 30 : 20;
  // 짧은 무늬는 버려서 빈 무늬를 만들면 기루다로 잘라 먹을 수 있다.
  if (sameSuit.length <= 2 && kiruda !== "NT") value -= 5;
  return value;
}
