import { type Card, countPoints, isJoker, SUITS } from "./cards";
import { decisionFor, sameFriend, trickCards, trickContext } from "./decision";
import { deckFor, handSizeFor } from "./deck";
import { createRng, shuffleInPlace } from "./rng";
import { type RuleSet, runScore } from "./rules";
import { scoreRound } from "./scoring";
import type {
  Action,
  GameEvent,
  MatchState,
  PresetDeal,
  RoundState,
  SeatRecord,
} from "./state";
import { lastTrickIndex, trickWinnerIndex } from "./trick";

/** 원작 `BASE_MONEY`: 한 사람당 시작 돈. */
export const STARTING_MONEY = 100;

export interface CreateMatchOptions {
  rules: RuleSet;
  seed: number;
  /** 첫 판의 선. 기본은 0번 */
  firstBeginner?: number;
  /** 첫 판을 정해진 패로 시작한다(튜토리얼) */
  presetDeal?: PresetDeal;
}

export type StepResult =
  | { ok: true; state: MatchState; events: GameEvent[] }
  | { ok: false; error: string };

function emptyRecord(): SeatRecord {
  return {
    declarerWins: 0,
    declarerLosses: 0,
    friendWins: 0,
    friendLosses: 0,
    oppositionWins: 0,
    oppositionLosses: 0,
  };
}

function filled<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}

function emptyRound(
  seatCount: number,
  beginner: number,
  players: number[],
): RoundState {
  return {
    phase: "election",
    beginner,
    players,
    turn: beginner,
    hands: filled(seatCount, () => []),
    deck: [],
    pickOffer: null,
    pickCount: 0,
    election: {
      goal: null,
      bidder: null,
      passed: filled(seatCount, () => false),
      log: [],
    },
    declarer: null,
    electedGoal: null,
    goal: null,
    kill: { failed: [], dead: [], remaining: 0 },
    discarded: [],
    friendDeclaration: null,
    friend: null,
    friendRevealed: false,
    trickIndex: 0,
    trick: null,
    tricks: [],
    jokerUsed: false,
    pointPiles: filled(seatCount, () => []),
    history: {
      scored: filled(seatCount, () => 0),
      assist: filled(seatCount, () => 0),
      lost: filled(seatCount, () => 0),
      share: filled(seatCount, () => 0),
    },
    result: null,
    continued: filled(seatCount, () => false),
  };
}

function nextSeat(round: RoundState, seat: number): number {
  const i = round.players.indexOf(seat);
  return round.players[(i + 1) % round.players.length] as number;
}

/** `start`부터 차례 순서로 한 바퀴. */
function seatsFrom(round: RoundState, start: number): number[] {
  const i = round.players.indexOf(start);
  return [...round.players.slice(i), ...round.players.slice(0, i)];
}

function handOf(round: RoundState, seat: number): Card[] {
  const hand = round.hands[seat];
  if (hand === undefined) throw new Error(`없는 자리: ${seat}`);
  return hand;
}

function startRound(
  state: MatchState,
  beginner: number,
  events: GameEvent[],
): void {
  const { rules } = state;
  const seatCount = rules.playerCount;
  state.roundNumber++;
  if (rules.randomSeat) {
    // 원작처럼 0번 자리는 두고 나머지만 섞는다.
    state.order = [
      0,
      ...shuffleInPlace(
        state.rng,
        state.order.filter((s) => s !== 0),
      ),
    ];
  }
  const round = emptyRound(seatCount, beginner, [...state.order]);
  state.round = round;
  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    beginner,
  });

  const preset = state.presetDeal;
  state.presetDeal = null;
  if (preset) {
    round.hands = preset.hands.map((h) => [...h]);
    round.deck = [...preset.kitty];
    events.push({
      type: "dealt",
      handSize: round.hands[beginner]?.length ?? 0,
    });
    return;
  }

  round.deck = shuffleInPlace(state.rng, deckFor(rules));
  if (seatCount === 2) {
    round.phase = "pick";
    offerPick(round);
    return;
  }
  const handSize = handSizeFor(seatCount);
  for (let i = 0; i < handSize; i++) {
    for (const seat of seatsFrom(round, beginner))
      handOf(round, seat).push(round.deck.pop() as Card);
  }
  events.push({ type: "dealt", handSize });
}

