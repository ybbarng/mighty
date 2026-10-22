import {
  type Card,
  createRng,
  type RngState,
  rankPower,
  shuffleInPlace,
  suitOf,
} from "@mighty/engine";

import {
  heartsDeck,
  isHeart,
  isPenaltyCard,
  pointsOf,
  QUEEN_OF_SPADES,
  TWO_OF_CLUBS,
} from "./cards";
import { HAND_SIZE, type HeartsRules, PLAYER_COUNT } from "./rules";
import type {
  Action,
  Decision,
  GameEvent,
  MatchState,
  PassDirection,
  RoundState,
  Trick,
} from "./state";

export interface CreateMatchOptions {
  rules: HeartsRules;
  seed: number;
  /** 테스트·튜토리얼용으로 정해 둔 손패(자리 순서) */
  presetHands?: Card[][];
}

export type StepResult =
  | { ok: true; state: MatchState; events: GameEvent[] }
  | { ok: false; error: string };

const DIRECTIONS: readonly PassDirection[] = [
  "left",
  "right",
  "across",
  "none",
];

/** 이번 판에 카드를 넘기는 방향 */
export function directionFor(
  rules: HeartsRules,
  roundNumber: number,
): PassDirection {
  if (rules.passing === "none" || rules.passCount <= 0) return "none";
  if (rules.passing === "left") return "left";
  return DIRECTIONS[(roundNumber - 1) % DIRECTIONS.length] as PassDirection;
}

/** 이 자리가 카드를 넘겨줄 자리 */
export function passTarget(seat: number, direction: PassDirection): number {
  const offset =
    direction === "left"
      ? 1
      : direction === "right"
        ? PLAYER_COUNT - 1
        : direction === "across"
          ? 2
          : 0;
  return (seat + offset) % PLAYER_COUNT;
}

function nextSeat(seat: number): number {
  return (seat + 1) % PLAYER_COUNT;
}

function deal(rng: RngState, preset?: Card[][]): Card[][] {
  if (preset) return preset.map((h) => [...h]);
  const deck = shuffleInPlace(rng, heartsDeck());
  return Array.from({ length: PLAYER_COUNT }, (_, i) =>
    deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE),
  );
}

function newRound(
  state: MatchState,
  roundNumber: number,
  preset?: Card[][],
): { round: RoundState; events: GameEvent[] } {
  const direction = directionFor(state.rules, roundNumber);
  // 다음 판을 정해진 패(멘탈 포커로 섞은 자리 표)로 시작한다. 쓰고 나면 지운다.
  const next = preset ?? state.presetHands;
  delete state.presetHands;
  const hands = deal(state.rng, next);
  const round: RoundState = {
    phase: "passing",
    direction,
    hands,
    passes: hands.map(() => null),
    received: hands.map(() => []),
    trickIndex: 0,
    trick: null,
    tricks: [],
    taken: hands.map(() => []),
    heartsBroken: false,
    turn: null,
    roundPoints: null,
    moonShooter: null,
    continued: hands.map(() => false),
  };
  if (direction === "none") startPlay(round);
  return {
    round,
    events: [
      { type: "roundStarted", roundNumber, direction },
      { type: "dealt", handSize: HAND_SIZE },
    ],
  };
}

/**
 * ♣2를 가진 사람이 첫 턴의 선이다. 차례는 비워 두고(`turn: null`, `leader: -1`) ♣2를 가진 사람만 낼 수 있다.
 * 엔진이 남의 패를 모를 때(멘탈 포커)도 가진 사람이 내면서 드러나도록 이렇게 한다
 */
function startPlay(round: RoundState): void {
  round.phase = "play";
  round.trickIndex = 0;
  round.trick = { leader: -1, plays: [] };
  round.turn = null;
}

/** 첫 턴 첫 카드(♣2)를 기다리는 중인가 */
export function awaitingOpening(round: RoundState): boolean {
  return (
    round.phase === "play" &&
    round.trickIndex === 0 &&
    round.turn === null &&
    (round.trick?.plays.length ?? 0) === 0
  );
}

export function createMatch(options: CreateMatchOptions): {
  state: MatchState;
  events: GameEvent[];
} {
  const state: MatchState = {
    rules: options.rules,
    rng: createRng(options.seed),
    players: Array.from({ length: PLAYER_COUNT }, (_, i) => i),
    scores: Array(PLAYER_COUNT).fill(0),
    history: [],
    roundNumber: 1,
    round: undefined as unknown as RoundState,
  };
  const { round, events } = newRound(state, 1, options.presetHands);
  state.round = round;
  return { state, events };
}

