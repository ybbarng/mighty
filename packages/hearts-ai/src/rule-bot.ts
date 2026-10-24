import {
  type Card,
  nextFloat,
  type RngState,
  rankPower,
  type Suit,
  suitOf,
} from "@mighty/engine";
import {
  type Action,
  type Decision,
  isHeart,
  type PlayerView,
  QUEEN_OF_SPADES,
  trickWinner,
} from "@mighty/hearts-engine";

import {
  bySuit,
  type HeartsBot,
  highest,
  knownVoids,
  lowest,
  moonThreat,
  queenOut,
} from "./knowledge";

/**
 * 하트 정석(docs/hearts/02-strategy.md). 하나씩 켜고 끌 수 있어 세기를 따로 잰다.
 * - `smartPass` 넘기기: ♠Q·♠A·♠K는 ♠가 짧으면 넘기고, 높은 하트와 짧은 무늬를 넘겨 무늬를 비운다
 * - `duck` 따라 낼 때 지금 이기는 카드보다 낮은 카드 중 가장 높은 것을 낸다. 어차피 이기면 가장 높은 카드로
 * - `dump` 무늬가 떨어지면 ♠Q → ♠A·K(♠Q가 안 나왔으면) → 높은 하트 → 짧은 무늬의 높은 카드 순으로 버린다
 * - `flushQueen` ♠Q·A·K가 없으면 낮은 ♠로 선을 잡아 ♠Q를 끌어낸다. ♠A·K만 있으면 ♠로 선을 잡지 않는다
 * - `safeLead` 선을 잡을 때 남이 떨어진 무늬는 피하고, 내 가장 낮은 카드가 낮은 무늬로 잡는다
 * - `moonGuard` 한 사람이 점수를 독차지하면 하트 한 장이라도 먹어 문 슛을 막는다
 */
export type HeartsBookRule =
  | "smartPass"
  | "duck"
  | "dump"
  | "flushQueen"
  | "safeLead"
  | "moonGuard";

export const HEARTS_BOOK: readonly HeartsBookRule[] = [
  "smartPass",
  "duck",
  "dump",
  "flushQueen",
  "safeLead",
  "moonGuard",
];

export interface HeartsRuleBotOptions {
  name?: string;
  book?: readonly HeartsBookRule[];
  /**
   * 초보 실수를 할 확률(0~1): 낮은 카드를 넘기기, 따라 낼 때 높은 카드로 덥석 이기기,
   * 무늬가 떨어졌는데 점수 카드 대신 낮은 카드 버리기, 높은 카드로 선 잡기
   */
  mistakes?: number;
}

interface Style {
  book: ReadonlySet<HeartsBookRule>;
  mistakes: number;
  rng: RngState;
}

function slip(style: Style): boolean {
  return style.mistakes > 0 && nextFloat(style.rng) < style.mistakes;
}

type PassDecision = Extract<Decision, { kind: "pass" }>;
type PlayDecision = Extract<Decision, { kind: "play" }>;

/** 넘길 카드를 고를 때의 위험도. 높을수록 먼저 넘긴다(고수가 넘기기 후보를 만들 때도 쓴다) */
export function passDanger(hand: readonly Card[], card: Card): number {
  const suit = suitOf(card) as Suit;
  const power = rankPower(card); // 2 → 0, A → 12
  const spades = bySuit(hand, "S");
  const lowSpades = spades.filter((c) => rankPower(c) < rankPower("SQ"));
  if (card === QUEEN_OF_SPADES) return lowSpades.length >= 4 ? 5 : 100;
  if (suit === "S" && power > rankPower("SQ"))
    return hand.includes(QUEEN_OF_SPADES) || lowSpades.length < 3 ? 90 : 4;
  // 높은 카드일수록 위험하다. 높은 하트는 조금 더, 짧은 무늬의 높은 카드도 조금 더(비우기 쉽다).
  // 낮은 카드(특히 낮은 하트)는 나중에 피하는 데 써야 하니 남긴다.
  const length = bySuit(hand, suit).length;
  return (
    power * 3 +
    (suit === "H" && power >= rankPower("HJ") ? 6 : 0) +
    (length <= 2 && power >= rankPower("S10") ? 4 : 0)
  );
}

function passAction(
  view: PlayerView,
  decision: PassDecision,
  style: Style,
): Action {
  const hand = view.hand;
  const count = decision.count;
  // 초보 실수: 낮은 카드를 넘긴다(높은 카드를 쥐고 있게 된다).
  if (slip(style)) {
    const cards = [...hand]
      .sort((a, b) => rankPower(a) - rankPower(b))
      .slice(0, count);
    return { type: "pass", cards };
  }
  if (!style.book.has("smartPass")) {
    const cards = [...hand]
      .sort((a, b) => rankPower(b) - rankPower(a))
      .slice(0, count);
    return { type: "pass", cards };
  }
  const cards = [...hand]
    .sort((a, b) => passDanger(hand, b) - passDanger(hand, a))
    .slice(0, count);
  return { type: "pass", cards };
}

