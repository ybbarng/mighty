import { createRng, nextInt } from "@mighty/engine";
import { cardOf, isCardId, shuffledDeck, sortCards } from "@mighty/hwatu";

import { DEAL_SIZES, type MinhwatuRules } from "./rules";
import { scoreRound, yaksOf } from "./score";
import type {
  Action,
  GameEvent,
  MinhwatuState,
  MinhwatuView,
  RoundResult,
  TurnRecord,
} from "./state";

export type StepResult =
  | { ok: true; state: MinhwatuState; events: GameEvent[] }
  | { ok: false; error: string };

/** 판마다 다른 섞기 시드. 같은 게임 시드·판 번호·다시 섞은 횟수면 늘 같다 */
function roundSeed(seed: number, round: number, attempt: number): number {
  return (
    (seed ^ Math.imul(round, 0x9e3779b1) ^ Math.imul(attempt, 0x85ebca6b)) >>> 0
  );
}

/** 바닥에 같은 달 4장이 깔렸는가(그러면 아무도 먹을 수 없어 다시 섞는다) */
function floorHasFour(floor: readonly string[]): boolean {
  const count = new Map<number, number>();
  for (const id of floor) {
    const m = cardOf(id).month;
    count.set(m, (count.get(m) ?? 0) + 1);
  }
  return [...count.values()].some((n) => n >= 4);
}

/**
 * 한 판 패를 나눈다. 손패 → 바닥 → 남은 카드는 더미.
 * 바닥에 같은 달 4장이 깔리면 시드를 바꿔 다시 섞는다(결정적)
 */
export function dealRound(
  rules: MinhwatuRules,
  seed: number,
  round: number,
): { hands: string[][]; floor: string[]; deck: string[] } {
  const { hand, floor: floorSize } = DEAL_SIZES[rules.players];
  for (let attempt = 0; ; attempt++) {
    const deck = shuffledDeck(roundSeed(seed, round, attempt));
    const hands = Array.from({ length: rules.players }, (_, i) =>
      sortCards(deck.slice(i * hand, (i + 1) * hand)),
    );
    const at = rules.players * hand;
    const floor = deck.slice(at, at + floorSize);
    if (floorHasFour(floor)) continue;
    return { hands, floor, deck: deck.slice(at + floorSize) };
  }
}

/** 첫 판 선은 시드로 정한다(누가 먼저 내나도 공평하게). 그 뒤로는 앞 판 1등이 선이다 */
export function createMatch(
  rules: MinhwatuRules,
  seed: number,
): { state: MinhwatuState; events: GameEvent[] } {
  const dealer = nextInt(createRng(seed ^ 0x51ed270b), rules.players);
  const n = rules.players;
  const state: MinhwatuState = {
    rules,
    seed,
    roundNumber: 1,
    dealer,
    ...dealRound(rules, seed, 1),
    captured: Array.from({ length: n }, () => []),
    turn: dealer,
    phase: "play",
    pending: null,
    current: null,
    last: null,
    totals: new Array<number>(n).fill(0),
    result: null,
    history: [],
    continued: new Array<boolean>(n).fill(false),
  };
  return {
    state,
    events: [
      {
        type: "roundStarted",
        roundNumber: 1,
        dealer,
        handSize: DEAL_SIZES[rules.players].hand,
      },
    ],
  };
}

/** 이 카드와 같은 달인 바닥 패 */
export function floorMatches(floor: readonly string[], card: string): string[] {
  const month = cardOf(card).month;
  return floor.filter((id) => cardOf(id).month === month);
}

/**
 * 카드 한 장을 바닥에 맞춘다. 같은 달이 없으면 바닥에 놓고, 하나면 둘을 먹고,
 * 둘이면 `target`을 먹고, 셋이면 넷 모두 먹는다
 */
export function matchOnFloor(
  floor: readonly string[],
  card: string,
  target?: string,
):
  | { ok: true; floor: string[]; took: string[] }
  | { ok: false; error: string } {
  const matches = floorMatches(floor, card);
  if (matches.length === 0)
    return { ok: true, floor: [...floor, card], took: [] };
  if (matches.length === 2) {
    if (!target || !matches.includes(target))
      return {
        ok: false,
        error: "같은 달 바닥 패가 둘이에요. 먹을 패를 고르세요",
      };
    return {
      ok: true,
      floor: floor.filter((id) => id !== target),
      took: [card, target],
    };
  }
  return {
    ok: true,
    floor: floor.filter((id) => !matches.includes(id)),
    took: [card, ...matches],
  };
}

