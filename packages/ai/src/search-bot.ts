import {
  type Action,
  type Card,
  canDeclareJokerCall,
  countPoints,
  type Decision,
  type FriendDeclaration,
  fullDeck,
  type Goal,
  isJoker,
  jokerCallOf,
  type Kiruda,
  lastTrickIndex,
  leadSuitOf,
  mightyOf,
  nextFloat,
  type PlayerView,
  playableCards,
  type RngState,
  type RuleSet,
  SUITS,
  type Suit,
  scoreRound,
  shuffleInPlace,
  suitOf,
  type Trick,
  type TrickContext,
  trickWinnerIndex,
} from "@mighty/engine";

import type { Bot } from "./bot";
import { heuristicBot } from "./heuristic-bot";

/*
 * 2단계 봇: 카드를 낼 때만 앞을 내다본다.
 *
 * 1. 지금까지 본 것(낸 카드, 무늬를 못 따라 낸 사람, 조커콜에 조커를 안 낸 사람)과
 *    어긋나지 않게 남의 손패를 여러 번 추측한다(determinization).
 * 2. 추측한 판마다, 낼 수 있는 카드 하나하나에 대해 남은 판을 1단계 봇끼리 끝까지 둔다.
 * 3. 판이 끝났을 때 내 돈 변화의 평균이 가장 큰 카드를 낸다.
 *
 * 엔진의 `step`은 매번 상태 전체를 깊은 복사하므로, 여기서는 카드 내기만 하는
 * 가벼운 상태를 따로 두고 엔진의 규칙 함수(낼 수 있는 카드, 트릭 승자, 점수 계산)를 그대로 쓴다.
 */

type PlayDecision = Extract<Decision, { kind: "play" }>;
type PlayAction = Extract<Action, { type: "play" }>;

interface Sim {
  rules: RuleSet;
  kiruda: Kiruda;
  goal: Goal;
  declarer: number;
  friendDeclaration: FriendDeclaration | null;
  friend: number | null;
  friendRevealed: boolean;
  players: readonly number[];
  hands: Card[][];
  trickIndex: number;
  trick: Trick;
  jokerUsed: boolean;
  scored: number[];
  discardedPoints: number;
  done: boolean;
}

function cloneSim(sim: Sim): Sim {
  return {
    ...sim,
    hands: sim.hands.map((h) => [...h]),
    trick: { ...sim.trick, plays: [...sim.trick.plays] },
    scored: [...sim.scored],
  };
}

function contextOf(sim: Sim): TrickContext {
  return { rules: sim.rules, kiruda: sim.kiruda, trickIndex: sim.trickIndex };
}

function trickCardsOf(trick: Trick) {
  return {
    cards: trick.plays.map((p) => p.card),
    jokerSuit: trick.jokerSuit,
    jokerCalled: trick.jokerCalled,
  };
}

function turnOf(sim: Sim): number {
  const last = sim.trick.plays[sim.trick.plays.length - 1];
  if (!last) return sim.trick.leader;
  const i = sim.players.indexOf(last.seat);
  return sim.players[(i + 1) % sim.players.length] as number;
}

function decisionIn(sim: Sim, seat: number): PlayDecision {
  const ctx = contextOf(sim);
  const current = trickCardsOf(sim.trick);
  const cards = playableCards(ctx, sim.hands[seat] ?? [], current);
  const leading = current.cards.length === 0;
  const callCard = jokerCallOf(sim.rules, sim.kiruda);
  const jokerCallCard =
    leading &&
    cards.includes(callCard) &&
    canDeclareJokerCall(ctx, sim.jokerUsed)
      ? callCard
      : null;
  return { kind: "play", cards, leading, jokerCallCard };
}