/** 이 카드를 지금 내면 턴을 이기는가 */
function wouldWin(view: PlayerView, card: Card): boolean {
  const trick = view.trick;
  if (!trick || trick.plays.length === 0) return true;
  const plays = [...trick.plays, { seat: view.seat, card }];
  return trickWinner({ leader: trick.leader, plays }) === view.seat;
}

function play(card: Card, view: PlayerView): Action {
  return { type: "play", card, slot: sortedSlot(view.hand, card) };
}

/** 손패를 ♣ ◆ ♠ ♥, 낮은 숫자부터 펼쳤을 때의 자리(화면 연출용) */
function sortedSlot(hand: readonly Card[], card: Card): number {
  const order = ["C", "D", "S", "H"];
  const sorted = [...hand].sort(
    (a, b) =>
      order.indexOf(suitOf(a) as string) - order.indexOf(suitOf(b) as string) ||
      rankPower(a) - rankPower(b),
  );
  return sorted.indexOf(card);
}

function leadAction(
  view: PlayerView,
  decision: PlayDecision,
  style: Style,
): Action {
  const cards = decision.cards;
  if (cards.length === 1) return play(cards[0] as Card, view);
  // 초보 실수: 높은 카드로 선을 잡는다.
  if (slip(style)) return play(highest(cards) as Card, view);

  const out = queenOut(view);
  const voids = knownVoids(view);
  const someoneVoid = (suit: Suit) =>
    [...voids.entries()].some(([s, set]) => s !== view.seat && set.has(suit));

  if (style.book.has("flushQueen") && !out) {
    const spades = bySuit(cards, "S");
    const holdsHigh = spades.some(
      (c) => rankPower(c) >= rankPower(QUEEN_OF_SPADES),
    );
    const low = spades.filter((c) => rankPower(c) < rankPower(QUEEN_OF_SPADES));
    if (!holdsHigh && low.length > 0) return play(lowest(low) as Card, view);
  }

  let pool = [...cards];
  if (style.book.has("flushQueen") && !out) {
    // ♠A·K를 쥐고 있으면 ♠로 선을 잡지 않는다(♠Q를 떠안는다).
    const safer = pool.filter(
      (c) =>
        !(suitOf(c) === "S" && rankPower(c) > rankPower(QUEEN_OF_SPADES)) &&
        c !== QUEEN_OF_SPADES,
    );
    if (safer.length > 0) pool = safer;
  }
  if (style.book.has("safeLead")) {
    const safe = pool.filter((c) => !someoneVoid(suitOf(c) as Suit));
    if (safe.length > 0) pool = safe;
    // 하트는 나보다 낮은 하트가 많이 남았을 때만 늦게 낸다.
    const nonHearts = pool.filter((c) => !isHeart(c));
    if (nonHearts.length > 0) pool = nonHearts;
  }
  return play(lowest(pool) as Card, view);
}

