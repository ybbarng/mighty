import { createRng, nextInt } from "@mighty/engine";
import { type PresetDeal, shuffledDeck, sortCards } from "@mighty/hwatu";

import { findYak, handValue, sameMonthIn } from "./hand";
import {
  callWindowMs,
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type NyrongppongRules,
  STOP_PENALTY,
} from "./rules";
import type {
  Action,
  CallAnswer,
  Decision,
  GameEvent,
  NyrongppongState,
  NyrongppongView,
  RoundEnd,
} from "./state";

export type StepResult =
  | { ok: true; state: NyrongppongState; events: GameEvent[] }
  | { ok: false; error: string };

/** 판마다 다르게 섞는 시드. 첫 판은 시드 그대로 섞는다(`shuffledDeck(seed)`) */
export function roundSeed(seed: number, roundNumber: number): number {
  return roundNumber === 1
    ? seed
    : (seed ^ Math.imul(roundNumber, 0x9e3779b1)) >>> 0;
}

/** 다음 자리(차례는 자리 번호 순서로 돈다) */
export function nextSeat(state: { rules: NyrongppongRules }, seat: number) {
  return (seat + 1) % state.rules.players;
}

/** `from` 다음 자리부터 한 바퀴(자기는 빼고) */
export function seatsAfter(
  state: { rules: NyrongppongRules },
  from: number,
): number[] {
  const n = state.rules.players;
  return Array.from({ length: n - 1 }, (_, i) => (from + 1 + i) % n);
}

function clone(state: NyrongppongState): NyrongppongState {
  return {
    ...state,
    deck: [...state.deck],
    hands: state.hands.map((h) => [...h]),
    pile: [...state.pile],
    melds: state.melds.map((m) => m.map((g) => [...g])),
    call: state.call
      ? {
          ...state.call,
          responses: state.call.responses.map((r) => ({ ...r })),
        }
      : null,
    totals: [...state.totals],
    continued: [...state.continued],
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

/** 섞어 나눈다. 모두 다섯 장, 선은 한 장 더 받아 첫 차례에 가져오지 않고 버린다 */
function deal(state: NyrongppongState, events: GameEvent[]): void {
  const n = state.rules.players;
  if (state.fair) {
    // 멘탈 포커 판: 함께 섞어 나눈 패(자리 번호 순서, 선은 여섯 장)
    const preset = state.preset;
    if (!preset) throw new Error("멘탈 포커 판인데 이번 판 패가 없다");
    state.hands = preset.hands.map((h) => [...h]);
    state.deck = [...preset.deck];
    delete state.preset;
  } else {
    const deck = shuffledDeck(roundSeed(state.seed, state.roundNumber));
    state.hands = Array.from({ length: n }, () => [] as string[]);
    for (let i = 0; i < HAND_SIZE; i++)
      for (let k = 0; k < n; k++)
        state.hands[(state.dealer + k) % n]?.push(deck.shift() as string);
    state.hands[state.dealer]?.push(deck.shift() as string);
    state.deck = deck;
  }
  state.pile = [];
  state.melds = Array.from({ length: n }, () => []);
  state.drawn = null;
  state.call = null;
  state.result = null;
  state.turn = state.dealer;
  state.phase = "discard";
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    dealer: state.dealer,
  });
}

/** 판 `round`의 선(첫 판은 시드로, 그 뒤로는 판마다 다음 자리) */
export function dealerOf(
  rules: NyrongppongRules,
  seed: number,
  round: number,
): number {
  const n = rules.players;
  return (nextInt(createRng(seed ^ 0x51ed270b), n) + round - 1) % n;
}

