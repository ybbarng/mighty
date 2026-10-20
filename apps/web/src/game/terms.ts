import {
  type Card,
  type FriendDeclaration,
  type Goal,
  isJoker,
  type Kiruda,
  mightyOf,
  type RuleSet,
  rankOf,
  rankPower,
  type Suit,
  suitOf,
} from "@mighty/engine";

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: "♠",
  D: "◆",
  H: "♥",
  C: "♣",
};
export const SUIT_NAME: Record<Suit, string> = {
  S: "스페이드",
  D: "다이아몬드",
  H: "하트",
  C: "클로버",
};

export function kirudaSymbol(kiruda: Kiruda): string {
  return kiruda === "NT" ? "노기" : SUIT_SYMBOL[kiruda];
}

export function kirudaName(kiruda: Kiruda): string {
  return kiruda === "NT" ? "노기루다" : SUIT_NAME[kiruda];
}

export function isRedSuit(kiruda: Kiruda | null): boolean {
  return kiruda === "D" || kiruda === "H";
}

export function goalLabel(goal: Goal): string {
  return `${kirudaSymbol(goal.kiruda)} ${goal.score}`;
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return "조커";
  return `${SUIT_SYMBOL[suitOf(card)]}${rankOf(card)}`;
}

export function friendLabel(
  friend: FriendDeclaration,
  seatName: (seat: number) => string,
): string {
  switch (friend.kind) {
    case "none":
      return "노프렌드";
    case "firstTrick":
      return "초구 프렌드";
    case "player":
      return `${seatName(friend.seat)} 프렌드`;
    case "card":
      return `${cardLabel(friend.card)} 프렌드`;
  }
}

const DISPLAY_SUIT_ORDER: readonly Suit[] = ["S", "H", "C", "D"];

/** 화면용 손패 정렬: 조커, 마이티, 기루다, 나머지 무늬(검정·빨강 번갈아) 순서, 같은 무늬는 높은 숫자부터. */
export function sortHand(
  cards: readonly Card[],
  rules: RuleSet,
  kiruda: Kiruda | null,
): Card[] {
  const mighty = mightyOf(rules, kiruda ?? "NT");
  const group = (card: Card): number => {
    if (isJoker(card)) return 0;
    if (kiruda !== null && card === mighty) return 1;
    const suit = suitOf(card);
    if (suit === kiruda) return 2;
    return 3 + DISPLAY_SUIT_ORDER.indexOf(suit);
  };
  return [...cards].sort(
    (a, b) => group(a) - group(b) || rankPower(b) - rankPower(a),
  );
}