function followAction(
  view: PlayerView,
  decision: PlayDecision,
  style: Style,
): Action {
  const cards = decision.cards;
  if (cards.length === 1) return play(cards[0] as Card, view);
  const trick = view.trick;
  const leadSuit = trick?.plays[0] ? suitOf(trick.plays[0].card) : null;
  const following = cards.every((c) => suitOf(c) === leadSuit);
  const last = (trick?.plays.length ?? 0) === view.players.length - 1;
  const threat = style.book.has("moonGuard") ? moonThreat(view) : null;
  const trickHasPoints = (trick?.plays ?? []).some(
    (p) => isHeart(p.card) || p.card === QUEEN_OF_SPADES,
  );

  if (following) {
    // 초보 실수: 높은 카드로 덥석 이긴다.
    if (slip(style)) return play(highest(cards) as Card, view);
    const losers = cards.filter((c) => !wouldWin(view, c));
    const winners = cards.filter((c) => wouldWin(view, c));
    // 문 슛 막기: 점수가 든 턴을 내가 먹을 수 있으면 먹는다.
    if (threat !== null && trickHasPoints && winners.length > 0)
      return play(lowest(winners) as Card, view);
    if (!style.book.has("duck")) return play(lowest(cards) as Card, view);
    // ♠Q가 아직 안 나왔는데 ♠가 나오면 ♠A·K는 아껴 두지 말고 아래로.
    if (losers.length > 0) {
      const safeLosers =
        leadSuit === "S" && !queenOut(view)
          ? losers
          : losers.filter((c) => c !== QUEEN_OF_SPADES || losers.length === 1);
      return play(highest(safeLosers) as Card, view);
    }
    // 어차피 이기면 가장 높은 카드로 먹는다(마지막이고 점수가 없으면 특히).
    const pick =
      last || !trickHasPoints
        ? highest(winners.filter((c) => c !== QUEEN_OF_SPADES))
        : lowest(winners);
    return play((pick ?? highest(winners)) as Card, view);
  }

  // 무늬가 떨어졌다: 버릴 카드를 고른다.
  if (slip(style)) return play(lowest(cards) as Card, view);
  if (!style.book.has("dump")) return play(highest(cards) as Card, view);
  // 문 슛을 노리는 사람이 이기고 있으면 하트를 주지 않는다.
  const winnerSeat = trick ? trickWinner(trick) : null;
  const avoidHearts = threat !== null && winnerSeat === threat;
  const pool = avoidHearts ? cards.filter((c) => !isHeart(c)) : cards;
  const choices = pool.length > 0 ? pool : cards;
  if (choices.includes(QUEEN_OF_SPADES)) return play(QUEEN_OF_SPADES, view);
  if (!queenOut(view)) {
    const bigSpade = choices.filter(
      (c) => suitOf(c) === "S" && rankPower(c) > rankPower(QUEEN_OF_SPADES),
    );
    if (bigSpade.length > 0) return play(highest(bigSpade) as Card, view);
  }
  const hearts = choices.filter(isHeart);
  if (hearts.length > 0) return play(highest(hearts) as Card, view);
  // 짧은 무늬의 높은 카드를 버려 무늬를 비운다.
  const lengths = (suit: Suit) => bySuit(view.hand, suit).length;
  const sorted = [...choices].sort(
    (a, b) =>
      lengths(suitOf(a) as Suit) - lengths(suitOf(b) as Suit) ||
      rankPower(b) - rankPower(a),
  );
  return play(sorted[0] as Card, view);
}

/** 하트 규칙 봇. 정석과 초보 실수를 따로 켜고 끈다 */
export function createHeartsRuleBot(
  options: HeartsRuleBotOptions = {},
): HeartsBot {
  const book = new Set(options.book ?? []);
  const mistakes = options.mistakes ?? 0;
  return {
    name: options.name ?? "hearts-rule",
    decide(view: PlayerView, rng: RngState): Action {
      const decision = view.decision;
      if (!decision) throw new Error("결정할 것이 없다");
      const style: Style = { book, mistakes, rng };
      switch (decision.kind) {
        case "pass":
          return passAction(view, decision, style);
        case "play":
          return decision.leading
            ? leadAction(view, decision, style)
            : followAction(view, decision, style);
        case "continue":
          return { type: "continue" };
      }
    },
  };
}

/** 정석도 실수도 없는 봇. 세기 비교의 기준 */
export const plainHeartsBot = createHeartsRuleBot({ name: "hearts-plain" });

/** 입문: 정석을 모르고 초보 실수를 30% 확률로 한다 */
export const heartsBeginnerBot = createHeartsRuleBot({
  name: "hearts-beginner",
  mistakes: 0.3,
});

/**
 * 중수가 쓰는 정석. 하나씩의 효과(정석 없는 봇 대비, 판당 점수, 2400판):
 * 넘기기 +0.33, 아래로 피하기 +1.88, 점수 버리기 +0.69, ♠Q 끌어내기 +0.04, 안전한 선 +0.26.
 * 문 슛 막기는 −0.11이라 뺐다(문 슛이 드물어 막으려다 점수를 더 먹는다).
 */
export const HEARTS_NORMAL_BOOK: readonly HeartsBookRule[] = [
  "smartPass",
  "duck",
  "dump",
  "flushQueen",
  "safeLead",
];

/** 중수: 정석대로 둔다. 고수의 시뮬레이션 상대이기도 하다 */
export const heartsNormalBot = createHeartsRuleBot({
  name: "hearts-normal",
  book: HEARTS_NORMAL_BOOK,
});

/**
 * 화면의 중수: 정석대로 두지만 사람처럼 가끔(8%) 실수한다.
 * 실수 없는 `heartsNormalBot`은 고수가 수를 읽을 때의 가상 상대로 쓴다
 */
export const heartsIntermediateBot = createHeartsRuleBot({
  name: "hearts-intermediate",
  book: HEARTS_NORMAL_BOOK,
  mistakes: 0.08,
});
