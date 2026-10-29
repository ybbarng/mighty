import { nextInt, type RngState, shuffleInPlace } from "@mighty/engine";
import { HWATU_DECK } from "@mighty/hwatu";
import {
  type Action,
  cardPoints,
  floorMatches,
  type MinhwatuRules,
  type MinhwatuState,
  type MinhwatuView,
  matchOnFloor,
  scoreRound,
  step,
  viewOf,
  YAK_CARDS,
  yakList,
} from "@mighty/minhwatu-engine";

/** 민화투 컴퓨터. 자기 자리에서 보이는 것만 보고, 받은 난수만 쓴다(온라인 판 끝 검증에서 다시 계산한다) */
export interface MinhwatuBot {
  readonly name: string;
  decide(view: MinhwatuView, rng: RngState): Action;
}

/** 지금 할 수 있는 행동 모두. 같은 달 바닥 패가 둘이면 고르는 것까지 나눈다 */
export function candidateActions(view: MinhwatuView): Action[] {
  const decision = view.decision;
  if (!decision) return [];
  if (decision.kind === "continue") return [{ type: "continue" }];
  if (decision.kind === "pick")
    return decision.options.map((target) => ({ type: "pick", target }));
  const out: Action[] = [];
  for (const card of view.hand) {
    const matches = floorMatches(view.floor, card);
    if (matches.length === 2)
      for (const target of matches) out.push({ type: "play", card, target });
    else out.push({ type: "play", card });
  }
  return out;
}

/** 이 행동으로 바로 먹는 카드(뒤집을 패는 아직 모른다) */
export function tookBy(view: MinhwatuView, action: Action): string[] {
  if (action.type === "pick")
    return view.pending ? [view.pending.flipped, action.target] : [];
  if (action.type !== "play") return [];
  const r = matchOnFloor(view.floor, action.card, action.target);
  return r.ok ? r.took : [];
}

interface Board {
  rules: MinhwatuRules;
  captured: readonly (readonly string[])[];
}

/** 약 진행의 값: 이루면 약 점수 × 인원, 덜 이뤘으면 진행만큼 조금 */
function progress(have: number, size: number, worth: number): number {
  if (have >= size) return worth;
  return worth * 0.35 * (have / size) ** 2;
}

/**
 * `seat`이 `took`을 먹을 때의 값: 카드 점수 + 내 약 진행 + 남의 약 막기.
 * 약은 나머지 모두에게서 받으므로 약 점수 × 인원만큼 판 점수 차이를 만든다
 */
export function gainValue(
  board: Board,
  seat: number,
  took: readonly string[],
): number {
  let value = 0;
  for (const id of took) value += cardPoints(id);
  const n = board.captured.length;
  for (const yak of yakList(board.rules)) {
    const set = YAK_CARDS[yak.id];
    const adding = took.filter((id) => set.includes(id)).length;
    if (adding === 0) continue;
    const worth = yak.value * n;
    const counts = board.captured.map(
      (c) => c.filter((id) => set.includes(id)).length,
    );
    const mine = counts[seat] ?? 0;
    const holders = counts.flatMap((c, s) => (c > 0 && s !== seat ? [s] : []));
    if (holders.length === 0)
      value +=
        progress(mine + adding, set.length, worth) -
        progress(mine, set.length, worth);
    // 남이 혼자 모으는 약이면 한 장만 먹어도 막는다.
    if (holders.length === 1 && mine === 0) {
      const theirs = counts[holders[0] as number] ?? 0;
      value += progress(theirs + 1, set.length, worth) * 0.8;
    }
  }
  return value;
}

/** 바닥에 놓아 남에게 내줄 위험: 남이 이 카드를 먹을 때의 값 중 가장 큰 것 */
function exposure(board: Board, seat: number, card: string): number {
  let worst = 0;
  for (let s = 0; s < board.captured.length; s++)
    if (s !== seat) worst = Math.max(worst, gainValue(board, s, [card]));
  return worst;
}

