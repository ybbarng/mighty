import {
  type Card,
  nextFloat,
  type RngState,
  type Suit,
  shuffleInPlace,
  suitOf,
} from "@mighty/engine";
import {
  type Action,
  type CompletedTrick,
  type Decision,
  HAND_SIZE,
  type HeartsRules,
  heartsDeck,
  isHeart,
  type PassDirection,
  type PlayerView,
  passTarget,
  playableCards,
  pointsOf,
  QUEEN_OF_SPADES,
  type Trick,
  trickWinner,
} from "@mighty/hearts-engine";

import { type HeartsBot, knownVoids, passedTo, playedCards } from "./knowledge";
import {
  chance,
  forgets,
  type HeartsPersona,
  heartsPersonaForSeat,
  isMemorable,
} from "./persona";
import { heartsNormalBot, passDanger } from "./rule-bot";

/*
 * 하트 고수: 카드를 낼 때 남의 손패를 여러 번 추측해 판 끝까지 둬 보고 고른다.
 *
 * 1. 지금까지 본 것과 어긋나지 않게 남의 손패를 추측한다:
 *    떨어진 무늬(선 무늬를 못 따라 낸 사람), 내가 넘겨준 카드(받은 사람이 아직 쥐고 있다).
 * 2. 추측한 판마다 낼 수 있는 카드 하나하나에 대해 남은 판을 중수끼리 끝까지 둔다.
 * 3. (다른 사람 평균 점수 − 내 점수)가 가장 큰 카드를 낸다. 문 슛도 점수 계산에 들어간다.
 *
 * 4. 카드 넘기기도 같은 방법으로 고른다(중수의 3장을 기준으로, 확실히 나은 조합이 있으면 바꾼다).
 *
 * 많이 해 본 사람처럼: 하트·♠Q·J 이상은 늘 세고 낮은 카드는 성향에 따라 가끔 잊는다.
 * 비슷한 수면 정석(중수의 수)을 따르고, 가끔은 비슷한 수 가운데 다른 수를 둔다.
 */

const PLAYERS: readonly number[] = [0, 1, 2, 3];

interface Sim {
  rules: HeartsRules;
  hands: Card[][];
  trick: Trick;
  trickIndex: number;
  tricks: CompletedTrick[];
  heartsBroken: boolean;
  taken: Card[][];
  done: boolean;
}

function cloneSim(sim: Sim): Sim {
  return {
    ...sim,
    hands: sim.hands.map((h) => [...h]),
    trick: { ...sim.trick, plays: [...sim.trick.plays] },
    tricks: [...sim.tricks],
    taken: sim.taken.map((t) => [...t]),
  };
}

function turnOf(sim: Sim): number {
  const last = sim.trick.plays[sim.trick.plays.length - 1];
  if (last) return (last.seat + 1) % 4;
  // 첫 턴 첫 카드는 ♣2를 가진 사람이 낸다.
  if (sim.trick.leader < 0)
    return Math.max(
      0,
      sim.hands.findIndex((h) => h.includes("C2" as Card)),
    );
  return sim.trick.leader;
}

/** 중수에게 넘길 화면. 중수가 읽는 칸만 채운다 */
function viewIn(sim: Sim, seat: number, cards: Card[]): PlayerView {
  return {
    seat,
    rules: sim.rules,
    players: [...PLAYERS],
    roundNumber: 1,
    phase: "play",
    direction: "none",
    hand: sim.hands[seat] ?? [],
    handCounts: sim.hands.map((h) => h.length),
    myPass: null,
    passReady: [true, true, true, true],
    received: [],
    trickIndex: sim.trickIndex,
    trick: sim.trick,
    tricks: sim.tricks,
    takenPoints: sim.taken.map((t) => pointsOf(t, sim.rules)),
    heartsBroken: sim.heartsBroken,
    turn: seat,
    scores: [0, 0, 0, 0],
    history: [],
    roundPoints: null,
    moonShooter: null,
    decision: { kind: "play", cards, leading: sim.trick.plays.length === 0 },
  };
}

function apply(sim: Sim, seat: number, card: Card): void {
  sim.hands[seat] = (sim.hands[seat] ?? []).filter((c) => c !== card);
  sim.trick.plays.push({ seat, card });
  if (
    isHeart(card) ||
    (sim.rules.queenBreaksHearts && card === QUEEN_OF_SPADES)
  )
    sim.heartsBroken = true;
  if (sim.trick.plays.length < 4) return;
  const winner = trickWinner(sim.trick);
  sim.taken[winner] = [
    ...(sim.taken[winner] ?? []),
    ...sim.trick.plays.map((p) => p.card),
  ];
  sim.tricks.push({ ...sim.trick, winner });
  if (sim.trickIndex >= HAND_SIZE - 1) {
    sim.done = true;
    return;
  }
  sim.trickIndex++;
  sim.trick = { leader: winner, plays: [] };
}

