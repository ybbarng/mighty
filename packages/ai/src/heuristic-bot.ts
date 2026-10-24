import {
  type Action,
  type Card,
  countPoints,
  type Decision,
  type FriendDeclaration,
  isJoker,
  isJokerEffective,
  jokerCallOf,
  type Kiruda,
  mightyOf,
  nextFloat,
  type PlayerView,
  type RngState,
  rankOf,
  rankPower,
  SUITS,
  type Suit,
  suitOf,
  type TrickCards,
  type TrickContext,
  trickWinnerIndex,
} from "@mighty/engine";

import type { Bot } from "./bot";
import { bestKiruda, cardKeepValue, estimatePoints, KIRUDAS } from "./hand";

type Relation = "me" | "partner" | "opponent" | "unknown";

/**
 * 정석(나무위키 "전술 및 전략", docs/09-ai-strategy.md). 하나씩 켜고 끌 수 있어 세기를 따로 잰다.
 * - `mightyAttack` 마공: 야당이 선을 잡으면 마이티 무늬의 낮은 카드로 마이티를 끌어낸다
 * - `secureFirst` 첫 턴 확보: 조커 프렌드인 주공은 다른 무늬 A가 없으면 마이티로 첫 턴을 먹는다
 * - `kirudaAceFriend` 기루다 A 프렌드면 주공은 낮은 기루다부터 내 프렌드의 A가 나올 자리를 만든다
 * - `countKiruda` 기루다 세기: 밖에 남은 기루다가 없으면 기루다를 더 빼지 않는다
 * - `voidSuit` 무늬 비우기: 바닥 카드를 버릴 때 A 없는 짧은 무늬를 통째로 묻는다
 */
export type BookRule =
  | "mightyAttack"
  | "secureFirst"
  | "kirudaAceFriend"
  | "countKiruda"
  | "voidSuit";

export const BOOK_RULES: readonly BookRule[] = [
  "mightyAttack",
  "secureFirst",
  "kirudaAceFriend",
  "countKiruda",
  "voidSuit",
];

export interface RuleBotOptions {
  name?: string;
  /** 쓰는 정석 */
  book?: readonly BookRule[];
  /**
   * 초보 실수를 할 확률(0~1). 실수할 수 있는 자리마다 이 확률로 한다:
   * 바닥 카드를 숫자 순으로 버리기, 사소한 점수에 마이티·조커 쓰기,
   * 편을 모르는데 점수 카드 싣기, 공약 숫자를 들쭉날쭉 부르기
   */
  mistakes?: number;
}

interface Style {
  book: ReadonlySet<BookRule>;
  mistakes: number;
  rng: RngState;
}

function slip(style: Style): boolean {
  return style.mistakes > 0 && nextFloat(style.rng) < style.mistakes;
}

/** 내 손과 지금까지 나온 카드 */
function seenCards(view: PlayerView): Set<Card> {
  return new Set<Card>([
    ...view.hand,
    ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(view.trick?.plays.map((p) => p.card) ?? []),
    ...(view.discarded ?? []),
  ]);
}

type PlayDecision = Extract<Decision, { kind: "play" }>;

function kirudaOf(view: PlayerView): Kiruda {
  return view.goal?.kiruda ?? "NT";
}

function isRulingSelf(view: PlayerView): boolean {
  return view.seat === view.declarer || view.friend === view.seat;
}

/** 다른 자리가 나와 같은 편인지. 프렌드가 드러나기 전에는 모를 수 있다. */
function relationTo(view: PlayerView, other: number): Relation {
  if (other === view.seat) return "me";
  const ruling = isRulingSelf(view);
  const friendKnown = view.friend !== null || view.friendRevealed;
  const otherRuling =
    other === view.declarer || (view.friend !== null && other === view.friend);
  if (otherRuling) return ruling ? "partner" : "opponent";
  if (!friendKnown) return "unknown";
  return ruling ? "opponent" : "partner";
}