/** 남 손패에 이 달 카드가 하나라도 있을 확률(모르는 카드 `unseen`장 중 남 손패가 `others`장) */
function chanceHeld(sameMonth: number, unseen: number, others: number): number {
  if (sameMonth <= 0) return 0;
  let none = 1;
  for (let i = 0; i < others; i++)
    none *= Math.max(0, unseen - sameMonth - i) / (unseen - i);
  return 1 - none;
}

/**
 * 욕심 계산: 먹는 값 − 바닥에 놓아 내줄 위험(중수와 고수의 끝까지 둬 보기에 쓴다).
 * 내줄 위험은 남이 그 달 카드를 쥐었을 확률만큼 센다(그 달 남은 카드를 내가 다 쥐었으면 안전하다)
 */
export function greedyScorer(view: MinhwatuView): (action: Action) => number {
  const unseen = unseenCards(view);
  const others = view.handCounts.reduce(
    (sum, c, seat) => sum + (seat === view.seat ? 0 : c),
    0,
  );
  const risk = (card: string) => {
    const month = card.slice(0, 2);
    const same = unseen.filter((id) => id.startsWith(month)).length;
    return chanceHeld(same, unseen.length, others);
  };
  return (action) => {
    const took = tookBy(view, action);
    if (took.length > 0) {
      let value = gainValue(view, view.seat, took);
      // 같은 달 둘 중 하나를 먹으면 나머지는 남에게 남는다.
      if (action.type === "play" && action.target) {
        const left = floorMatches(view.floor, action.card).find(
          (id) => id !== action.target,
        );
        if (left) value -= exposure(view, view.seat, left) * 0.5 * risk(left);
      }
      return value;
    }
    if (action.type === "play")
      return -exposure(view, view.seat, action.card) * risk(action.card);
    return 0;
  };
}

export function greedyValue(view: MinhwatuView, action: Action): number {
  return greedyScorer(view)(action);
}

function pickBest(
  actions: readonly Action[],
  value: (a: Action) => number,
  rng: RngState,
): Action {
  let best: Action[] = [];
  let bestValue = -Infinity;
  for (const action of actions) {
    const v = value(action);
    if (v > bestValue + 1e-9) {
      bestValue = v;
      best = [action];
    } else if (Math.abs(v - bestValue) <= 1e-9) best.push(action);
  }
  return best[nextInt(rng, best.length)] as Action;
}

/** 입문: 먹을 수 있으면 아무거나 먹고, 없으면 아무 패나 낸다. 점수·약은 따지지 않는다 */
export const minhwatuBeginnerBot: MinhwatuBot = {
  name: "입문",
  decide(view, rng) {
    const actions = candidateActions(view);
    if (actions.length === 0) throw new Error("할 일이 없다");
    const taking = actions.filter((a) => tookBy(view, a).length > 0);
    const pool = taking.length > 0 ? taking : actions;
    return pool[nextInt(rng, pool.length)] as Action;
  },
};

/** 중수: 지금 먹는 점수·약 진행·남의 약 막기를 따지고, 바닥에 내줄 카드는 아낀다 */
export const minhwatuIntermediateBot: MinhwatuBot = {
  name: "중수",
  decide(view, rng) {
    const actions = candidateActions(view);
    if (actions.length === 0) throw new Error("할 일이 없다");
    return pickBest(actions, greedyScorer(view), rng);
  },
};

/** 내가 모르는 카드: 남의 손패와 더미 */
export function unseenCards(view: MinhwatuView): string[] {
  const known = new Set<string>([
    ...view.hand,
    ...view.floor,
    ...view.captured.flat(),
  ]);
  if (view.pending) known.add(view.pending.flipped);
  return HWATU_DECK.map((c) => c.id).filter((id) => !known.has(id));
}