function playOut(sim: Sim, rng: RngState): void {
  while (!sim.done) {
    const seat = turnOf(sim);
    const cards = playableCards(
      sim.rules,
      sim.hands[seat] ?? [],
      sim.trick,
      sim.trickIndex,
      sim.heartsBroken,
    );
    const action = heartsNormalBot.decide(viewIn(sim, seat, cards), rng);
    apply(sim, seat, action.type === "play" ? action.card : (cards[0] as Card));
  }
}

/** 판이 끝난 뒤 (다른 사람 평균 점수 − 내 점수). 클수록 좋다 */
function utility(sim: Sim, seat: number): number {
  const points = sim.taken.map((t) => pointsOf(t, sim.rules));
  const shooter = sim.taken.findIndex(
    (t) => t.filter(isHeart).length === 13 && t.includes(QUEEN_OF_SPADES),
  );
  if (shooter >= 0 && sim.rules.moon !== "off") {
    for (let s = 0; s < 4; s++) {
      if (sim.rules.moon === "others")
        points[s] =
          s === shooter ? (points[s] ?? 0) - 26 : (points[s] ?? 0) + 26;
      else if (s === shooter) points[s] = (points[s] ?? 0) - 52;
    }
  }
  const mine = points[seat] ?? 0;
  const others = points.reduce((a, b) => a + b, 0) - mine;
  return others / 3 - mine;
}

/**
 * 남의 손패를 한 번 추측한다. 내가 넘겨준 카드는 받은 사람에게 먼저 주고,
 * 나머지는 떨어진 무늬를 피해 남은 장수에 맞춰 나눈다.
 */
export function sampleHeartsHands(
  view: PlayerView,
  rng: RngState,
  /** 잊은 카드. 어디 있는지 모르는 카드로 추측한다 */
  forgotten: ReadonlySet<Card> = new Set(),
): Card[][] | null {
  const seen = new Set<Card>(
    [...view.hand, ...playedCards(view)].filter((c) => !forgotten.has(c)),
  );
  const pool = heartsDeck().filter((c) => !seen.has(c));
  const voids = knownVoids(view);
  const passed = passedTo(view);
  const others = PLAYERS.filter((s) => s !== view.seat);
  const allowed = (seat: number, card: Card) =>
    !voids.get(seat)?.has(suitOf(card) as Suit);

  for (let attempt = 0; attempt < 40; attempt++) {
    const hands: Card[][] = PLAYERS.map(() => []);
    hands[view.seat] = [...view.hand];
    const left = new Map(others.map((s) => [s, view.handCounts[s] ?? 0]));
    // 잊은 카드만큼은 이미 나와 아무도 갖고 있지 않은 자리(-1)에 둔다.
    const nowhere = forgotten.size;
    let rest = [...pool];
    if (passed) {
      for (const card of passed.cards) {
        if (!rest.includes(card)) continue;
        (hands[passed.seat] as Card[]).push(card);
        left.set(passed.seat, (left.get(passed.seat) ?? 0) - 1);
        rest = rest.filter((c) => c !== card);
      }
    }
    shuffleInPlace(rng, rest);
    // 갈 수 있는 자리가 적은 카드부터 나눈다.
    rest.sort(
      (a, b) =>
        others.filter((s) => allowed(s, a)).length -
        others.filter((s) => allowed(s, b)).length,
    );
    let ok = true;
    left.set(-1, nowhere);
    for (const card of rest) {
      const options = [...others, -1].filter(
        (s) =>
          (left.get(s) ?? 0) > 0 &&
          (s === -1 || attempt >= 30 || allowed(s, card)),
      );
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
      if (chosen >= 0) (hands[chosen] as Card[]).push(card);
    }
    if (ok) return hands;
  }
  return null;
}

/** 판 계획 비교의 조정값(실험용으로 바꿀 수 있다) */
export const HEARTS_TUNING = {
  /** 넘기기 후보 비교에서 오차를 얼마나 깎는가. 0이면 평균이 큰 쪽 */
  passZ: 0.5,
};