/** 카드를 쓰는 비용. 싼 카드부터 낸다. */
function cost(view: PlayerView, card: Card): number {
  const kiruda = kirudaOf(view);
  if (card === mightyOf(view.rules, kiruda)) return 100;
  if (isJoker(card)) return 90;
  const power = rankPower(card);
  const pointPenalty = countPoints([card]) > 0 ? 6 : 0;
  return (suitOf(card) === kiruda ? 30 : 0) + power + pointPenalty;
}

function cheapest(view: PlayerView, cards: readonly Card[]): Card {
  return [...cards].sort((a, b) => cost(view, a) - cost(view, b))[0] as Card;
}

function trickState(view: PlayerView): {
  ctx: TrickContext;
  trick: TrickCards;
} {
  return {
    ctx: {
      rules: view.rules,
      kiruda: kirudaOf(view),
      trickIndex: view.trickIndex,
    },
    trick: {
      cards: view.trick?.plays.map((p) => p.card) ?? [],
      jokerSuit: view.trick?.jokerSuit ?? null,
      jokerCalled: view.trick?.jokerCalled ?? false,
    },
  };
}

function jokerSuitFor(view: PlayerView): Suit {
  const kiruda = kirudaOf(view);
  if (isRulingSelf(view) && kiruda !== "NT") return kiruda;
  const counts = SUITS.map(
    (s) => view.hand.filter((c) => suitOf(c) === s).length,
  );
  return SUITS[counts.indexOf(Math.max(...counts))] as Suit;
}

function playCard(view: PlayerView, card: Card, jokerCall = false): Action {
  const decision = view.decision as PlayDecision;
  return {
    type: "play",
    card,
    ...(decision.leading && isJoker(card)
      ? { jokerSuit: jokerSuitFor(view) }
      : {}),
    ...(jokerCall ? { jokerCall: true } : {}),
  };
}

function lead(view: PlayerView, decision: PlayDecision, style: Style): Action {
  const kiruda = kirudaOf(view);
  const cards = decision.cards;
  const jokerOut = view.jokerUsed || view.hand.some(isJoker);
  const ruling = isRulingSelf(view);
  const mighty = mightyOf(view.rules, kiruda);
  const seen = seenCards(view);

  // 조커콜로 상대 조커를 끌어낸다.
  if (decision.jokerCallCard && !jokerOut)
    return playCard(view, decision.jokerCallCard, true);

  // 첫 턴 확보: 조커 프렌드면 놓친 첫 턴 뒤에 조커콜까지 맞기 쉽다. 다른 무늬 A가 없으면 마이티로 먹는다.
  if (
    style.book.has("secureFirst") &&
    view.trickIndex === 0 &&
    view.seat === view.declarer &&
    view.friendDeclaration?.kind === "card" &&
    view.friendDeclaration.card === "JK" &&
    cards.includes(mighty) &&
    !cards.some(
      (c) => rankOf(c) === "A" && suitOf(c) !== kiruda && c !== mighty,
    )
  )
    return playCard(view, mighty);

  // 마공: 야당이 선을 잡으면 마이티 무늬의 낮은 카드로 마이티를 끌어낸다.
  if (style.book.has("mightyAttack") && !ruling && !seen.has(mighty)) {
    const mightySuit = suitOf(mighty);
    const low = cards.filter(
      (c) => suitOf(c) === mightySuit && countPoints([c]) === 0 && c !== mighty,
    );
    if (low.length > 0) return playCard(view, cheapest(view, low));
  }

  const sideAces = cards.filter(
    (c) =>
      rankOf(c) === "A" &&
      suitOf(c) !== kiruda &&
      c !== mightyOf(view.rules, kiruda),
  );
  if (sideAces.length > 0) return playCard(view, sideAces[0] as Card);

  if (ruling) {
    const { ctx, trick } = trickState(view);
    if (cards.some(isJoker) && isJokerEffective(ctx, trick))
      return playCard(view, "JK");
    const kirudaCards = cards.filter(
      (c) => suitOf(c) === kiruda && c !== mightyOf(view.rules, kiruda),
    );
    // 기루다 세기: 밖에 남은 기루다가 없으면 더 빼지 않는다.
    const outside =
      kiruda === "NT"
        ? 0
        : SUITS.includes(kiruda as Suit)
          ? 13 -
            [...seen].filter((c) => suitOf(c) === kiruda && c !== mighty)
              .length -
            (suitOf(mighty) === kiruda ? 1 : 0)
          : 0;
    const pull = !style.book.has("countKiruda") || outside > 0;
    if (kirudaCards.length >= 2 && pull) {
      const byPower = [...kirudaCards].sort(
        (a, b) => rankPower(b) - rankPower(a),
      );
      // 기루다 A 프렌드가 숨어 있으면 낮은 기루다부터 내 A가 나올 자리를 만든다.
      const aceFriend =
        style.book.has("kirudaAceFriend") &&
        view.seat === view.declarer &&
        !view.friendRevealed &&
        view.friendDeclaration?.kind === "card" &&
        view.friendDeclaration.card === `${kiruda}A`;
      return playCard(
        view,
        (aceFriend ? byPower[byPower.length - 1] : byPower[0]) as Card,
      );
    }
  }
  const plain = cards.filter(
    (c) => !isJoker(c) && c !== mightyOf(view.rules, kiruda),
  );
  return playCard(view, cheapest(view, plain.length > 0 ? plain : cards));
}