/** 2마: 덱 맨 뒤 두 장을 차례인 사람에게 보여 준다. 26번 고르면 바닥 카드 1장이 남는다. */
function offerPick(round: RoundState): void {
  const faceUp = round.deck.pop() as Card;
  const faceDown = round.deck.pop() as Card;
  round.pickOffer = [faceUp, faceDown];
}

function elect(state: MatchState, seat: number, events: GameEvent[]): void {
  const { round } = state;
  const goal = round.election.goal;
  if (goal === null) throw new Error("공약 없이 당선할 수 없다");
  round.declarer = seat;
  round.electedGoal = goal;
  round.goal = goal;
  round.beginner = seat;
  round.turn = seat;
  events.push({ type: "elected", seat, goal });
  if (round.players.length > 5) {
    round.phase = "kill";
    round.kill.remaining = round.players.length - 5;
  } else {
    giveKitty(round, seat, events);
  }
}

function giveKitty(
  round: RoundState,
  declarer: number,
  events: GameEvent[],
): void {
  const count = round.deck.length;
  handOf(round, declarer).push(...round.deck);
  round.deck = [];
  round.phase = "exchange";
  round.turn = declarer;
  events.push({ type: "kittyTaken", seat: declarer, count });
}

function startPlay(round: RoundState): void {
  const leader = round.declarer as number;
  round.phase = "play";
  round.trickIndex = 0;
  round.trick = { leader, plays: [], jokerSuit: null, jokerCalled: false };
  round.turn = leader;
}

function isRuling(round: RoundState, seat: number): boolean {
  return seat === round.declarer || seat === round.friend;
}

function revealFriend(round: RoundState, events: GameEvent[]): void {
  round.friendRevealed = true;
  if (round.friend !== null) round.pointPiles[round.friend] = [];
  events.push({ type: "friendRevealed", seat: round.friend });
}

function finishTrick(state: MatchState, events: GameEvent[]): void {
  const { rules, round } = state;
  const trick = round.trick;
  if (trick === null) return;
  const winnerIndex = trickWinnerIndex(trickContext(state), trickCards(round));
  const winner = (trick.plays[winnerIndex] as { seat: number }).seat;
  const cards = trick.plays.map((p) => p.card);

  if (
    round.trickIndex === 0 &&
    round.friendDeclaration?.kind === "firstTrick"
  ) {
    round.friend = winner === round.declarer ? null : winner;
    revealFriend(round, events);
  }

  const points = rules.playerCount === 2 ? 1 : countPoints(cards);
  // 프렌드가 득점하면 그 자리에서 정체를 밝힌다(`bShowFriend`). 딴 카드는 여당 몫으로 간다.
  if (
    rules.revealFriendOnScore &&
    !round.friendRevealed &&
    round.friend !== null &&
    winner === round.friend &&
    points > 0
  ) {
    revealFriend(round, events);
  }
  const { history } = round;
  history.scored[winner] = (history.scored[winner] ?? 0) + points;
  for (const { seat, card } of trick.plays) {
    if (seat === winner || countPoints([card]) === 0) continue;
    const field =
      isRuling(round, seat) === isRuling(round, winner)
        ? history.assist
        : history.lost;
    field[seat] = (field[seat] ?? 0) + 1;
  }
  history.share[trick.leader] = (history.share[trick.leader] ?? 0) + 10;

  const shownAsRuling =
    winner === round.declarer ||
    (round.friendRevealed && winner === round.friend);
  if (!shownAsRuling) {
    const pile = round.pointPiles[winner] as Card[];
    if (rules.playerCount === 2) {
      const own = trick.plays[winnerIndex];
      if (own) pile.push(own.card);
    } else {
      pile.push(...cards.filter((c) => countPoints([c]) > 0));
    }
  }

  round.tricks.push({ ...trick, winner });
  events.push({
    type: "trickWon",
    seat: winner,
    trickIndex: round.trickIndex,
    points,
  });

  if (round.trickIndex >= lastTrickIndex(rules)) {
    finishRound(state, events);
    return;
  }
  round.trickIndex++;
  round.trick = {
    leader: winner,
    plays: [],
    jokerSuit: null,
    jokerCalled: false,
  };
  round.turn = winner;
}