/**
 * 기준 후보(0번, 정석)와 같은 추측 판끼리 짝지어 비교해, 평균 차이에서 오차를 뺀 값이 가장 큰 후보.
 * 기준보다 확실히 나은 후보가 없으면 기준. 마이티 고수의 `pickSure`와 같다.
 */
function pickSure(samples: readonly (readonly number[])[], z: number): number {
  const base = samples[0] ?? [];
  let best = 0;
  let bestGain = 0;
  samples.forEach((s, i) => {
    if (i === 0 || s.length === 0) return;
    const diffs = s.map((v, w) => v - (base[w] ?? 0));
    const n = diffs.length;
    const mean = diffs.reduce((a, b) => a + b, 0) / n;
    const variance =
      n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0;
    const gain = mean - z * Math.sqrt(variance / n);
    if (gain > bestGain) {
      bestGain = gain;
      best = i;
    }
  });
  return best;
}

type PassDecision = Extract<Decision, { kind: "pass" }>;

/** 넘기기를 정하는 중수에게 줄 화면. 중수는 손패와 장수만 읽는다 */
function passView(
  rules: HeartsRules,
  seat: number,
  hand: Card[],
  direction: PassDirection,
  count: number,
): PlayerView {
  return {
    ...viewIn(
      {
        rules,
        hands: PLAYERS.map((s) => (s === seat ? hand : [])),
        trick: { leader: -1, plays: [] },
        trickIndex: 0,
        tricks: [],
        heartsBroken: false,
        taken: PLAYERS.map(() => []),
        done: false,
      },
      seat,
      [],
    ),
    phase: "passing",
    direction,
    decision: { kind: "pass", direction, count },
  };
}