const clone = (state: MinhwatuState): MinhwatuState => ({
  ...state,
  hands: state.hands.map((h) => [...h]),
  floor: [...state.floor],
  deck: [...state.deck],
  captured: state.captured.map((c) => [...c]),
  totals: [...state.totals],
  continued: [...state.continued],
  history: [...state.history],
});

/** 먹은 카드를 더하고 새로 이룬 약을 알린다 */
function capture(
  state: MinhwatuState,
  seat: number,
  took: readonly string[],
  events: GameEvent[],
): void {
  if (took.length === 0) return;
  const before = yaksOf(state.captured[seat] ?? [], state.rules);
  const mine = [...(state.captured[seat] ?? []), ...took];
  state.captured[seat] = mine;
  for (const yak of yaksOf(mine, state.rules))
    if (!before.some((y) => y.id === yak.id))
      events.push({ type: "yak", seat, yak: yak.id, value: yak.value });
}

/** 다음 차례: 손패가 남은 다음 자리. 모두 비었으면 판 끝 */
function finishTurn(state: MinhwatuState, events: GameEvent[]): void {
  state.last = state.current;
  state.current = null;
  state.pending = null;
  const n = state.rules.players;
  for (let k = 1; k <= n; k++) {
    const seat = (state.turn + k) % n;
    if ((state.hands[seat]?.length ?? 0) > 0) {
      state.turn = seat;
      state.phase = "play";
      return;
    }
  }
  endRound(state, events);
}

/** 판 점수를 매긴다. 마지막 판이면 게임도 끝난다 */
function endRound(state: MinhwatuState, events: GameEvent[]): void {
  const scores = scoreRound(state.captured, state.rules);
  const best = Math.max(...scores.map((s) => s.total));
  const result: RoundResult = {
    roundNumber: state.roundNumber,
    scores,
    winners: scores.flatMap((s, seat) => (s.total === best ? [seat] : [])),
  };
  state.totals = state.totals.map((t, seat) => t + (scores[seat]?.total ?? 0));
  state.result = result;
  state.history = [...state.history, result];
  state.continued = state.continued.map(() => false);
  events.push({ type: "roundEnded", result, totals: [...state.totals] });
  if (state.roundNumber >= state.rules.rounds) {
    state.phase = "gameOver";
    events.push({
      type: "gameEnded",
      totals: [...state.totals],
      winners: totalWinners(state.totals),
    });
  } else state.phase = "roundEnd";
}

function totalWinners(totals: readonly number[]): number[] {
  const best = Math.max(...totals);
  return totals.flatMap((t, seat) => (t === best ? [seat] : []));
}

/** 다음 판: 앞 판 1등이 선(같으면 앞 판 선부터 차례로 보아 먼저 오는 자리) */
function startNextRound(state: MinhwatuState, events: GameEvent[]): void {
  const n = state.rules.players;
  const winners = state.result?.winners ?? [state.dealer];
  let dealer = state.dealer;
  for (let k = 0; k < n; k++) {
    const seat = (state.dealer + k) % n;
    if (winners.includes(seat)) {
      dealer = seat;
      break;
    }
  }
  const round = state.roundNumber + 1;
  const dealt = dealRound(state.rules, state.seed, round);
  state.roundNumber = round;
  state.dealer = dealer;
  state.hands = dealt.hands;
  state.floor = dealt.floor;
  state.deck = dealt.deck;
  state.captured = Array.from({ length: n }, () => []);
  state.turn = dealer;
  state.phase = "play";
  state.pending = null;
  state.current = null;
  state.last = null;
  state.result = null;
  state.continued = new Array<boolean>(n).fill(false);
  events.push({
    type: "roundStarted",
    roundNumber: round,
    dealer,
    handSize: DEAL_SIZES[state.rules.players].hand,
  });
}

/** 더미에서 한 장 뒤집어 바닥에 맞춘다. 바닥 두 장과 맞으면 고르기를 기다린다 */
function flip(state: MinhwatuState, seat: number, events: GameEvent[]): void {
  const record = state.current as TurnRecord;
  const card = state.deck[0];
  if (card === undefined) {
    finishTurn(state, events);
    return;
  }
  state.deck = state.deck.slice(1);
  record.flipped = card;
  const matches = floorMatches(state.floor, card);
  if (matches.length === 2) {
    state.phase = "pick";
    state.pending = { flipped: card, options: sortCards(matches) };
    events.push({ type: "flipped", seat, card, took: [], waiting: true });
    return;
  }
  const result = matchOnFloor(state.floor, card);
  if (!result.ok) throw new Error(result.error);
  state.floor = result.floor;
  record.flipTook = result.took;
  events.push({ type: "flipped", seat, card, took: result.took });
  capture(state, seat, result.took, events);
  finishTurn(state, events);
}