/** 선 무늬. 아직 아무도 안 냈으면 `null` */
export function leadSuit(trick: Trick | null) {
  const first = trick?.plays[0];
  return first ? suitOf(first.card) : null;
}

/** 선 무늬에서 가장 높은 카드를 낸 사람이 이긴다 */
export function trickWinner(trick: Trick): number {
  const suit = leadSuit(trick);
  let best = trick.plays[0];
  for (const play of trick.plays) {
    if (
      best &&
      suitOf(play.card) === suit &&
      rankPower(play.card) > rankPower(best.card)
    )
      best = play;
  }
  return best?.seat ?? trick.leader;
}

/** 지금 낼 수 있는 카드 */
export function playableCards(
  rules: HeartsRules,
  hand: readonly Card[],
  trick: Trick,
  trickIndex: number,
  heartsBroken: boolean,
): Card[] {
  const first = trickIndex === 0;
  if (trick.plays.length === 0) {
    // 첫 턴의 선은 ♣2를 낸다.
    if (first && hand.includes(TWO_OF_CLUBS)) return [TWO_OF_CLUBS];
    // 하트가 깨지기 전에는 하트로 선을 잡을 수 없다(하트뿐이면 예외).
    if (rules.heartsBreak && !heartsBroken) {
      const nonHearts = hand.filter((c) => !isHeart(c));
      if (nonHearts.length > 0) return nonHearts;
    }
    return [...hand];
  }
  const suit = leadSuit(trick);
  const following = hand.filter((c) => suitOf(c) === suit);
  if (following.length > 0) return following;
  // 따라 낼 무늬가 없으면 아무 카드나. 단 첫 턴에는 점수 카드를 못 낸다(그것뿐이면 예외).
  if (first && !rules.firstTrickPoints) {
    const safe = hand.filter((c) => !isPenaltyCard(c));
    if (safe.length > 0) return safe;
  }
  return [...hand];
}

export function decisionFor(state: MatchState, seat: number): Decision | null {
  const { round, rules } = state;
  switch (round.phase) {
    case "passing":
      return round.passes[seat] === null
        ? { kind: "pass", direction: round.direction, count: rules.passCount }
        : null;
    case "play": {
      if (round.trick === null) return null;
      if (awaitingOpening(round)) {
        if (!(round.hands[seat] ?? []).includes(TWO_OF_CLUBS)) return null;
      } else if (round.turn !== seat) return null;
      return {
        kind: "play",
        cards: playableCards(
          rules,
          round.hands[seat] ?? [],
          round.trick,
          round.trickIndex,
          round.heartsBroken,
        ),
        leading: round.trick.plays.length === 0,
      };
    }
    case "roundEnd":
      return round.continued[seat] ? null : { kind: "continue" };
    case "gameOver":
      return null;
  }
}

/** 지금 결정해야 하는 자리들. 카드 넘기기와 판 끝은 여럿이 함께 정한다 */
export function pendingSeats(state: MatchState): number[] {
  return state.players.filter((s) => decisionFor(state, s) !== null);
}