/** 넘길 카드 후보: 중수가 고를 조합(기준), 그중 한 장을 다음 위험 카드로 바꾼 것, 짧은 무늬 통째로 */
function passCandidates(hand: readonly Card[], count: number): Card[][] {
  const order = [...hand].sort(
    (a, b) => passDanger(hand, b) - passDanger(hand, a),
  );
  const base = order.slice(0, count);
  const result: Card[][] = [base];
  for (const spare of order.slice(count, count + 2))
    for (let i = 0; i < count; i++) {
      const set = [...base];
      set[i] = spare;
      result.push(set);
    }
  // 짧은 무늬를 통째로 넘겨 비우면 나중에 점수 카드를 버릴 수 있다.
  for (const suit of ["C", "D", "S"] as const) {
    const cards = hand.filter((c) => suitOf(c) === suit);
    if (cards.length === 0 || cards.length > count) continue;
    if (cards.length === 1 && cards.includes(QUEEN_OF_SPADES)) continue;
    const fill = order.filter((c) => !cards.includes(c));
    result.push([...cards, ...fill.slice(0, count - cards.length)]);
  }
  const seen = new Set<string>();
  return result.filter((set) => {
    const key = [...set].sort().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 넘길 카드를 판 끝까지 둬 보고 고른다. 추측한 판마다 남의 패를 나누고, 다른 세 사람은
 * 중수처럼 위험한 카드를 넘긴다고 본다(모두 동시에 넘기므로 내 선택과 상관없다).
 */
function planPass(
  view: PlayerView,
  decision: PassDecision,
  worlds: number,
  rng: RngState,
): Action | null {
  if (decision.direction === "none") return null;
  const me = view.seat;
  const candidates = passCandidates(view.hand, decision.count);
  if (candidates.length <= 1) return null;
  const pool = heartsDeck().filter((c) => !view.hand.includes(c));
  const samples: number[][] = candidates.map(() => []);
  for (let w = 0; w < worlds; w++) {
    const rest = shuffleInPlace(rng, [...pool]);
    const hands: Card[][] = PLAYERS.map(() => []);
    hands[me] = [...view.hand];
    let at = 0;
    for (const s of PLAYERS) {
      if (s === me) continue;
      hands[s] = rest.slice(at, at + HAND_SIZE);
      at += HAND_SIZE;
    }
    // 다른 사람이 넘길 카드
    const theirs = PLAYERS.map((s) => {
      if (s === me) return [];
      const given = heartsNormalBot.decide(
        passView(
          view.rules,
          s,
          hands[s] as Card[],
          decision.direction,
          decision.count,
        ),
        rng,
      );
      return given.type === "pass" ? given.cards : [];
    });
    candidates.forEach((cards, i) => {
      const passes = theirs.map((p, s) => (s === me ? cards : p));
      const dealt = hands.map((h, s) =>
        h.filter((c) => !(passes[s] as Card[]).includes(c)),
      );
      PLAYERS.forEach((s) => {
        const to = passTarget(s, decision.direction);
        (dealt[to] as Card[]).push(...(passes[s] as Card[]));
      });
      const sim: Sim = {
        rules: view.rules,
        hands: dealt,
        trick: { leader: -1, plays: [] },
        trickIndex: 0,
        tricks: [],
        heartsBroken: false,
        taken: PLAYERS.map(() => []),
        done: false,
      };
      playOut(sim, rng);
      (samples[i] as number[]).push(utility(sim, me));
    });
  }
  const best = candidates[pickSure(samples, HEARTS_TUNING.passZ)];
  return best ? { type: "pass", cards: best } : null;
}

/**
 * 평균이 가장 좋은 카드를 고르되, 그와 비슷한 카드(성향의 `closeMargin` 안)에 정석(중수의 카드)이
 * 있으면 정석을 따른다. 가끔(`whim`)은 비슷한 카드 가운데 아무거나 골라 매번 똑같이 두지 않는다.
 */
function chooseCard(
  cards: readonly Card[],
  values: readonly number[],
  fallback: Card | null,
  persona: HeartsPersona,
  rng: RngState,
): Card {
  const best = Math.max(...values);
  const close = cards.filter(
    (_, i) => (values[i] ?? -Infinity) >= best - persona.closeMargin,
  );
  if (close.length > 1 && chance(rng, persona.whim))
    return close[Math.floor(nextFloat(rng) * close.length)] as Card;
  if (fallback !== null && close.includes(fallback)) return fallback;
  return cards[values.indexOf(best)] as Card;
}

export interface HeartsSearchOptions {
  /** 카드 한 장을 고를 때 추측해 보는 판 수 */
  worlds?: number;
  /** 넘길 카드를 고를 때 추측해 보는 판 수. 0이면 중수처럼 넘긴다 */
  passWorlds?: number;
  /** 성향. 없으면 자리마다 정해진 성향 */
  persona?: HeartsPersona;
}

export function createHeartsSearchBot(
  options: HeartsSearchOptions = {},
): HeartsBot {
  const worlds = options.worlds ?? 30;
  const passWorlds = options.passWorlds ?? 24;
  return {
    name: "hearts-search",
    decide(view, rng): Action {
      const decision = view.decision;
      const persona = options.persona ?? heartsPersonaForSeat(view.seat);
      const fallback = heartsNormalBot.decide(view, rng);
      if (decision?.kind === "pass" && passWorlds > 0)
        return planPass(view, decision, passWorlds, rng) ?? fallback;
      if (decision?.kind !== "play" || decision.cards.length <= 1)
        return fallback;
      // 끝난 턴의 낮은 카드는 성향에 따라 잊는다(사람은 하트와 높은 카드 위주로 센다).
      const forgotten = new Set(
        view.tricks
          .flatMap((t) => t.plays.map((p) => p.card))
          .filter(
            (c) =>
              !isMemorable(c) &&
              forgets(persona, view.seat, view.roundNumber, c),
          ),
      );
      const trick = view.trick ?? { leader: view.seat, plays: [] };
      const base: Omit<Sim, "hands"> = {
        rules: view.rules,
        trick: { ...trick, plays: [...trick.plays] },
        trickIndex: view.trickIndex,
        tricks: [...view.tricks],
        heartsBroken: view.heartsBroken,
        taken: PLAYERS.map((s) =>
          view.tricks
            .filter((t) => t.winner === s)
            .flatMap((t) => t.plays.map((p) => p.card)),
        ),
        done: false,
      };
      const totals = decision.cards.map(() => 0);
      let counted = 0;
      for (let w = 0; w < worlds; w++) {
        const hands = sampleHeartsHands(view, rng, forgotten);
        if (!hands) continue;
        counted++;
        decision.cards.forEach((card, i) => {
          const sim = cloneSim({ ...base, hands });
          apply(sim, view.seat, card);
          playOut(sim, rng);
          totals[i] = (totals[i] ?? 0) + utility(sim, view.seat);
        });
      }
      if (counted === 0) return fallback;
      const fallbackCard = fallback.type === "play" ? fallback.card : null;
      const card = chooseCard(
        decision.cards,
        totals.map((t) => t / counted),
        fallbackCard,
        persona,
        rng,
      );
      return fallback.type === "play" && fallback.card === card
        ? fallback
        : { type: "play", card };
    },
  };
}

/** 고수 */
export const heartsSearchBot: HeartsBot = createHeartsSearchBot();
