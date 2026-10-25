import {
  type Card,
  type FriendDeclaration,
  type Goal,
  isJoker,
  jokerCallOf,
  type Kiruda,
  mightyOf,
  type RuleSet,
  rankOf,
  rankPower,
  type Suit,
  suitOf,
  type UnplayableReason,
} from "@mighty/engine";

import { SUIT_GLYPH, SUIT_WORD } from "./suit-style";

/**
 * 문구 속 무늬는 기호로 적는다. 화면은 `SuitText`로 설정한 방식(그림·이름 등)으로 바꿔 그린다(suit-style.ts)
 */
export const SUIT_SYMBOL = SUIT_GLYPH;
export const SUIT_NAME = SUIT_WORD;

/**
 * 마이티 은어로 보여 줄지(원작 "마이티 용어 사용", `bUseTerm`). 설정이 바꾼다.
 * 켜면 공약은 셋트·둘노, 카드는 기아·삽카·쪼카, 조커 무늬는 삽컴!처럼 부른다.
 */
let slang = false;
export function setSlangTerms(on: boolean): void {
  slang = on;
}
export function slangTerms(): boolean {
  return slang;
}

const SUIT_SLANG: Record<Suit, string> = {
  S: "삽",
  D: "다리",
  H: "트",
  C: "끌",
};
/** 공약 숫자 은어. 원작 `GetGoalString`의 표: 11 독, 12 둘 … 20 풀 */
const SCORE_SLANG = [
  "독",
  "둘",
  "셋",
  "넷",
  "닷",
  "엿",
  "곱",
  "덜",
  "홉",
  "풀",
];

/** 공약 은어(원작 `GetGoalString`). 2마는 턴 수라 "열·열한"을 붙인다 */
export function goalSlang(goal: Goal, playerCount = 5): string {
  const shape = goal.kiruda === "NT" ? "노" : SUIT_SLANG[goal.kiruda];
  const { score } = goal;
  const digit = SCORE_SLANG[(score + 9) % 10] ?? "";
  if (playerCount === 2) {
    if (score === 10) return `열${shape}`;
    if (score === 11) return `열한${shape}`;
    if (score === 13) return `풀${shape}`;
    return `${score > 10 ? "열" : ""}${digit}${shape}`;
  }
  const prefix = score <= 10 ? "초" : score > 20 ? "풀" : "";
  return `${prefix}${digit}${shape}`;
}

/** 카드 은어(원작 `CCard::GetString`): 마이티, 쪼카, 쪼콜, 기아, 삽카, 다리10 … */
export function cardSlang(
  card: Card,
  rules: RuleSet,
  kiruda: Kiruda | null,
): string {
  if (card === mightyOf(rules, kiruda ?? "NT")) return "마이티";
  if (isJoker(card)) return "쪼카";
  if (kiruda !== null && card === jokerCallOf(rules, kiruda)) return "쪼콜";
  const suit = suitOf(card) as Suit;
  const shape = suit === kiruda ? "기" : SUIT_SLANG[suit];
  const rank = rankOf(card);
  const name =
    rank === "A"
      ? "아"
      : rank === "K"
        ? "카"
        : rank === "Q"
          ? "큐"
          : rank === "J"
            ? "자"
            : rank;
  return `${shape}${name}`;
}

/** 조커로 부른 무늬: "♠" / 은어면 "삽컴!" */
export function jokerSuitLabel(suit: Suit): string {
  return slang ? `${SUIT_SLANG[suit]}컴!` : SUIT_SYMBOL[suit];
}

/** 조커콜 선언: "조커콜!" / 은어면 "쪼카컴!" */
export function jokerCallLabel(): string {
  return slang ? "쪼카컴!" : "조커콜!";
}

export function kirudaSymbol(kiruda: Kiruda): string {
  return kiruda === "NT" ? "노기" : SUIT_SYMBOL[kiruda];
}

export function kirudaName(kiruda: Kiruda): string {
  return kiruda === "NT" ? "노기루다" : SUIT_NAME[kiruda];
}

export function isRedSuit(kiruda: Kiruda | null): boolean {
  return kiruda === "D" || kiruda === "H";
}

/**
 * 공약: "♠13", 노기루다는 "노기루다 13". 은어를 켰으면 "♠13 (셋삽)"처럼 은어를 함께 적는다
 */
export function goalLabel(goal: Goal, playerCount?: number): string {
  const base =
    goal.kiruda === "NT"
      ? `노기루다 ${goal.score}`
      : `${SUIT_SYMBOL[goal.kiruda]}${goal.score}`;
  return slang ? `${base} (${goalSlang(goal, playerCount)})` : base;
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return "조커";
  return `${SUIT_SYMBOL[suitOf(card)]}${rankOf(card)}`;
}

/**
 * 프렌드: "♠A (마이티) 프렌드". 마이티·조커콜 카드는 역할을 괄호로 붙인다.
 * 은어를 켰으면 "(기아)"처럼 은어를 붙인다
 */
export function friendLabel(
  friend: FriendDeclaration,
  seatName: (seat: number) => string,
  /** 마이티·조커콜·기아를 가리려면 규칙과 기루다가 필요하다 */
  context?: { rules: RuleSet; kiruda: Kiruda | null },
): string {
  switch (friend.kind) {
    case "none":
      return "노프렌드";
    case "firstTrick":
      return "초구 프렌드";
    case "player":
      return `${seatName(friend.seat)} 프렌드`;
    case "card": {
      const name = cardLabel(friend.card);
      const role = context ? cardRole(friend.card, context) : null;
      return `${name}${role && role !== name ? ` (${role})` : ""} 프렌드`;
    }
  }
}

/** 카드 이름 뒤 괄호에 붙일 말: 은어를 켰으면 은어, 아니면 마이티·조커콜만 */
function cardRole(
  card: Card,
  { rules, kiruda }: { rules: RuleSet; kiruda: Kiruda | null },
): string | null {
  if (slang) return cardSlang(card, rules, kiruda);
  if (card === mightyOf(rules, kiruda ?? "NT")) return "마이티";
  if (kiruda !== null && card === jokerCallOf(rules, kiruda)) return "조커콜";
  return null;
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
      return `${SUIT_SYMBOL[reason.suit]} 무늬를 따라 내야 합니다`;
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
  if (isJoker(card)) return slang ? "쪼카" : "조커";
  const name = slang ? cardSlang(card, rules, kiruda) : cardLabel(card);
  const suit = suitOf(card) as Suit;
  const higher = (
    ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const
  )
    .map((rank): Card => `${suit}${rank}`)
    .filter(
      (c) => rankPower(c) > rankPower(card) && c !== mighty && !played.has(c),
    )
    .map((c) => rankOf(c));
  // 원작은 은어일 때 가장 높은 카드를 "보스카"라고 불렀다.
  return higher.length > 0
    ? `${name} (${higher.join(" ")})`
    : `${name} (${slang ? "보스카" : "최고패"})`;
}