function finishRound(state: MatchState, events: GameEvent[]): void {
  const { rules, round } = state;
  const goal = round.goal;
  const declarer = round.declarer;
  if (goal === null || declarer === null)
    throw new Error("공약 없이 판을 끝낼 수 없다");
  const result = scoreRound({
    rules,
    goal,
    players: round.players,
    declarer,
    friend: round.friend,
    noFriendDeclared: round.friendDeclaration?.kind === "none",
    scoredBySeat: round.history.scored,
    discardedPoints: countPoints(round.discarded),
    money: state.money,
  });
  state.money = result.money;
  for (const seat of round.players) {
    const record = state.records[seat] as SeatRecord;
    const won = isRuling(round, seat) === result.rulingWon;
    if (seat === declarer) {
      if (won) record.declarerWins++;
      else record.declarerLosses++;
    } else if (seat === round.friend) {
      if (won) record.friendWins++;
      else record.friendLosses++;
    } else if (won) record.oppositionWins++;
    else record.oppositionLosses++;
  }
  round.result = result;
  round.turn = null;
  round.trick = null;
  events.push({ type: "roundScored", result });
  if (state.money.some((m) => m <= 0)) {
    round.phase = "gameOver";
    events.push({ type: "gameOver", reason: "bankrupt" });
  } else {
    round.phase = "roundEnd";
  }
}

