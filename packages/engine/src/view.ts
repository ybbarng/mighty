import type { Card } from "./cards";
import { type Decision, decisionFor, playDecision } from "./decision";
import { type Goal, isDealMiss } from "./goal";
import type { RuleSet } from "./rules";
import type { ScoreResult } from "./scoring";
import type {
  CompletedTrick,
  ElectionState,
  FriendDeclaration,
  MatchState,
  Phase,
  RoundHistory,
  SeatRecord,
  Trick,
} from "./state";

/**
 * 한 자리에서 보이는 정보. 화면과 AI는 이것만 받는다.
 * 남의 손패, 바닥 카드, 버린 카드(주공 제외), 공개 전 프렌드는 들어 있지 않다.
 */
export interface PlayerView {
  seat: number;
  rules: RuleSet;
  roundNumber: number;
  phase: Phase;
  order: number[];
  players: number[];
  beginner: number;
  turn: number | null;
  money: number[];
  records: SeatRecord[];
  hand: Card[];
  handCounts: number[];
  kittyCount: number;
  /** 2마: 내 차례일 때 보이는 앞면 카드 */
  pickFaceUp: Card | null;
  election: ElectionState;
  declarer: number | null;
  goal: Goal | null;
  killFailed: Card[];
  dead: number[];
  /** 주공에게만 보인다 */
  discarded: Card[] | null;
  friendDeclaration: FriendDeclaration | null;
  /** 공개된 프렌드. 카드 프렌드 본인은 공개 전에도 자기가 프렌드인 것을 안다 */
  friend: number | null;
  friendRevealed: boolean;
  trickIndex: number;
  trick: Trick | null;
  tricks: CompletedTrick[];
  jokerUsed: boolean;
  /** 득점 더미. `hideScoredCards`면 카드 대신 장수만 보인다 */
  pointPiles: Card[][] | null;
  pointCounts: number[];
  /** 판이 끝난 뒤에만 보인다 */
  history: RoundHistory | null;
  result: ScoreResult | null;
  decision: Decision | null;
}

export function viewOf(state: MatchState, seat: number): PlayerView {
  const { rules, round } = state;
  const ended = round.phase === "roundEnd" || round.phase === "gameOver";
  const knowsFriend = round.friendRevealed || round.friend === seat || ended;
  return {
    seat,
    rules,
    roundNumber: state.roundNumber,
    phase: round.phase,
    order: [...state.order],
    players: [...round.players],
    beginner: round.beginner,
    turn: round.turn,
    money: [...state.money],
    records: state.records.map((r) => ({ ...r })),
    hand: [...(round.hands[seat] ?? [])],
    handCounts: round.hands.map((h) => h.length),
    kittyCount: round.deck.length,
    pickFaceUp:
      round.turn === seat && round.pickOffer ? round.pickOffer[0] : null,
    election: {
      goal: round.election.goal,
      bidder: round.election.bidder,
      passed: [...round.election.passed],
      log: round.election.log.map((e) => ({ ...e })),
    },
    declarer: round.declarer,
    goal: round.goal,
    killFailed: [...round.kill.failed],
    dead: [...round.kill.dead],
    discarded: seat === round.declarer || ended ? [...round.discarded] : null,
    friendDeclaration: round.friendDeclaration,
    friend: knowsFriend ? round.friend : null,
    friendRevealed: round.friendRevealed,
    trickIndex: round.trickIndex,
    trick: round.trick
      ? { ...round.trick, plays: round.trick.plays.map((p) => ({ ...p })) }
      : null,
    tricks: round.tricks.map((t) => ({
      ...t,
      plays: t.plays.map((p) => ({ ...p })),
    })),
    jokerUsed: round.jokerUsed,
    pointPiles:
      rules.hideScoredCards && !ended
        ? null
        : round.pointPiles.map((p) => [...p]),
    pointCounts: round.pointPiles.map((p) => p.length),
    history: ended ? round.history : null,
    result: round.result,
    decision: decisionFor(state, seat),
  };
}

/**
 * 화면에 든 내 패로 결정을 다시 계산한다. 멘탈 포커로 하면 방장 엔진은 내 패를 모르고
 * 자리 표(packages/fair-play)로만 들고 있으므로, 내 기기가 연 진짜 카드로 화면을 고친 뒤 이것을 부른다.
 * 내 패에 따라 달라지는 것(딜미스, 프렌드로 부를 수 있는 카드, 낼 수 있는 카드)만 다시 계산한다.
 */
export function decisionFromView(view: PlayerView): Decision | null {
  const decision = view.decision;
  if (decision === null) return null;
  switch (decision.kind) {
    case "election":
      return {
        ...decision,
        canDealMiss: isDealMiss(
          view.rules,
          view.hand,
          decision.current?.kiruda ?? "NT",
        ),
      };
    case "friend": {
      const unavailable = new Set<Card>([
        ...view.hand,
        ...(view.discarded ?? []),
      ]);
      return {
        ...decision,
        options: decision.options.filter(
          (o) => o.kind !== "card" || !unavailable.has(o.card),
        ),
      };
    }
    case "play":
      return playDecision(
        {
          rules: view.rules,
          kiruda: view.goal?.kiruda ?? "NT",
          trickIndex: view.trickIndex,
        },
        view.hand,
        {
          cards: view.trick?.plays.map((p) => p.card) ?? [],
          jokerSuit: view.trick?.jokerSuit ?? null,
          jokerCalled: view.trick?.jokerCalled ?? false,
        },
        view.jokerUsed,
      );
    default:
      return decision;
  }
}