/** `preset`이 있으면 멘탈 포커 판: 판마다 미리 정한 패로 나눈다(다음 판 패는 `state.preset`) */
export function createMatch(
  rules: NyrongppongRules,
  seed: number,
  preset?: PresetDeal,
): { state: NyrongppongState; events: GameEvent[] } {
  if (
    !Number.isInteger(rules.players) ||
    rules.players < MIN_PLAYERS ||
    rules.players > MAX_PLAYERS
  )
    throw new Error(`나이롱뽕은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이 한다`);
  const n = rules.players;
  const state: NyrongppongState = {
    rules,
    seed,
    roundNumber: 1,
    // 첫 판 선은 시드로 정한다. 그 뒤로는 판마다 다음 자리로 넘어간다.
    dealer: dealerOf(rules, seed, 1),
    turn: 0,
    phase: "discard",
    deck: [],
    hands: [],
    pile: [],
    melds: [],
    drawn: null,
    call: null,
    totals: new Array<number>(n).fill(0),
    result: null,
    continued: new Array<boolean>(n).fill(false),
    ...(preset ? { fair: true as const, preset } : {}),
  };
  const events: GameEvent[] = [];
  deal(state, events);
  return { state, events };
}

/** 스톱할 수 있나: 뽕을 한 번 이상 했고 손패 합이 한도 이하 */
export function canStop(state: NyrongppongState, seat: number): boolean {
  const limit = state.rules.stopLimit;
  const hand = state.hands[seat] ?? [];
  return (
    limit > 0 &&
    (state.melds[seat]?.length ?? 0) > 0 &&
    hand.length > 0 &&
    handValue(hand) <= limit
  );
}

/** 스톱을 물을 수 있나(손패 합은 보지 않는다): 스톱이 있는 규칙이고, 뽕을 했고, 손패가 남았다 */
function mayStop(state: NyrongppongState, seat: number): boolean {
  return (
    state.rules.stopLimit > 0 &&
    (state.melds[seat]?.length ?? 0) > 0 &&
    (state.hands[seat]?.length ?? 0) > 0
  );
}

/** 판을 끝내고 점수를 매긴다. 판 수를 다 채웠으면 게임도 끝난다 */
function endRound(
  state: NyrongppongState,
  end: RoundEnd,
  scores: number[],
  events: GameEvent[],
): void {
  state.totals = state.totals.map((t, s) => t + (scores[s] ?? 0));
  state.result = {
    end,
    scores,
    hands: state.hands.map((h) => sortCards(h)),
    totals: [...state.totals],
  };
  state.call = null;
  state.drawn = null;
  events.push({ type: "roundEnded", result: state.result });
  if (state.roundNumber >= state.rules.rounds) {
    state.phase = "gameOver";
    events.push({ type: "gameEnded", totals: [...state.totals] });
  } else {
    state.phase = "roundEnd";
    state.continued = state.continued.map(() => false);
  }
}

/** 손패 벌점(자리별) */
function handScores(state: NyrongppongState): number[] {
  return state.hands.map((h) => handValue(h));
}

/** 차례 시작: 더미가 없으면 판 끝, 스톱할 수 있으면 묻고, 아니면 바로 한 장 가져온다 */
function beginTurn(
  state: NyrongppongState,
  seat: number,
  events: GameEvent[],
): void {
  state.turn = seat;
  state.drawn = null;
  state.call = null;
  if (state.deck.length === 0) {
    endRound(state, { kind: "deckOut" }, handScores(state), events);
    return;
  }
  // 멘탈 포커 판: 손패 합을 모르는 방장 엔진도 같은 갈림을 타도록 뽕을 한 적이 있으면 늘 묻는다.
  if (state.fair ? mayStop(state, seat) : canStop(state, seat)) {
    state.phase = "draw";
    return;
  }
  drawCard(state, seat, events);
}

function drawCard(
  state: NyrongppongState,
  seat: number,
  events: GameEvent[],
): void {
  const card = state.deck.shift() as string;
  state.hands[seat]?.push(card);
  state.drawn = card;
  state.phase = "discard";
  events.push({ type: "drew", seat });
}