/** 1단계 봇에게 넘길 화면. 1단계 봇이 읽는 칸만 채운다 */
function viewIn(sim: Sim, seat: number, decision: PlayDecision): PlayerView {
  const knowsFriend = sim.friendRevealed || sim.friend === seat;
  return {
    seat,
    rules: sim.rules,
    players: [...sim.players],
    goal: sim.goal,
    declarer: sim.declarer,
    friend: knowsFriend ? sim.friend : null,
    friendRevealed: sim.friendRevealed,
    hand: sim.hands[seat] ?? [],
    trickIndex: sim.trickIndex,
    trick: sim.trick,
    jokerUsed: sim.jokerUsed,
    decision,
  } as unknown as PlayerView;
}

function apply(sim: Sim, seat: number, action: PlayAction): void {
  const { card } = action;
  const leading = sim.trick.plays.length === 0;
  sim.hands[seat] = (sim.hands[seat] ?? []).filter((c) => c !== card);
  sim.trick.plays.push({ seat, card });
  if (leading) {
    if (isJoker(card)) sim.trick.jokerSuit = action.jokerSuit ?? null;
    sim.trick.jokerCalled = action.jokerCall === true;
  }
  if (isJoker(card)) sim.jokerUsed = true;
  const declaration = sim.friendDeclaration;
  if (declaration?.kind === "card" && declaration.card === card)
    sim.friendRevealed = true;
  if (sim.trick.plays.length < sim.players.length) return;

  // 트릭 마무리
  const ctx = contextOf(sim);
  const winnerIndex = trickWinnerIndex(ctx, trickCardsOf(sim.trick));
  const winner = (sim.trick.plays[winnerIndex] as { seat: number }).seat;
  if (sim.trickIndex === 0 && declaration?.kind === "firstTrick") {
    sim.friend = winner === sim.declarer ? null : winner;
    sim.friendRevealed = true;
  }
  const points =
    sim.rules.playerCount === 2
      ? 1
      : countPoints(sim.trick.plays.map((p) => p.card));
  if (
    sim.rules.revealFriendOnScore &&
    sim.friend !== null &&
    winner === sim.friend &&
    points > 0
  )
    sim.friendRevealed = true;
  sim.scored[winner] = (sim.scored[winner] ?? 0) + points;
  if (sim.trickIndex >= lastTrickIndex(sim.rules)) {
    sim.done = true;
    return;
  }
  sim.trickIndex++;
  sim.trick = {
    leader: winner,
    plays: [],
    jokerSuit: null,
    jokerCalled: false,
  };
}

/** 남은 판을 1단계 봇끼리 끝까지 둔다 */
function playOut(sim: Sim, rng: RngState): void {
  while (!sim.done) {
    const seat = turnOf(sim);
    const decision = decisionIn(sim, seat);
    const action = heuristicBot.decide(viewIn(sim, seat, decision), rng);
    apply(sim, seat, action as PlayAction);
  }
}

/** 판이 끝난 뒤 내 돈 변화 */
function payoff(sim: Sim, seat: number, money: readonly number[]): number {
  const result = scoreRound({
    rules: sim.rules,
    goal: sim.goal,
    players: sim.players,
    declarer: sim.declarer,
    friend: sim.friend,
    noFriendDeclared: sim.friendDeclaration?.kind === "none",
    scoredBySeat: sim.scored,
    discardedPoints: sim.discardedPoints,
    money,
  });
  return (result.money[seat] ?? 0) - (money[seat] ?? 0);
}

/** 지금까지 낸 카드로 알 수 있는 것: 무늬가 떨어진 사람, 조커가 없는 사람 */
export interface Inference {
  voids: Map<number, Set<Suit>>;
  noJoker: Set<number>;
}

