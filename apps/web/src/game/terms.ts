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
  type UnplayableReason,
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

export function unplayableText(reason: UnplayableReason): string {
  switch (reason.kind) {
    case "notInHand":
      return "손에 없는 카드입니다";
    case "jokerCalled":
      return "조커콜! 조커를 내야 합니다";
    case "mustPlayMightyOrJoker":
      return "마지막 턴에는 낼 수 없어서 지금 마이티나 조커를 내야 합니다";
    case "mightyFirstTrick":
      return "첫 턴에는 마이티를 낼 수 없습니다";
    case "mightyLastTrick":
      return "마지막 턴에는 마이티를 낼 수 없습니다";
    case "jokerFirstTrick":
      return "첫 턴에는 조커를 낼 수 없습니다";
    case "jokerLastTrick":
      return "마지막 턴에는 조커를 낼 수 없습니다";
    case "followSuit":
      return `${SUIT_SYMBOL[reason.suit]} ${SUIT_NAME[reason.suit]}를 따라 내야 합니다`;
    case "kirudaFirstTrick":
      return reason.leading
        ? "첫 턴 선은 기루다를 낼 수 없습니다"
        : "첫 턴에는 기루다를 낼 수 없습니다";
  }
}

/**
 * 카드 툴팁 문구(원작 `GetHelpString`): 카드 이름과, 같은 무늬에서 아직 나오지 않은 더 높은 카드.
 * 더 높은 카드가 없으면 "최고패". 마이티·조커는 이름만.
 */
export function cardTipText(
  card: Card,
  rules: RuleSet,
  kiruda: Kiruda | null,
  played: ReadonlySet<Card>,
): string {
  const mighty = mightyOf(rules, kiruda ?? "NT");
  if (card === mighty) return "마이티";
  if (isJoker(card)) return "조커";
  const suit = suitOf(card) as Suit;
  const higher = (
    ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const
  )
    .map((rank): Card => `${suit}${rank}`)
    .filter(
      (c) => rankPower(c) > rankPower(card) && c !== mighty && !played.has(c),
    )
    .map((c) => rankOf(c));
  return higher.length > 0
    ? `${cardLabel(card)} (${higher.join(" ")})`
    : `${cardLabel(card)} (최고패)`;
}