/** 버린 뒤: 뽕할 수 있는 자리가 있으면(`everyDiscard`면 언제나) 응답 창을 열고, 없으면 다음 자리 차례 */
function afterDiscard(
  state: NyrongppongState,
  seat: number,
  card: string,
  events: GameEvent[],
): void {
  // 멘탈 포커 판은 누가 뽕할 수 있는지 모르므로 모두에게 묻는다(뽕할 수 있는지는 부를 때 확인한다).
  const responses = seatsAfter(state, seat)
    .filter(
      (s) => state.fair || sameMonthIn(state.hands[s] ?? [], card).length >= 2,
    )
    .map((s) => ({ seat: s, answer: null as CallAnswer | null }));
  if (responses.length === 0 && !state.rules.everyDiscard && !state.fair) {
    beginTurn(state, nextSeat(state, seat), events);
    return;
  }
  state.phase = "call";
  state.call = { from: seat, card, responses, used: 0 };
  events.push({ type: "callOpened", from: seat, card });
}

/**
 * 응답 창을 가린다. 차례가 앞선 자리부터 보며, 아직 정하지 않은 자리를 만나면 기다린다.
 * 실시간 판정으로 바꿀 때는 이 함수만 "먼저 외친 자리"를 고르게 바꾸면 된다(docs/30 2절)
 */
export function callWinner(
  responses: readonly { seat: number; answer: CallAnswer | null }[],
): { done: false } | { done: true; seat: number | null } {
  for (const r of responses) {
    if (r.answer === null) return { done: false };
    if (r.answer === "call") return { done: true, seat: r.seat };
  }
  return { done: true, seat: null };
}

function resolveCall(
  state: NyrongppongState,
  events: GameEvent[],
  timedOut: boolean,
): void {
  const call = state.call;
  if (!call) return;
  // 멘탈 포커 판: 한 장에 뽕할 수 있는 사람은 많아야 하나라(docs/30 1-2절) 부르면 바로 가져간다.
  const caller = state.fair
    ? call.responses.find((r) => r.answer === "call")
    : undefined;
  const decided = caller
    ? { done: true as const, seat: caller.seat }
    : callWinner(call.responses);
  if (!decided.done) return;
  // 버릴 때마다 여는 창은 모두 넘겨도 시간이 다 될 때까지 연다(일찍 닫히면 누가 넘겼는지 드러난다).
  if (
    decided.seat === null &&
    (state.rules.everyDiscard || state.fair) &&
    !timedOut
  )
    return;
  if (decided.seat === null) {
    events.push({ type: "callClosed", from: call.from, card: call.card });
    beginTurn(state, nextSeat(state, call.from), events);
    return;
  }
  const seat = decided.seat;
  const hand = state.hands[seat] as string[];
  const pair = sortCards(sameMonthIn(hand, call.card)).slice(0, 2);
  state.hands[seat] = hand.filter((id) => !pair.includes(id));
  state.pile.pop();
  state.melds[seat]?.push([call.card, ...pair]);
  state.call = null;
  events.push({ type: "ppong", seat, from: call.from, card: call.card });
  if ((state.hands[seat] as string[]).length === 0) {
    // 박: 뽕으로 손패를 모두 털었다. 그 패를 버린 사람이 바가지를 쓴다.
    const scores = handScores(state).map((v, s) =>
      s === seat ? 0 : s === call.from ? v + state.rules.bagaji : v,
    );
    endRound(state, { kind: "out", seat, from: call.from }, scores, events);
    return;
  }
  // 뽕한 사람은 한 장을 더 버린다. 그 뒤 차례는 뽕한 사람 다음 자리다.
  state.turn = seat;
  state.drawn = null;
  state.phase = "discard";
}

function startNextRound(state: NyrongppongState, events: GameEvent[]): void {
  state.roundNumber += 1;
  state.dealer = nextSeat(state, state.dealer);
  state.continued = state.continued.map(() => false);
  deal(state, events);
}