export function inferFromPlays(view: PlayerView): Inference {
  const voids = new Map<number, Set<Suit>>();
  const noJoker = new Set<number>();
  const kiruda = view.goal?.kiruda ?? "NT";
  const mighty = mightyOf(view.rules, kiruda);
  const callCard = jokerCallOf(view.rules, kiruda);
  const tricks: { trick: Trick; index: number }[] = view.tricks.map(
    (trick, index) => ({ trick, index }),
  );
  if (view.trick) tricks.push({ trick: view.trick, index: view.trickIndex });

  for (const { trick, index } of tricks) {
    const lead = leadSuitOf(trickCardsOf(trick));
    const called =
      trick.jokerCalled &&
      trick.plays[0]?.card === callCard &&
      !(index === 0 && !view.rules.jokerCallEffectInFirstTrick);
    for (const { seat, card } of trick.plays.slice(1)) {
      // 마이티와 조커는 무늬와 상관없이 낼 수 있어서 아무것도 알려 주지 않는다.
      if (card === mighty || isJoker(card)) continue;
      if (lead !== null && suitOf(card) !== lead) {
        const set = voids.get(seat) ?? new Set<Suit>();
        set.add(lead);
        voids.set(seat, set);
      }
      if (called) noJoker.add(seat);
    }
  }
  return { voids, noJoker };
}

function allowed(inference: Inference, seat: number, card: Card): boolean {
  if (isJoker(card)) return !inference.noJoker.has(seat);
  const suit = suitOf(card);
  return !(suit !== null && inference.voids.get(seat)?.has(suit));
}

/**
 * 남의 손패를 한 번 추측한다. `-1` 자리는 버린 카드처럼 아무도 갖지 않은 카드다.
 * 제약이 많은 카드부터, 남은 자리 수에 비례해 무작위로 나눈다.
 */
export function sampleHands(
  pool: readonly Card[],
  needs: ReadonlyMap<number, number>,
  inference: Inference,
  rng: RngState,
): Map<number, Card[]> {
  const seats = [...needs.keys()];
  for (let attempt = 0; attempt < 40; attempt++) {
    const strict = attempt < 30;
    const cards = shuffleInPlace(rng, [...pool]);
    const eligible = (card: Card) =>
      seats.filter((s) => s === -1 || !strict || allowed(inference, s, card));
    cards.sort((a, b) => eligible(a).length - eligible(b).length);
    const left = new Map(needs);
    const hands = new Map<number, Card[]>(seats.map((s) => [s, []]));
    let ok = true;
    for (const card of cards) {
      const options = eligible(card).filter((s) => (left.get(s) ?? 0) > 0);
      const total = options.reduce((sum, s) => sum + (left.get(s) ?? 0), 0);
      if (total === 0) {
        ok = false;
        break;
      }
      let r = nextFloat(rng) * total;
      let chosen = options[options.length - 1] as number;
      for (const s of options) {
        r -= left.get(s) ?? 0;
        if (r < 0) {
          chosen = s;
          break;
        }
      }
      left.set(chosen, (left.get(chosen) ?? 0) - 1);
      (hands.get(chosen) as Card[]).push(card);
    }
    if (ok) return hands;
  }
  throw new Error("손패를 추측할 수 없다");
}

/** 보이는 정보로 가벼운 상태의 뼈대를 만든다. 남의 손패는 비워 둔다 */
function baseSim(view: PlayerView): Sim {
  const goal = view.goal as Goal;
  const scored = view.money.map(() => 0);
  for (const trick of view.tricks) {
    const points =
      view.rules.playerCount === 2
        ? 1
        : countPoints(trick.plays.map((p) => p.card));
    scored[trick.winner] = (scored[trick.winner] ?? 0) + points;
  }
  const hands: Card[][] = view.money.map(() => []);
  hands[view.seat] = [...view.hand];
  return {
    rules: view.rules,
    kiruda: goal.kiruda,
    goal,
    declarer: view.declarer as number,
    friendDeclaration: view.friendDeclaration,
    friend: view.friend,
    friendRevealed: view.friendRevealed,
    players: view.players,
    hands,
    trickIndex: view.trickIndex,
    trick: view.trick
      ? { ...view.trick, plays: [...view.trick.plays] }
      : { leader: view.seat, plays: [], jokerSuit: null, jokerCalled: false },
    jokerUsed: view.jokerUsed,
    scored,
    discardedPoints: view.discarded ? countPoints(view.discarded) : 0,
    done: false,
  };
}