/** 모르는 카드를 남의 손패(장수대로)와 더미에 무작위로 나눠 상태 하나를 만든다 */
export function sampleState(view: MinhwatuView, rng: RngState): MinhwatuState {
  const pool = shuffleInPlace(rng, unseenCards(view));
  let at = 0;
  const hands = view.handCounts.map((count, seat) => {
    if (seat === view.seat) return [...view.hand];
    const hand = pool.slice(at, at + count);
    at += count;
    return hand;
  });
  return {
    rules: { ...view.rules, rounds: view.roundNumber },
    seed: 0,
    roundNumber: view.roundNumber,
    dealer: view.dealer,
    hands,
    floor: [...view.floor],
    deck: pool.slice(at, at + view.deckCount),
    captured: view.captured.map((c) => [...c]),
    turn: view.turn,
    phase: view.phase,
    pending: view.pending,
    current: view.current,
    last: view.last,
    totals: [...view.totals],
    result: null,
    history: [],
    continued: [...view.continued],
  };
}

/** 모두 중수처럼 둬 이번 판 끝까지 간다. 내 판 점수를 돌려준다 */
function rollout(state: MinhwatuState, me: number, rng: RngState): number {
  let s = state;
  for (let guard = 0; guard < 200; guard++) {
    if (s.phase !== "play" && s.phase !== "pick") break;
    const seat = s.turn;
    const view = viewOf(s, seat);
    const actions = candidateActions(view);
    const action = pickBest(actions, greedyScorer(view), rng);
    const r = step(s, seat, action);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return scoreRound(s.captured, s.rules)[me]?.total ?? 0;
}

/** 한 수에 둬 보는 판 수(모든 후보를 합쳐서) */
const ROLLOUT_BUDGET = 1000;
const MIN_SAMPLES = 40;

/**
 * 고수: 모르는 카드(남의 손패·더미)를 여러 번 무작위로 채워 보고, 후보마다 판 끝까지 둬 본 평균 점수로 고른다.
 * 같은 채우기를 모든 후보에 써서 운의 차이를 줄인다. 둬 보는 양만 다르게 만들 수 있다(시험은 적게)
 */
export function createMinhwatuExpertBot(
  budget = ROLLOUT_BUDGET,
  minSamples = MIN_SAMPLES,
): MinhwatuBot {
  return {
    name: budget === ROLLOUT_BUDGET ? "고수" : `고수-${budget}`,
    decide(view, rng) {
      return expertDecide(view, rng, budget, minSamples);
    },
  };
}

function expertDecide(
  view: MinhwatuView,
  rng: RngState,
  budget: number,
  minSamples: number,
): Action {
  const actions = candidateActions(view);
  if (actions.length === 0) throw new Error("할 일이 없다");
  if (actions.length === 1) return actions[0] as Action;
  const samples = Math.max(minSamples, Math.floor(budget / actions.length));
  const totals = new Array<number>(actions.length).fill(0);
  for (let k = 0; k < samples; k++) {
    const world = sampleState(view, rng);
    const seed = nextInt(rng, 2 ** 31);
    for (const [i, action] of actions.entries()) {
      const r = step(world, view.seat, action);
      if (!r.ok) throw new Error(r.error);
      totals[i] = (totals[i] ?? 0) + rollout(r.state, view.seat, { seed });
    }
  }
  // 평균이 같으면 지금 먹는 값이 큰 쪽
  return pickBest(
    actions,
    (a) =>
      (totals[actions.indexOf(a)] ?? 0) / samples + greedyValue(view, a) * 1e-3,
    rng,
  );
}

export const minhwatuExpertBot: MinhwatuBot = createMinhwatuExpertBot();

export type MinhwatuLevel = 0 | 1 | 2;

export function minhwatuBotFor(level: number): MinhwatuBot {
  return level >= 2
    ? minhwatuExpertBot
    : level === 1
      ? minhwatuIntermediateBot
      : minhwatuBeginnerBot;
}