export function step(
  state: MinhwatuState,
  seat: number,
  action: Action,
): StepResult {
  if (action.type === "retire") {
    if (state.phase === "gameOver")
      return { ok: false, error: "끝난 게임이다" };
    const next = clone(state);
    next.phase = "gameOver";
    next.retired = true;
    next.pending = null;
    return {
      ok: true,
      state: next,
      events: [
        {
          type: "gameEnded",
          totals: [...next.totals],
          winners: totalWinners(next.totals),
          retired: true,
        },
      ],
    };
  }
  if (action.type === "continue") {
    if (state.phase !== "roundEnd")
      return { ok: false, error: "판이 끝났을 때만 다음 판으로 갈 수 있다" };
    if (state.continued[seat]) return { ok: false, error: "이미 눌렀다" };
    const next = clone(state);
    next.continued[seat] = true;
    const events: GameEvent[] = [];
    if (next.continued.every(Boolean)) startNextRound(next, events);
    return { ok: true, state: next, events };
  }
  if (seat !== state.turn) return { ok: false, error: "내 차례가 아니에요" };
  if (action.type === "pick") {
    if (state.phase !== "pick" || !state.pending)
      return { ok: false, error: "지금은 고를 때가 아니에요" };
    if (!state.pending.options.includes(action.target))
      return { ok: false, error: "뒤집은 패와 같은 달 바닥 패를 고르세요" };
    const next = clone(state);
    const flipped = state.pending.flipped;
    const took = [flipped, action.target];
    next.floor = next.floor.filter((id) => id !== action.target);
    next.current = { ...(next.current as TurnRecord), flipTook: took };
    const events: GameEvent[] = [{ type: "picked", seat, card: flipped, took }];
    capture(next, seat, took, events);
    finishTurn(next, events);
    return { ok: true, state: next, events };
  }
  // play
  if (state.phase !== "play")
    return { ok: false, error: "지금은 패를 낼 때가 아니에요" };
  if (!isCardId(action.card) || !state.hands[seat]?.includes(action.card))
    return { ok: false, error: "손에 없는 패예요" };
  const matched = matchOnFloor(state.floor, action.card, action.target);
  if (!matched.ok) return matched;
  const next = clone(state);
  next.hands[seat] = (next.hands[seat] ?? []).filter(
    (id) => id !== action.card,
  );
  next.floor = matched.floor;
  next.current = {
    seat,
    played: action.card,
    playTook: matched.took,
    flipped: null,
    flipTook: [],
  };
  const events: GameEvent[] = [
    { type: "played", seat, card: action.card, took: matched.took },
  ];
  capture(next, seat, matched.took, events);
  flip(next, seat, events);
  return { ok: true, state: next, events };
}

export function viewOf(state: MinhwatuState, seat: number): MinhwatuView {
  const myTurn = state.turn === seat;
  return {
    seat,
    rules: state.rules,
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    hand: [...(state.hands[seat] ?? [])],
    handCounts: state.hands.map((h) => h.length),
    floor: [...state.floor],
    deckCount: state.deck.length,
    captured: state.captured.map((c) => [...c]),
    turn: state.turn,
    phase: state.phase,
    pending: state.pending,
    current: state.current,
    last: state.last,
    totals: [...state.totals],
    result: state.result,
    history: state.history,
    continued: [...state.continued],
    retired: state.retired === true,
    decision:
      state.phase === "play" && myTurn
        ? { kind: "play" }
        : state.phase === "pick" && myTurn && state.pending
          ? { kind: "pick", options: [...state.pending.options] }
          : state.phase === "roundEnd" && !state.continued[seat]
            ? { kind: "continue" }
            : null,
  };
}

/** 지금 결정해야 하는 자리들 */
export function pendingSeats(state: MinhwatuState): number[] {
  if (state.phase === "play" || state.phase === "pick") return [state.turn];
  if (state.phase === "roundEnd")
    return state.continued.flatMap((c, seat) => (c ? [] : [seat]));
  return [];
}

/** 시작 조건과 행동 기록으로 상태를 다시 만든다(기록 검증·복기·무르기) */
export function replay(
  rules: MinhwatuRules,
  seed: number,
  log: readonly { seat: number; action: Action }[],
):
  | { ok: true; state: MinhwatuState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}