export function step(
  state: NyrongppongState,
  seat: number,
  action: Action,
): StepResult {
  const n = state.rules.players;
  if (!Number.isInteger(seat) || seat < 0 || seat >= n)
    return fail("없는 자리다");
  if (action.type === "retire") {
    if (state.phase === "gameOver") return fail("이미 끝난 게임이다");
    const next = clone(state);
    next.phase = "gameOver";
    next.call = null;
    next.retired = true;
    return {
      ok: true,
      state: next,
      events: [{ type: "gameEnded", totals: [...next.totals], retired: true }],
    };
  }
  if (action.type === "continue") {
    if (state.phase !== "roundEnd") return fail("판이 끝나지 않았다");
    if (state.continued[seat]) return fail("이미 눌렀다");
    const next = clone(state);
    const events: GameEvent[] = [];
    next.continued[seat] = true;
    if (next.continued.every(Boolean)) startNextRound(next, events);
    return { ok: true, state: next, events };
  }

  if (
    action.type === "call" ||
    action.type === "pass" ||
    action.type === "timeout"
  ) {
    if (state.phase !== "call" || !state.call)
      return fail("뽕을 부를 때가 아니다");
    const next = clone(state);
    const call = next.call as NonNullable<NyrongppongState["call"]>;
    const spent = Math.max(0, action.spent ?? 0);
    if (action.type === "timeout") {
      if (call.used + spent < callWindowMs(state.rules))
        return fail("아직 시간이 남았다");
      for (const r of call.responses) if (r.answer === null) r.answer = "pass";
    } else {
      const mine = call.responses.find((r) => r.seat === seat);
      if (!mine) return fail("뽕할 수 있는 패가 없다");
      if (mine.answer !== null) return fail("이미 정했다");
      if (
        action.type === "call" &&
        sameMonthIn(state.hands[seat] ?? [], call.card).length < 2
      )
        return fail("뽕할 수 있는 패가 없다");
      mine.answer = action.type;
    }
    call.used += spent;
    const events: GameEvent[] = [];
    resolveCall(next, events, action.type === "timeout");
    return { ok: true, state: next, events };
  }

  if (state.phase !== "draw" && state.phase !== "discard")
    return fail("판이 진행 중이 아니다");
  if (state.turn !== seat) return fail("차례가 아니다");

  if (action.type === "draw" || action.type === "stop") {
    if (state.phase !== "draw") return fail("지금은 버릴 차례다");
    const next = clone(state);
    const events: GameEvent[] = [];
    if (action.type === "draw") {
      drawCard(next, seat, events);
      return { ok: true, state: next, events };
    }
    // 멘탈 포커 판은 손패 합과 상관없이 묻는다. 스톱은 정말 할 수 있을 때만 받는다.
    if (!canStop(state, seat))
      return fail("스톱할 수 없다(손패 합이 한도보다 크다)");
    const values = handScores(next);
    const mine = values[seat] as number;
    const success = values.every((v, s) => s === seat || v > mine);
    events.push({ type: "stopped", seat });
    const scores = values.map((v, s) =>
      s !== seat ? v : success ? 0 : v + STOP_PENALTY,
    );
    endRound(next, { kind: "stop", seat, success }, scores, events);
    return { ok: true, state: next, events };
  }

  if (state.phase !== "discard") return fail("먼저 한 장 가져와야 한다");
  const hand = state.hands[seat] ?? [];

  if (action.type === "declare") {
    const yak = findYak(hand);
    if (!yak) return fail("약이 아니다");
    const next = clone(state);
    const events: GameEvent[] = [{ type: "declared", seat, yak }];
    const scores = handScores(next).map((v, s) => (s === seat ? yak.value : v));
    endRound(next, { kind: "yak", seat, yak }, scores, events);
    return { ok: true, state: next, events };
  }

  if (action.type !== "discard") return fail("모르는 행동이다");
  if (!hand.includes(action.card)) return fail("손에 없는 카드다");
  const next = clone(state);
  next.hands[seat] = hand.filter((id) => id !== action.card);
  next.pile.push(action.card);
  next.drawn = null;
  const events: GameEvent[] = [{ type: "discarded", seat, card: action.card }];
  afterDiscard(next, seat, action.card, events);
  return { ok: true, state: next, events };
}

