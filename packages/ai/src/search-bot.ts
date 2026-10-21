import {
  type Action,
  type Card,
  canDeclareJokerCall,
  countPoints,
  type Decision,
  deckFor,
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
import { cardKeepValue, estimatePoints, KIRUDAS } from "./hand";
import { heuristicBot } from "./heuristic-bot";

/*
 * 2단계 봇: 카드를 낼 때 앞을 내다본다. 공약·교환·프렌드도 같은 방법으로 판 끝까지 둬 보고 정한다(아래 "판 전체 계획").
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
  /** 끝난 턴에 나온 카드. 1단계 봇이 마이티·기루다를 셀 때 쓴다 */
  played: Card[];
  done: boolean;
}

function cloneSim(sim: Sim): Sim {
  return {
    ...sim,
    hands: sim.hands.map((h) => [...h]),
    trick: { ...sim.trick, plays: [...sim.trick.plays] },
    scored: [...sim.scored],
    played: [...sim.played],
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
    friendDeclaration: sim.friendDeclaration,
    tricks: [
      {
        leader: sim.declarer,
        winner: sim.declarer,
        jokerSuit: null,
        jokerCalled: false,
        plays: sim.played.map((card) => ({ seat: -1, card })),
      },
    ],
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
  sim.played.push(...sim.trick.plays.map((p) => p.card));
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
    played: view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
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

/*
 * 판 전체 계획: 공약, 바닥 카드 교환, 프렌드 고르기.
 *
 * 남의 손패(공약 때는 바닥 카드까지)를 여러 번 추측하고, 고를 수 있는 것마다 판 처음부터
 * 끝까지 1단계 봇끼리 둬 본다. 같은 추측 판으로 모든 후보를 비교해 운의 차이를 줄인다.
 */

/** 판 처음(첫 트릭 전) 상태. 첫 트릭 선은 주공이다 */
function roundStart(
  rules: RuleSet,
  players: readonly number[],
  money: readonly number[],
  declarer: number,
  goal: Goal,
  friendDeclaration: FriendDeclaration,
  hands: Card[][],
  discarded: readonly Card[],
): Sim {
  let friend: number | null = null;
  if (friendDeclaration.kind === "card")
    friend =
      players.find(
        (s) => s !== declarer && hands[s]?.includes(friendDeclaration.card),
      ) ?? null;
  else if (friendDeclaration.kind === "player") friend = friendDeclaration.seat;
  return {
    rules,
    kiruda: goal.kiruda,
    goal,
    declarer,
    friendDeclaration,
    friend,
    friendRevealed: friendDeclaration.kind === "none",
    players,
    hands: hands.map((h) => [...h]),
    trickIndex: 0,
    trick: { leader: declarer, plays: [], jokerSuit: null, jokerCalled: false },
    jokerUsed: false,
    scored: money.map(() => 0),
    discardedPoints: countPoints(discarded),
    played: [],
    done: false,
  };
}

/** 주공이 버릴 카드: 남길 가치가 낮은 것부터 */
function discardFor(
  rules: RuleSet,
  hand: readonly Card[],
  kiruda: Kiruda,
  count: number,
): Card[] {
  const jokerCall = jokerCallOf(rules, kiruda);
  return [...hand]
    .sort(
      (a, b) =>
        cardKeepValue(rules, hand, kiruda, a, jokerCall) -
        cardKeepValue(rules, hand, kiruda, b, jokerCall),
    )
    .slice(0, count);
}

/** 1단계 봇과 같은 순서로 부를 만한 프렌드 후보 */
function friendCandidates(
  rules: RuleSet,
  kiruda: Kiruda,
  options: readonly FriendDeclaration[],
): FriendDeclaration[] {
  const cards = new Set(
    options.flatMap((o) => (o.kind === "card" ? [o.card] : [])),
  );
  const wanted: Card[] = [mightyOf(rules, kiruda), "JK"];
  if (kiruda !== "NT") wanted.push(`${kiruda}A`, `${kiruda}K`);
  for (const suit of SUITS) if (suit !== kiruda) wanted.push(`${suit}A`);
  if (kiruda !== "NT") wanted.push(`${kiruda}Q`);
  const result: FriendDeclaration[] = wanted
    .filter((c) => cards.has(c))
    .slice(0, 5)
    .map((card) => ({ kind: "card", card }));
  for (const o of options)
    if (o.kind === "firstTrick" || o.kind === "none") result.push(o);
  return result;
}

/** 프렌드 선택지가 아직 없을 때(공약·교환 중) 쓸 1단계 봇식 프렌드 */
function likelyFriend(
  rules: RuleSet,
  kiruda: Kiruda,
  hand: readonly Card[],
): FriendDeclaration {
  if (!rules.friend) return { kind: "none" };
  const options: FriendDeclaration[] = fullDeck()
    .filter((c) => !hand.includes(c))
    .map((card) => ({ kind: "card", card }));
  return friendCandidates(rules, kiruda, options)[0] ?? { kind: "none" };
}

interface World {
  hands: Map<number, Card[]>;
}

/**
 * 남의 손패를 여러 번 추측한다. 이 규칙의 덱에서 내가 아는 카드를 뺀 나머지를 나눈다.
 * 남는 카드(바닥 카드 등)는 `-1` 자리에 둔다.
 */
function sampleWorlds(
  view: PlayerView,
  known: readonly Card[],
  count: number,
  rng: RngState,
): World[] {
  const pool = deckFor(view.rules).filter((c) => !known.includes(c));
  const needs = new Map<number, number>();
  for (const s of view.players)
    if (s !== view.seat) needs.set(s, view.handCounts[s] ?? 0);
  const held = [...needs.values()].reduce((a, b) => a + b, 0);
  if (held > pool.length) throw new Error("손패 장수가 맞지 않는다");
  if (pool.length > held) needs.set(-1, pool.length - held);
  const inference: Inference = { voids: new Map(), noJoker: new Set() };
  return Array.from({ length: count }, () => ({
    hands: sampleHands(pool, needs, inference, rng),
  }));
}

function handsOf(view: PlayerView, world: World, mine: readonly Card[]) {
  const hands: Card[][] = view.money.map(() => []);
  for (const [seat, cards] of world.hands) if (seat >= 0) hands[seat] = cards;
  hands[view.seat] = [...mine];
  return hands;
}

/** 이 계획으로 둔 판들의 평균 돈 변화 */
function averagePayoff(
  view: PlayerView,
  worlds: readonly World[],
  plan: {
    goal: Goal;
    friend: FriendDeclaration;
    hand: readonly Card[];
    discard: readonly Card[];
  },
  rng: RngState,
): number {
  let total = 0;
  for (const world of worlds) {
    const sim = roundStart(
      view.rules,
      view.players,
      view.money,
      view.seat,
      plan.goal,
      plan.friend,
      handsOf(view, world, plan.hand),
      plan.discard,
    );
    playOut(sim, rng);
    total += payoff(sim, view.seat, view.money);
  }
  return total / worlds.length;
}

function planExchange(
  view: PlayerView,
  decision: Extract<Decision, { kind: "exchange" }>,
  worldCount: number,
  rng: RngState,
): Action | null {
  const { rules } = view;
  const worlds = sampleWorlds(view, view.hand, worldCount, rng);
  // 기루다 후보: 당선 공약과, 바꿀 수 있는 공약 중 패가 좋아 보이는 둘
  const lowest = (kiruda: Kiruda) =>
    decision.goals
      .filter((g) => g.kiruda === kiruda)
      .sort((a, b) => a.score - b.score)[0];
  const goals: Goal[] = [decision.electedGoal];
  const others = KIRUDAS.filter((k) => k !== decision.electedGoal.kiruda)
    .map((k) => ({
      goal: lowest(k),
      estimate: estimatePoints(rules, view.hand, k),
    }))
    .filter((o): o is { goal: Goal; estimate: number } => o.goal !== undefined)
    .sort((a, b) => b.estimate - b.goal.score - (a.estimate - a.goal.score))
    .slice(0, 2);
  goals.push(...others.map((o) => o.goal));

  let best: { action: Action; value: number } | null = null;
  for (const goal of goals) {
    const base = discardFor(rules, view.hand, goal.kiruda, view.hand.length);
    const count = decision.discardCount;
    // 버릴 카드: 1단계 봇이 고른 것과, 그중 한 장을 다음 후보로 바꾼 것들
    const sets: Card[][] = [base.slice(0, count)];
    const spare = base[count];
    if (spare)
      for (let i = 0; i < count; i++) {
        const set = base.slice(0, count);
        set[i] = spare;
        sets.push(set);
      }
    for (const discard of sets) {
      const hand = view.hand.filter((c) => !discard.includes(c));
      const value = averagePayoff(
        view,
        worlds,
        { goal, friend: likelyFriend(rules, goal.kiruda, hand), hand, discard },
        rng,
      );
      if (!best || value > best.value)
        best = { action: { type: "exchange", goal, discard }, value };
    }
  }
  return best?.action ?? null;
}

function planFriend(
  view: PlayerView,
  decision: Extract<Decision, { kind: "friend" }>,
  worldCount: number,
  rng: RngState,
): Action | null {
  const goal = view.goal;
  if (!goal) return null;
  const candidates = friendCandidates(
    view.rules,
    goal.kiruda,
    decision.options,
  );
  if (candidates.length <= 1) return null;
  const known = [...view.hand, ...(view.discarded ?? [])];
  const worlds = sampleWorlds(view, known, worldCount, rng);
  const discard = view.discarded ?? [];
  let best: { friend: FriendDeclaration; value: number } | null = null;
  for (const friend of candidates) {
    const value = averagePayoff(
      view,
      worlds,
      { goal, friend, hand: view.hand, discard },
      rng,
    );
    if (!best || value > best.value) best = { friend, value };
  }
  return best ? { type: "friend", friend: best.friend } : null;
}

/** 공약을 걸어 볼 만한 최소 기대 이득(판당 돈). 포기했을 때보다 이만큼은 나아야 나선다 */
const BID_MARGIN = 0.4;

function planElection(
  view: PlayerView,
  decision: Extract<Decision, { kind: "election" }>,
  worldCount: number,
  rng: RngState,
): Action | null {
  if (decision.canDealMiss || decision.bids.length === 0) return null;
  // 6·7마는 당선 뒤 한 사람을 죽이고 다시 나눠 손패가 달라지므로 어림으로 둔다.
  if (view.rules.playerCount > 5) return null;
  const { rules } = view;
  const kitty = view.kittyCount;
  const worlds = sampleWorlds(view, view.hand, worldCount, rng);

  let best: { goal: Goal; value: number } | null = null;
  for (const kiruda of KIRUDAS) {
    const bids = decision.bids
      .filter((g) => g.kiruda === kiruda)
      .sort((a, b) => a.score - b.score);
    const lowest = bids[0];
    if (!lowest) continue;
    // 바닥 카드를 받아 1단계 봇처럼 버리고 프렌드를 부른 뒤 끝까지 둔다.
    let total = 0;
    for (const world of worlds) {
      const full = [...view.hand, ...(world.hands.get(-1) ?? [])];
      const discard = discardFor(rules, full, kiruda, kitty);
      const hand = full.filter((c) => !discard.includes(c));
      const sim = roundStart(
        rules,
        view.players,
        view.money,
        view.seat,
        lowest,
        likelyFriend(rules, kiruda, hand),
        handsOf(view, world, hand),
        discard,
      );
      playOut(sim, rng);
      total += payoff(sim, view.seat, view.money);
    }
    const value = total / worlds.length;
    if (!best || value > best.value) best = { goal: lowest, value };
  }
  if (best && best.value > BID_MARGIN) return { type: "bid", goal: best.goal };
  return decision.canPass ? { type: "pass" } : null;
}

export interface SearchBotOptions {
  /** 카드 하나를 고를 때 추측해 보는 판 수. 많을수록 강하고 느리다 */
  worlds?: number;
  /** 공약·교환·프렌드를 정할 때 추측해 보는 판 수. 0이면 1단계 봇처럼 어림한다 */
  planWorlds?: number;
}

/** 카드를 낼 때 남의 손패를 추측해 끝까지 둬 보는 봇 */
export function createSearchBot(options: SearchBotOptions = {}): Bot {
  const worlds = options.worlds ?? 64;
  const planWorlds = options.planWorlds ?? 24;
  return {
    name: "search",
    decide(view, rng) {
      const decision = view.decision;
      const fallback = heuristicBot.decide(view, rng);
      // 2마는 판 흐름(카드 고르기)이 달라 공약·교환은 어림으로 둔다.
      if (planWorlds > 0 && view.rules.playerCount >= 3) {
        const planned =
          decision?.kind === "election"
            ? planElection(view, decision, planWorlds, rng)
            : decision?.kind === "exchange"
              ? planExchange(view, decision, planWorlds, rng)
              : decision?.kind === "friend"
                ? planFriend(view, decision, planWorlds, rng)
                : null;
        if (planned) return planned;
      }
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