export function createMatch(options: CreateMatchOptions): {
  state: MatchState;
  events: GameEvent[];
} {
  const { rules } = options;
  const seatCount = rules.playerCount;
  const order = filled(seatCount, () => 0).map((_, i) => i);
  const state: MatchState = {
    rules,
    rng: createRng(options.seed),
    roundNumber: 0,
    order,
    money: filled(seatCount, () => STARTING_MONEY),
    records: filled(seatCount, emptyRecord),
    round: emptyRound(seatCount, 0, order),
    presetDeal: options.presetDeal ?? null,
  };
  const events: GameEvent[] = [];
  startRound(state, options.firstBeginner ?? 0, events);
  return { state, events };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

/** 한 자리의 행동을 적용한다. 입력 상태는 바꾸지 않는다. */
export function step(
  input: MatchState,
  seat: number,
  action: Action,
): StepResult {
  if (action.type === "retire") {
    if (input.round.phase === "gameOver") return fail("이미 끝난 게임이다");
    const state: MatchState = structuredJsonClone(input);
    state.round.phase = "gameOver";
    state.round.turn = null;
    return {
      ok: true,
      state,
      events: [{ type: "gameOver", reason: "retired" }],
    };
  }

  const decision = decisionFor(input, seat);
  if (decision === null) return fail("지금은 이 자리의 차례가 아니다");

  const state: MatchState = structuredJsonClone(input);
  const { rules, round } = state;
  const events: GameEvent[] = [];

  switch (action.type) {
    case "pick": {
      if (decision.kind !== "pick" || round.pickOffer === null)
        return fail("고를 차례가 아니다");
      if (action.index !== 0 && action.index !== 1)
        return fail("0이나 1만 고를 수 있다");
      const picked = round.pickOffer[action.index];
      handOf(round, seat).push(picked);
      round.pickOffer = null;
      round.pickCount++;
      events.push({ type: "picked", seat });
      if (round.pickCount >= 26) {
        round.phase = "election";
        round.turn = round.beginner;
        events.push({ type: "dealt", handSize: 13 });
      } else {
        round.turn = nextSeat(round, seat);
        offerPick(round);
      }
      break;
    }

    case "dealMiss": {
      if (decision.kind !== "election" || !decision.canDealMiss)
        return fail("딜미스가 아니다");
      events.push({ type: "dealMiss", seat, hand: [...handOf(round, seat)] });
      startRound(state, round.beginner, events);
      break;
    }

    case "pass": {
      if (decision.kind !== "election" || !decision.canPass)
        return fail("포기할 수 없다");
      const { election } = round;
      election.passed[seat] = true;
      election.log.push({ seat, bid: null });
      events.push({ type: "passed", seat });
      const remaining = round.players.filter((s) => !election.passed[s]);
      if (remaining.length === 0) {
        events.push({ type: "allPassed" });
        startRound(state, round.beginner, events);
      } else if (
        remaining.length === 1 &&
        election.goal !== null &&
        election.bidder !== null
      ) {
        elect(state, election.bidder, events);
      } else {
        let next = nextSeat(round, seat);
        if (!rules.passAgain)
          while (election.passed[next]) next = nextSeat(round, next);
        round.turn = next;
      }
      break;
    }

    case "bid": {
      if (decision.kind !== "election") return fail("공약할 차례가 아니다");
      const { goal } = action;
      if (
        !decision.bids.some(
          (g) => g.kiruda === goal.kiruda && g.score === goal.score,
        )
      ) {
        return fail("유효하지 않은 공약이다");
      }
      const { election } = round;
      election.goal = { ...goal };
      election.bidder = seat;
      election.log.push({ seat, bid: { ...goal } });
      if (rules.passAgain) election.passed = election.passed.map(() => false);
      events.push({ type: "bid", seat, goal: { ...goal } });
      const others = round.players.filter((s) => s !== seat);
      if (
        goal.score >= runScore(rules) ||
        (!rules.passAgain && others.every((s) => election.passed[s]))
      ) {
        elect(state, seat, events);
      } else {
        let next = nextSeat(round, seat);
        if (!rules.passAgain)
          while (election.passed[next]) next = nextSeat(round, next);
        round.turn = next;
      }
      break;
    }

    case "kill": {
      if (decision.kind !== "kill") return fail("죽일 차례가 아니다");
      if (!decision.candidates.includes(action.card))
        return fail("없는 카드다");
      const target = round.players.find(
        (s) => s !== seat && handOf(round, s).includes(action.card),
      );
      round.kill.failed.push(action.card);
      events.push({
        type: "killAttempt",
        seat,
        card: action.card,
        killed: target ?? null,
      });
      if (target === undefined) break;
      round.kill.dead.push(target);
      round.deck.push(...handOf(round, target));
      round.hands[target] = [];
      round.players = round.players.filter((s) => s !== target);
      round.kill.remaining--;
      if (round.kill.remaining > 0) break;
      if (state.presetRedeal) {
        round.deck = [...state.presetRedeal];
        delete state.presetRedeal;
      } else {
        shuffleInPlace(state.rng, round.deck);
      }
      const order = seatsFrom(round, seat);
      for (let i = 0; round.deck.length > 3; i++) {
        handOf(round, order[i % order.length] as number).push(
          round.deck.pop() as Card,
        );
      }
      events.push({ type: "redealtForDead" });
      giveKitty(round, seat, events);
      break;
    }

    case "exchange": {
      if (decision.kind !== "exchange")
        return fail("카드를 버릴 차례가 아니다");
      const { goal, discard } = action;
      if (
        !decision.goals.some(
          (g) => g.kiruda === goal.kiruda && g.score === goal.score,
        )
      ) {
        return fail("유효하지 않은 공약 변경이다");
      }
      const hand = handOf(round, seat);
      if (
        discard.length !== decision.discardCount ||
        new Set(discard).size !== discard.length ||
        !discard.every((c) => hand.includes(c))
      ) {
        return fail(
          `손에 있는 카드 ${decision.discardCount}장을 골라 버려야 한다`,
        );
      }
      round.hands[seat] = hand.filter((c) => !discard.includes(c));
      round.discarded = [...discard];
      round.goal = { ...goal };
      events.push({ type: "exchanged", seat, goal: { ...goal } });
      if (rules.friend) {
        round.phase = "friend";
      } else {
        round.friendDeclaration = { kind: "none" };
        round.friendRevealed = true;
        startPlay(round);
      }
      break;
    }

    case "friend": {
      if (decision.kind !== "friend")
        return fail("프렌드를 정할 차례가 아니다");
      const { friend } = action;
      if (!decision.options.some((o) => sameFriend(o, friend)))
        return fail("지정할 수 없는 프렌드다");
      round.friendDeclaration = friend;
      events.push({ type: "friendDeclared", friend });
      switch (friend.kind) {
        case "none":
          round.friend = null;
          round.friendRevealed = true;
          break;
        case "player":
          round.friend = friend.seat;
          revealFriend(round, events);
          break;
        case "card":
          round.friend =
            round.players.find((s) => handOf(round, s).includes(friend.card)) ??
            null;
          break;
        case "firstTrick":
          round.friend = null;
          break;
      }
      startPlay(round);
      break;
    }

    case "play": {
      if (decision.kind !== "play" || round.trick === null)
        return fail("카드를 낼 차례가 아니다");
      const { card } = action;
      if (!decision.cards.includes(card)) return fail("지금 낼 수 없는 카드다");
      const leadingJoker = decision.leading && isJoker(card);
      if (
        leadingJoker &&
        (action.jokerSuit === undefined || !SUITS.includes(action.jokerSuit))
      ) {
        return fail("선으로 조커를 내면 무늬를 정해야 한다");
      }
      const jokerCall = action.jokerCall === true;
      if (jokerCall && decision.jokerCallCard !== card)
        return fail("조커콜을 선언할 수 없다");

      const handSize = handOf(round, seat).length;
      const slot =
        Number.isInteger(action.slot) &&
        (action.slot as number) >= 0 &&
        (action.slot as number) < handSize
          ? (action.slot as number)
          : null;
      round.hands[seat] = handOf(round, seat).filter((c) => c !== card);
      round.trick.plays.push({ seat, card });
      if (leadingJoker) round.trick.jokerSuit = action.jokerSuit ?? null;
      if (decision.leading) round.trick.jokerCalled = jokerCall;
      if (isJoker(card)) round.jokerUsed = true;
      events.push({
        type: "played",
        seat,
        card,
        jokerSuit: leadingJoker ? (action.jokerSuit ?? null) : null,
        jokerCall,
        slot,
      });
      const declaration = round.friendDeclaration;
      if (
        declaration?.kind === "card" &&
        declaration.card === card &&
        !round.friendRevealed
      ) {
        revealFriend(round, events);
      }
      if (round.trick.plays.length === round.players.length)
        finishTrick(state, events);
      else round.turn = nextSeat(round, seat);
      break;
    }

    case "continue": {
      if (decision.kind !== "continue") return fail("판이 아직 끝나지 않았다");
      round.continued[seat] = true;
      if (state.order.every((s) => round.continued[s])) {
        const friend = round.friend;
        const next =
          rules.friendLeadsNextRound && friend !== null
            ? friend
            : (round.declarer ?? round.beginner);
        startRound(state, next, events);
      }
      break;
    }

    default:
      // 고친 클라이언트가 보낸 모르는 행동이 기록에 쌓이지 않게 한다.
      return fail("알 수 없는 행동");
  }

  return { ok: true, state, events };
}

/** 상태는 JSON 값만 담으므로 JSON으로 깊은 복사를 한다. React Native 같은 환경에서도 돈다. */
function structuredJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
