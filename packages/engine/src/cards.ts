export const SUITS = ["S", "D", "H", "C"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;
export type Rank = (typeof RANKS)[number];

export const JOKER = "JK";
export type Joker = typeof JOKER;

/** 카드는 `"SA"`, `"D10"`, `"JK"`처럼 문자열 하나로 나타낸다. 같은 카드는 `===`로 비교한다. */
export type Card = `${Suit}${Rank}` | Joker;

/** 기루다. `"NT"`는 노기루다. */
export type Kiruda = Suit | "NT";

export function isJoker(card: Card): card is Joker {
  return card === JOKER;
}

export function suitOf(card: Exclude<Card, Joker>): Suit;
export function suitOf(card: Card): Suit | null;
export function suitOf(card: Card): Suit | null {
  return isJoker(card) ? null : (card[0] as Suit);
}

export function rankOf(card: Exclude<Card, Joker>): Rank;
export function rankOf(card: Card): Rank | null;
export function rankOf(card: Card): Rank | null {
  return isJoker(card) ? null : (card.slice(1) as Rank);
}

/** 같은 무늬 안에서의 세기. 2가 0, A가 12. 조커는 -1. */
export function rankPower(card: Card): number {
  const rank = rankOf(card);
  return rank === null ? -1 : RANKS.indexOf(rank);
}

export function makeCard(suit: Suit, rank: Rank): Card {
  return `${suit}${rank}`;
}

/** 10·J·Q·K·A가 점수 카드다. */
export function isPointCard(card: Card): boolean {
  return rankPower(card) >= RANKS.indexOf("10");
}

export function countPoints(cards: readonly Card[]): number {
  return cards.filter(isPointCard).length;
}

/** 52장 + 조커 1장. */
export function fullDeck(): Card[] {
  const deck: Card[] = SUITS.flatMap((suit) =>
    RANKS.map((rank) => makeCard(suit, rank)),
  );
  deck.push(JOKER);
  return deck;
}