function follow(
  view: PlayerView,
  decision: PlayDecision,
  style: Style,
): Action {
  const { ctx, trick } = trickState(view);
  const plays = view.trick?.plays ?? [];
  const cards = decision.cards;
  const winnerSeat = (plays[trickWinnerIndex(ctx, trick)] as { seat: number })
    .seat;
  const relation = relationTo(view, winnerSeat);
  const isLast = plays.length === view.players.length - 1;
  const points = countPoints(trick.cards);

  const winning = cards.filter(
    (c) =>
      trickWinnerIndex(ctx, { ...trick, cards: [...trick.cards, c] }) ===
      trick.cards.length,
  );
  const nonPoint = cards.filter((c) => countPoints([c]) === 0);

  if (relation === "partner") {
    const pointCards = cards.filter(
      (c) => countPoints([c]) > 0 && !winning.includes(c),
    );
    const safe = isLast || winning.length === 0;
    if (safe && pointCards.length > 0)
      return playCard(view, cheapest(view, pointCards));
    return playCard(
      view,
      cheapest(view, nonPoint.length > 0 ? nonPoint : cards),
    );
  }

  // 초보 실수: 편을 모르는데 점수 카드를 싣는다.
  if (relation === "unknown" && winning.length === 0 && slip(style)) {
    const pointCards = cards.filter((c) => countPoints([c]) > 0);
    if (pointCards.length > 0)
      return playCard(view, cheapest(view, pointCards));
  }

  if (winning.length > 0) {
    const best = cheapest(view, winning);
    // 초보 실수: 사소한 점수에도 마이티·조커를 쓴다.
    const big = winning.find((c) => cost(view, c) >= 90);
    if (big && points >= 1 && slip(style)) return playCard(view, big);
    const expensive = cost(view, best) >= 90;
    const worthIt =
      points >= 2 ||
      isLast ||
      view.trickIndex >= 8 ||
      (!expensive && points >= 1);
    if (!expensive || worthIt) return playCard(view, best);
  }
  return playCard(view, cheapest(view, nonPoint.length > 0 ? nonPoint : cards));
}

function electionAction(
  view: PlayerView,
  decision: Extract<Decision, { kind: "election" }>,
  style: Style,
): Action {
  if (decision.canDealMiss) return { type: "dealMiss" };
  const { kiruda, estimate } = bestKiruda(view.rules, view.hand);
  // 초보 실수: 패 세기보다 들쭉날쭉하게 부른다.
  const noise = slip(style) ? (nextFloat(style.rng) < 0.6 ? 1 : -1) : 0;
  const target = Math.floor(estimate) + noise;
  const bid = decision.bids
    .filter((g) => g.kiruda === kiruda && g.score <= target)
    .sort((a, b) => a.score - b.score)[0];
  if (bid) return { type: "bid", goal: bid };
  if (decision.canPass) return { type: "pass" };
  return {
    type: "bid",
    goal: decision.bids[0] as NonNullable<(typeof decision.bids)[0]>,
  };
}