/** 지금 결정해야 하는 자리들. 응답 창에서는 아직 정하지 않은 자리를 차례대로 */
export function pendingSeats(state: NyrongppongState): number[] {
  if (state.phase === "draw" || state.phase === "discard") return [state.turn];
  if (state.phase === "call")
    return (state.call?.responses ?? [])
      .filter((r) => r.answer === null)
      .map((r) => r.seat);
  if (state.phase === "roundEnd")
    return state.continued.flatMap((c, s) => (c ? [] : [s]));
  return [];
}

/**
 * 응답 창의 시계: 아직 정하지 않은 첫 자리와 창에 남은 시간(ms). 창이 없으면 null.
 * 버릴 때마다 여는 창에서 정할 자리가 없으면 버린 자리 이름으로 시간만 잰다
 */
export function callClock(
  state: NyrongppongState,
): { seat: number; left: number } | null {
  if (state.phase !== "call" || !state.call) return null;
  const waiting = state.call.responses.find((r) => r.answer === null);
  if (!waiting && !state.rules.everyDiscard) return null;
  return {
    seat: waiting ? waiting.seat : state.call.from,
    left: Math.max(0, callWindowMs(state.rules) - state.call.used),
  };
}

/** 지금 이 자리가 할 일(멘탈 포커 참가자는 자기 손패로 다시 계산한다) */
export function decisionFor(
  state: NyrongppongState,
  seat: number,
): Decision | null {
  if (state.phase === "draw" && state.turn === seat)
    return { kind: "draw", canStop: canStop(state, seat) };
  if (state.phase === "discard" && state.turn === seat)
    return { kind: "discard", yak: findYak(state.hands[seat] ?? []) };
  if (state.phase === "call") {
    const mine = state.call?.responses.find((r) => r.seat === seat);
    if (!mine || mine.answer !== null) return null;
    // 멘탈 포커 판은 모두에게 창이 열리므로 뽕할 패가 있을 때만 단추를 보인다.
    if (
      state.fair &&
      sameMonthIn(state.hands[seat] ?? [], state.call?.card ?? "").length < 2
    )
      return null;
    return { kind: "call" };
  }
  if (state.phase === "roundEnd" && !state.continued[seat])
    return { kind: "continue" };
  return null;
}

export function viewOf(state: NyrongppongState, seat: number): NyrongppongView {
  const call = state.call;
  const mine = call?.responses.find((r) => r.seat === seat);
  return {
    rules: state.rules,
    mySeat: seat,
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    turn: state.turn,
    phase: state.phase,
    hand: sortCards(state.hands[seat] ?? []),
    drawn: state.turn === seat ? state.drawn : null,
    handCounts: state.hands.map((h) => h.length),
    deckCount: state.deck.length,
    pile: [...state.pile],
    melds: state.melds.map((m) => m.map((g) => [...g])),
    totals: [...state.totals],
    call: call
      ? {
          from: call.from,
          card: call.card,
          left: Math.max(0, callWindowMs(state.rules) - call.used),
          ...(mine ? { mine: mine.answer } : {}),
        }
      : null,
    decision: decisionFor(state, seat),
    result: state.result,
    continued: [...state.continued],
    ...(state.retired ? { retired: true } : {}),
  };
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 한다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: NyrongppongRules,
  seed: number,
  log: readonly LoggedAction[],
  preset?: PresetDeal,
):
  | { ok: true; state: NyrongppongState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed, preset);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 판 결과에서 이긴 자리들(이번 판 점수가 가장 낮은 자리. 같으면 여럿) */
export function roundWinners(scores: readonly number[]): number[] {
  const best = Math.min(...scores);
  return scores.flatMap((s, i) => (s === best ? [i] : []));
}

/** 게임 등수(합계가 낮을수록 앞, 같은 점수는 같은 등수). 1부터 */
export function ranksOf(totals: readonly number[]): number[] {
  return totals.map((t) => 1 + totals.filter((o) => o < t).length);
}
