import {
  type Card,
  fullDeck,
  makeCard,
  RANKS,
  type Rank,
  rankOf,
  type Suit,
} from "./cards";
import type { RuleSet } from "./rules";

/** 3·4마에서 카드를 뺄 때 같은 숫자 안의 무늬 순서 (Card.cpp). */
const REMOVAL_SUIT_ORDER: readonly Suit[] = ["C", "H", "D", "S"];
const LOW_RANKS: readonly Rank[] = RANKS.slice(0, RANKS.indexOf("9") + 1);

/**
 * 인원에 맞는 덱 (Card.cpp 160~236행).
 * 3마 33장, 4마 43장, 그 외 53장. 조커콜 카드는 빼지 않는다.
 */
export function deckFor(rules: RuleSet): Card[] {
  const deck = fullDeck();
  const jokerCalls = [rules.jokerCall, rules.alterJokerCall];
  const callRanks = jokerCalls.map((c) => rankOf(c));

  if (rules.playerCount === 4) {
    const [a, b] = callRanks as [Rank | null, Rank | null];
    if (a !== null && a === b && ["2", "3", "4"].includes(a)) {
      // 2·3·4를 모두 빼고 조커콜 두 장만 남긴다.
      return deck.filter(
        (card) =>
          jokerCalls.includes(card) ||
          !["2", "3", "4"].includes(rankOf(card) ?? ""),
      );
    }
    const removed = new Set<Card>();
    for (const rank of LOW_RANKS) {
      for (const suit of REMOVAL_SUIT_ORDER) {
        const card = makeCard(suit, rank);
        if (removed.size < 10 && !jokerCalls.includes(card)) removed.add(card);
      }
    }
    return deck.filter((card) => !removed.has(card));
  }

  if (rules.playerCount === 3) {
    const ranksToRemove = LOW_RANKS.filter((r) => !callRanks.includes(r)).slice(
      0,
      5,
    );
    return deck.filter((card) => {
      const rank = rankOf(card);
      return rank === null || !ranksToRemove.includes(rank);
    });
  }

  return deck;
}

/** 처음 나눠 줄 때 한 사람당 장수. 2마는 고르기로 13장을 받는다. */
export function handSizeFor(playerCount: number): number {
  if (playerCount === 6) return 8;
  if (playerCount === 7) return 7;
  if (playerCount === 2) return 13;
  return 10;
}

/** 주공이 버리는 장수. */
export function discardCountFor(playerCount: number): number {
  return playerCount === 2 ? 1 : 3;
}
