import type { Card } from "@mighty/engine";

import { pointsOf } from "./cards";
import { decisionFor } from "./match";
import type { HeartsRules } from "./rules";
import type {
  CompletedTrick,
  Decision,
  MatchState,
  PassDirection,
  Phase,
  Trick,
} from "./state";

/** 한 자리에서 보이는 것. 남의 손패와 남이 고른 넘길 카드는 없다 */
export interface PlayerView {
  seat: number;
  rules: HeartsRules;
  players: number[];
  roundNumber: number;
  phase: Phase;
  direction: PassDirection;
  hand: Card[];
  handCounts: number[];
  /** 내가 고른 넘길 카드(아직 넘기기 전) */
  myPass: Card[] | null;
  /** 넘기기를 마친 자리 */
  passReady: boolean[];
  /** 이번 판에 받은 카드 */
  received: Card[];
  trickIndex: number;
  trick: Trick | null;
  tricks: CompletedTrick[];
  /** 자리마다 이번 판에 먹은 점수(먹은 카드는 모두 앞에서 나왔으니 다 아는 정보다) */
  takenPoints: number[];
  heartsBroken: boolean;
  turn: number | null;
  scores: number[];
  history: number[][];
  roundPoints: number[] | null;
  moonShooter: number | null;
  decision: Decision | null;
}

export function viewOf(state: MatchState, seat: number): PlayerView {
  const { round, rules } = state;
  return {
    seat,
    rules,
    players: [...state.players],
    roundNumber: state.roundNumber,
    phase: round.phase,
    direction: round.direction,
    hand: [...(round.hands[seat] ?? [])],
    handCounts: round.hands.map((h) => h.length),
    myPass: round.passes[seat] ? [...(round.passes[seat] ?? [])] : null,
    passReady: round.passes.map((p) => p !== null),
    received: [...(round.received[seat] ?? [])],
    trickIndex: round.trickIndex,
    trick: round.trick
      ? { ...round.trick, plays: [...round.trick.plays] }
      : null,
    tricks: round.tricks.map((t) => ({ ...t, plays: [...t.plays] })),
    takenPoints: round.taken.map((cards) => pointsOf(cards, rules)),
    heartsBroken: round.heartsBroken,
    turn: round.turn,
    scores: [...state.scores],
    history: state.history.map((r) => [...r]),
    roundPoints: round.roundPoints ? [...round.roundPoints] : null,
    moonShooter: round.moonShooter,
    decision: decisionFor(state, seat),
  };
}