/** 추측한 손패를 채워 넣는다. 아직 모르는 프렌드도 추측한 손패로 정한다 */
function fillWorld(
  base: Sim,
  view: PlayerView,
  hands: Map<number, Card[]>,
): Sim {
  const sim = cloneSim(base);
  for (const [seat, cards] of hands) {
    if (seat >= 0) sim.hands[seat] = cards;
  }
  if (!view.discarded) sim.discardedPoints = countPoints(hands.get(-1) ?? []);
  const declaration = view.friendDeclaration;
  if (
    !sim.friendRevealed &&
    view.friend === null &&
    declaration?.kind === "card"
  ) {
    sim.friend =
      sim.players.find((s) => sim.hands[s]?.includes(declaration.card)) ?? null;
  }
  return sim;
}

function candidates(decision: PlayDecision): PlayAction[] {
  return decision.cards.flatMap((card): PlayAction[] => {
    if (decision.leading && isJoker(card))
      return SUITS.map((jokerSuit) => ({ type: "play", card, jokerSuit }));
    if (card === decision.jokerCallCard)
      return [
        { type: "play", card },
        { type: "play", card, jokerCall: true },
      ];
    return [{ type: "play", card }];
  });
}

function sameAction(a: PlayAction, b: Action): boolean {
  return (
    b.type === "play" &&
    a.card === b.card &&
    (a.jokerSuit ?? null) === (b.jokerSuit ?? null) &&
    (a.jokerCall ?? false) === (b.jokerCall ?? false)
  );
}

export interface SearchBotOptions {
  /** 카드 하나를 고를 때 추측해 보는 판 수. 많을수록 강하고 느리다 */
  worlds?: number;
}

/** 카드를 낼 때 남의 손패를 추측해 끝까지 둬 보는 봇 */
export function createSearchBot(options: SearchBotOptions = {}): Bot {
  const worlds = options.worlds ?? 64;
  return {
    name: "search",
    decide(view, rng) {
      const decision = view.decision;
      const fallback = heuristicBot.decide(view, rng);
      if (decision?.kind !== "play" || view.goal === null) return fallback;
      const actions = candidates(decision);
      if (actions.length <= 1) return fallback;

      const seen = new Set<Card>([
        ...view.hand,
        ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
        ...(view.trick?.plays.map((p) => p.card) ?? []),
        ...(view.discarded ?? []),
      ]);
      const pool = fullDeck().filter((c) => !seen.has(c));
      const needs = new Map<number, number>();
      for (const s of view.players) {
        if (s !== view.seat) needs.set(s, view.handCounts[s] ?? 0);
      }
      const held = [...needs.values()].reduce((a, b) => a + b, 0);
      needs.set(-1, pool.length - held);
      const inference = inferFromPlays(view);
      const base = baseSim(view);

      const totals = actions.map(() => 0);
      for (let w = 0; w < worlds; w++) {
        const world = fillWorld(
          base,
          view,
          sampleHands(pool, needs, inference, rng),
        );
        actions.forEach((action, i) => {
          const sim = cloneSim(world);
          apply(sim, view.seat, action);
          playOut(sim, rng);
          totals[i] = (totals[i] ?? 0) + payoff(sim, view.seat, view.money);
        });
      }

      // 평균이 같으면 1단계 봇이 고른 카드를 따른다.
      const best = Math.max(...totals);
      const top = actions.filter((_, i) => totals[i] === best);
      return top.find((a) => sameAction(a, fallback)) ?? (top[0] as Action);
    },
  };
}

export const searchBot: Bot = createSearchBot();
