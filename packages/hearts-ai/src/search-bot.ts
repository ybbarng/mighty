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
  HAND_SIZE,
  type HeartsRules,
  heartsDeck,
  isHeart,
  type PlayerView,
  playableCards,
  pointsOf,
  QUEEN_OF_SPADES,
  type Trick,
  trickWinner,
} from "@mighty/hearts-engine";

import { type HeartsBot, knownVoids, passedTo, playedCards } from "./knowledge";
import { heartsNormalBot } from "./rule-bot";

/*
 * 하트 고수: 카드를 낼 때 남의 손패를 여러 번 추측해 판 끝까지 둬 보고 고른다.
 *
 * 1. 지금까지 본 것과 어긋나지 않게 남의 손패를 추측한다:
 *    떨어진 무늬(선 무늬를 못 따라 낸 사람), 내가 넘겨준 카드(받은 사람이 아직 쥐고 있다).
 * 2. 추측한 판마다 낼 수 있는 카드 하나하나에 대해 남은 판을 중수끼리 끝까지 둔다.
 * 3. (다른 사람 평균 점수 − 내 점수)가 가장 큰 카드를 낸다. 문 슛도 점수 계산에 들어간다.
 *
 * 카드 넘기기는 중수와 같다.
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
  return last ? (last.seat + 1) % 4 : sim.trick.leader;
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
): Card[][] | null {
  const seen = new Set<Card>([...view.hand, ...playedCards(view)]);
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
    for (const card of rest) {
      const options = others.filter(
        (s) => (left.get(s) ?? 0) > 0 && (attempt >= 30 || allowed(s, card)),
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
      (hands[chosen] as Card[]).push(card);
    }
    if (ok) return hands;
  }
  return null;
}

export interface HeartsSearchOptions {
  /** 카드 한 장을 고를 때 추측해 보는 판 수 */
  worlds?: number;
}

export function createHeartsSearchBot(
  options: HeartsSearchOptions = {},
): HeartsBot {
  const worlds = options.worlds ?? 30;
  return {
    name: "hearts-search",
    decide(view, rng): Action {
      const decision = view.decision;
      const fallback = heartsNormalBot.decide(view, rng);
      if (decision?.kind !== "play" || decision.cards.length <= 1)
        return fallback;
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
        const hands = sampleHeartsHands(view, rng);
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
      const best = Math.max(...totals);
      const top = decision.cards.filter((_, i) => totals[i] === best);
      const fallbackCard = fallback.type === "play" ? fallback.card : null;
      const card = top.find((c) => c === fallbackCard) ?? (top[0] as Card);
      return fallback.type === "play" && fallback.card === card
        ? fallback
        : { type: "play", card };
    },
  };
}

/** 고수 */
export const heartsSearchBot: HeartsBot = createHeartsSearchBot();