function exchangeAction(
  view: PlayerView,
  decision: Extract<Decision, { kind: "exchange" }>,
  style: Style,
): Action {
  const { rules } = view;
  const elected = decision.electedGoal;
  let goal = elected;
  let bestMargin =
    estimatePoints(rules, view.hand, elected.kiruda) - elected.score + 1.5;
  for (const kiruda of KIRUDAS) {
    if (kiruda === elected.kiruda) continue;
    const required = decision.goals
      .filter((g) => g.kiruda === kiruda)
      .sort((a, b) => a.score - b.score)[0];
    if (!required) continue;
    const margin = estimatePoints(rules, view.hand, kiruda) - required.score;
    if (margin > bestMargin) {
      bestMargin = margin;
      goal = required;
    }
  }
  const jokerCall = jokerCallOf(rules, goal.kiruda);
  const keep = (c: Card) =>
    cardKeepValue(rules, view.hand, goal.kiruda, c, jokerCall);
  const count = decision.discardCount;
  const mighty = mightyOf(rules, goal.kiruda);
  // 초보 실수: 숫자 낮은 순으로 버린다(마이티·조커만 지킨다).
  if (slip(style)) {
    const discard = view.hand
      .filter((c) => c !== mighty && !isJoker(c))
      .sort((a, b) => rankPower(a) - rankPower(b))
      .slice(0, count);
    return { type: "exchange", goal, discard };
  }
  const byKeep = [...view.hand].sort((a, b) => keep(a) - keep(b));
  let discard = byKeep.slice(0, count);
  // 무늬 비우기: A 없는 짧은 무늬를 통째로 묻어 기루다로 간을 칠 수 있게 한다.
  if (style.book.has("voidSuit") && goal.kiruda !== "NT") {
    for (const suit of SUITS) {
      if (suit === goal.kiruda) continue;
      const cards = view.hand.filter((c) => suitOf(c) === suit);
      if (
        cards.length === 0 ||
        cards.length > count ||
        cards.some((c) => rankOf(c) === "A" || c === mighty || c === jokerCall)
      )
        continue;
      const rest = byKeep.filter((c) => !cards.includes(c));
      const candidate = [...cards, ...rest.slice(0, count - cards.length)];
      const sum = (set: Card[]) => set.reduce((a, c) => a + keep(c), 0);
      const empties = (set: Card[]) =>
        SUITS.filter(
          (s) =>
            s !== goal.kiruda &&
            view.hand.some((c) => suitOf(c) === s) &&
            view.hand.every((c) => suitOf(c) !== s || set.includes(c)),
        ).length;
      if (
        empties(candidate) > empties(discard) ||
        (empties(candidate) === empties(discard) &&
          sum(candidate) < sum(discard))
      )
        discard = candidate;
    }
  }
  return { type: "exchange", goal, discard };
}

/** 원작 화면의 추천 순서: 마이티 → 조커 → 기루다 A → 기루다 K → 다른 A → 기루다 Q → 초구. */
function friendAction(
  view: PlayerView,
  decision: Extract<Decision, { kind: "friend" }>,
): Action {
  const kiruda = kirudaOf(view);
  const cardOptions = new Set(
    decision.options.flatMap((o) => (o.kind === "card" ? [o.card] : [])),
  );
  const wanted: Card[] = [mightyOf(view.rules, kiruda), "JK"];
  if (kiruda !== "NT") wanted.push(`${kiruda}A`, `${kiruda}K`);
  for (const suit of SUITS) if (suit !== kiruda) wanted.push(`${suit}A`);
  if (kiruda !== "NT") wanted.push(`${kiruda}Q`);
  const card = wanted.find((c) => cardOptions.has(c));
  const friend: FriendDeclaration = card
    ? { kind: "card", card }
    : decision.options.some((o) => o.kind === "firstTrick")
      ? { kind: "firstTrick" }
      : { kind: "none" };
  return { type: "friend", friend };
}