function clone(state: MatchState): MatchState {
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

function scoreRound(state: MatchState, events: GameEvent[]): void {
  const { round, rules } = state;
  const points = round.taken.map((cards) => pointsOf(cards, rules));
  // 문 슛: 하트 13장과 ♠Q를 한 사람이 모두 먹었다.
  const shooter = round.taken.findIndex(
    (cards) =>
      cards.filter(isHeart).length === 13 && cards.includes(QUEEN_OF_SPADES),
  );
  let moonShooter: number | null = null;
  if (shooter >= 0 && rules.moon !== "off") {
    moonShooter = shooter;
    const bonus = (points[shooter] ?? 0) - 26; // ◆J 같은 나머지 점수
    for (let s = 0; s < points.length; s++) {
      if (rules.moon === "others")
        points[s] = s === shooter ? bonus : (points[s] ?? 0) + 26;
      else if (s === shooter) points[s] = bonus - 26;
    }
  }
  round.roundPoints = points;
  round.moonShooter = moonShooter;
  state.scores = state.scores.map((sc, s) => sc + (points[s] ?? 0));
  state.history.push(points);
  events.push({
    type: "roundScored",
    points,
    moonShooter,
    scores: [...state.scores],
  });
  if (state.scores.some((sc) => sc >= rules.endScore)) {
    round.phase = "gameOver";
    const low = Math.min(...state.scores);
    const winners = state.players.filter((s) => state.scores[s] === low);
    events.push({ type: "gameOver", winners });
  } else {
    round.phase = "roundEnd";
  }
  round.turn = null;
}

export function step(
  current: MatchState,
  seat: number,
  action: Action,
): StepResult {
  if (action.type === "retire") {
    if (current.round.phase === "gameOver") return fail("이미 끝난 게임이다");
    const state = clone(current);
    state.round.phase = "gameOver";
    state.round.turn = null;
    const low = Math.min(...state.scores);
    const winners = state.players.filter((s) => state.scores[s] === low);
    return {
      ok: true,
      state,
      events: [{ type: "gameOver", winners, retired: true }],
    };
  }
  const decision = decisionFor(current, seat);
  if (decision === null) return fail("지금은 차례가 아니다");
  const state = clone(current);
  const { round, rules } = state;
  const events: GameEvent[] = [];

  switch (action.type) {
    case "pass": {
      if (decision.kind !== "pass") return fail("카드를 넘길 때가 아니다");
      const hand = round.hands[seat] ?? [];
      const cards = action.cards;
      if (
        !Array.isArray(cards) ||
        cards.length !== decision.count ||
        new Set(cards).size !== cards.length ||
        !cards.every((c) => hand.includes(c))
      )
        return fail(`손에 있는 카드 ${decision.count}장을 골라야 한다`);
      round.passes[seat] = [...cards];
      events.push({ type: "passChosen", seat });
      if (round.passes.every((p) => p !== null)) {
        // 모두 골랐으면 한꺼번에 넘긴다.
        const passes = round.passes as Card[][];
        round.hands = round.hands.map((h, s) =>
          h.filter((c) => !passes[s]?.includes(c)),
        );
        for (let s = 0; s < PLAYER_COUNT; s++) {
          const to = passTarget(s, round.direction);
          const given = passes[s] ?? [];
          round.hands[to] = [...(round.hands[to] ?? []), ...given];
          round.received[to] = [...given];
        }
        events.push({ type: "passed", direction: round.direction });
        startPlay(round);
      }
      break;
    }

    case "play": {
      if (decision.kind !== "play" || round.trick === null)
        return fail("카드를 낼 차례가 아니다");
      const { card } = action;
      if (!decision.cards.includes(card)) return fail("지금 낼 수 없는 카드다");
      const hand = round.hands[seat] ?? [];
      const slot =
        Number.isInteger(action.slot) &&
        (action.slot as number) >= 0 &&
        (action.slot as number) < hand.length
          ? (action.slot as number)
          : null;
      if (round.trick.plays.length === 0 && round.trick.leader < 0)
        round.trick.leader = seat;
      round.hands[seat] = hand.filter((c) => c !== card);
      round.trick.plays.push({ seat, card });
      events.push({ type: "played", seat, card, slot });
      if (
        !round.heartsBroken &&
        (isHeart(card) || (rules.queenBreaksHearts && card === QUEEN_OF_SPADES))
      ) {
        round.heartsBroken = true;
        events.push({ type: "heartsBroken" });
      }
      if (round.trick.plays.length < PLAYER_COUNT) {
        round.turn = nextSeat(seat);
        break;
      }
      // 턴 마무리
      const trick = round.trick;
      const winner = trickWinner(trick);
      const cards = trick.plays.map((p) => p.card);
      round.taken[winner] = [...(round.taken[winner] ?? []), ...cards];
      round.tricks.push({ ...trick, winner });
      events.push({
        type: "trickWon",
        seat: winner,
        trickIndex: round.trickIndex,
        points: pointsOf(cards, rules),
      });
      if (round.trickIndex >= HAND_SIZE - 1) {
        round.trick = null;
        scoreRound(state, events);
        break;
      }
      round.trickIndex++;
      round.trick = { leader: winner, plays: [] };
      round.turn = winner;
      break;
    }

    case "continue": {
      if (decision.kind !== "continue") return fail("판이 끝나지 않았다");
      round.continued[seat] = true;
      if (round.continued.every(Boolean)) {
        state.roundNumber++;
        const next = newRound(state, state.roundNumber);
        state.round = next.round;
        events.push(...next.events);
      }
      break;
    }

    default:
      return fail("알 수 없는 행동");
  }
  return { ok: true, state, events };
}
