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
  type PlayerView,
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

function lead(view: PlayerView, decision: PlayDecision): Action {
  const kiruda = kirudaOf(view);
  const cards = decision.cards;
  const jokerOut = view.jokerUsed || view.hand.some(isJoker);
  const ruling = isRulingSelf(view);

  // 조커콜로 상대 조커를 끌어낸다.
  if (decision.jokerCallCard && !jokerOut)
    return playCard(view, decision.jokerCallCard, true);

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
    if (kirudaCards.length >= 2) {
      const highest = [...kirudaCards].sort(
        (a, b) => rankPower(b) - rankPower(a),
      )[0] as Card;
      return playCard(view, highest);
    }
  }
  const plain = cards.filter(
    (c) => !isJoker(c) && c !== mightyOf(view.rules, kiruda),
  );
  return playCard(view, cheapest(view, plain.length > 0 ? plain : cards));
}

function follow(view: PlayerView, decision: PlayDecision): Action {
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

  if (winning.length > 0) {
    const best = cheapest(view, winning);
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
): Action {
  if (decision.canDealMiss) return { type: "dealMiss" };
  const { kiruda, estimate } = bestKiruda(view.rules, view.hand);
  const target = Math.floor(estimate);
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
  const discard = [...view.hand]
    .sort(
      (a, b) =>
        cardKeepValue(rules, view.hand, goal.kiruda, a, jokerCall) -
        cardKeepValue(rules, view.hand, goal.kiruda, b, jokerCall),
    )
    .slice(0, decision.discardCount);
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
export const heuristicBot: Bot = {
  name: "heuristic",
  decide(view: PlayerView): Action {
    const decision = view.decision;
    if (decision === null) throw new Error("결정할 것이 없다");
    switch (decision.kind) {
      case "pick": {
        const card = decision.faceUp;
        return {
          type: "pick",
          index: isJoker(card) || rankPower(card) >= rankPower("SJ") ? 0 : 1,
        };
      }
      case "election":
        return electionAction(view, decision);
      case "kill":
        return killAction(view, decision);
      case "exchange":
        return exchangeAction(view, decision);
      case "friend":
        return friendAction(view, decision);
      case "play":
        return decision.leading ? lead(view, decision) : follow(view, decision);
      case "continue":
        return { type: "continue" };
    }
  },
};