function killAction(
  view: PlayerView,
  decision: Extract<Decision, { kind: "kill" }>,
): Action {
  const { kiruda } = bestKiruda(view.rules, view.hand);
  const goalKiruda = view.goal?.kiruda ?? kiruda;
  const tried = new Set([...decision.failed, ...view.hand]);
  const order: Card[] = [mightyOf(view.rules, goalKiruda), "JK"];
  if (goalKiruda !== "NT") {
    for (const rank of ["A", "K", "Q", "J", "10", "9"] as const)
      order.push(`${goalKiruda}${rank}`);
  }
  for (const suit of SUITS) order.push(`${suit}A`);
  const card =
    order.find((c) => !tried.has(c)) ??
    decision.candidates.find((c) => !tried.has(c));
  return { type: "kill", card: card ?? (decision.candidates[0] as Card) };
}

/** 규칙 기반 봇. 보이는 정보만으로 공약·교환·프렌드·카드를 고른다. */
export function createRuleBot(options: RuleBotOptions = {}): Bot {
  const book = new Set(options.book ?? []);
  const mistakes = options.mistakes ?? 0;
  return {
    name: options.name ?? "rule",
    decide(view: PlayerView, rng: RngState): Action {
      const decision = view.decision;
      if (decision === null) throw new Error("결정할 것이 없다");
      const style: Style = { book, mistakes, rng };
      switch (decision.kind) {
        case "pick": {
          const card = decision.faceUp;
          return {
            type: "pick",
            index: isJoker(card) || rankPower(card) >= rankPower("SJ") ? 0 : 1,
          };
        }
        case "election":
          return electionAction(view, decision, style);
        case "kill":
          return killAction(view, decision);
        case "exchange":
          return exchangeAction(view, decision, style);
        case "friend":
          return friendAction(view, decision);
        case "play":
          return decision.leading
            ? lead(view, decision, style)
            : follow(view, decision, style);
        case "continue":
          return { type: "continue" };
      }
    },
  };
}

/** 정석 없이 실수도 없는 규칙 봇(예전 1단계). 세기 비교의 기준 */
export const plainRuleBot: Bot = createRuleBot({ name: "plain" });

/**
 * 쓰는 정석. `secureFirst`는 재 보니 오히려 약해져서(판당 −0.05) 뺐다.
 * 각 정석의 효과(2400판, 정석 없는 봇 대비): 마공 +0.12, 무늬 비우기 +0.15,
 * 기루다 A 프렌드 운영 +0.02, 기루다 세기 +0.01
 */
export const NORMAL_BOOK: readonly BookRule[] = [
  "mightyAttack",
  "kirudaAceFriend",
  "countKiruda",
  "voidSuit",
];

/** 입문: 정석을 모르고 초보 실수를 30% 확률로 한다 */
export const beginnerBot: Bot = createRuleBot({
  name: "beginner",
  mistakes: 0.3,
});

/** 중수: 정석대로 둔다. 2단계 탐색의 시뮬레이션 상대이기도 하다 */
export const heuristicBot: Bot = createRuleBot({
  name: "normal",
  book: NORMAL_BOOK,
});

/**
 * 화면의 중수: 정석대로 두지만 사람처럼 가끔(8%) 실수한다. 매번 똑같이 두지 않게 한다.
 * 실수 없는 `heuristicBot`은 고수가 수를 읽을 때의 가상 상대와 튜토리얼 추천 카드에 쓴다
 */
export const intermediateBot: Bot = createRuleBot({
  name: "intermediate",
  book: NORMAL_BOOK,
  mistakes: 0.08,
});
