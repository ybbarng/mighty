import type { Card } from "@mighty/engine";
import {
  type Action,
  awaitingOpening,
  createMatch,
  type GameEvent,
  HAND_SIZE,
  type HeartsRules,
  heartsDeck,
  type MatchState,
  PLAYER_COUNT,
  type PlayerView,
  playableCards,
  type StepResult,
  step,
  type Trick,
  TWO_OF_CLUBS,
} from "@mighty/hearts-engine";

import { cardText, slotOfToken, tokenOf } from "./blind";

/*
 * 하트를 멘탈 포커로. 마이티와 같은 섞기·열쇠(device.ts)를 쓰고, 하트에만 있는 것을 여기 둔다.
 * - 자리 표로 나누기: 자리 번호 순서로 13장씩
 * - 카드 넘기기: 넘기는 사람이 받는 사람에게만 그 카드 열쇠를 직접 건넨다(device.handover)
 * - 첫 선: 엔진은 차례를 비워 두고 ♣2를 가진 사람이 낸다(hearts-engine `awaitingOpening`)
 * - 무늬 안 따르기·하트 깨기 전 하트 선·첫 턴 점수 카드: 드러나는 순간 잡는다(`HeartsRenegeWatch`)
 * - 마지막 턴: 모두 열쇠를 공개하고 판 전체를 진짜 카드로 다시 계산한다(`checkHeartsReplay`)
 */

/** 하트 덱 52장(카드 번호 순서) */
export const HEARTS_DECK: readonly Card[] = heartsDeck();

/** 판을 시작할 때 자리 표로 나누는 방법: 자리 번호 순서로 13장씩. 모두가 같은 값을 계산한다 */
export function heartsTokenDeal(): { hands: Card[][]; owners: number[] } {
  const owners = Array.from({ length: HAND_SIZE * PLAYER_COUNT }, (_, slot) =>
    Math.floor(slot / HAND_SIZE),
  );
  const hands = Array.from({ length: PLAYER_COUNT }, (_, seat) =>
    Array.from({ length: HAND_SIZE }, (_, i) => tokenOf(seat * HAND_SIZE + i)),
  );
  return { hands, owners };
}

/**
 * 자리 표를 든 사람의 행동을 엔진에 넣는다. 카드 내기는 손패를 그 카드 한 장으로 보고 규칙을 확인한다
 * (손에 카드가 많을수록 낼 수 있는 카드는 줄기만 한다). 남은 손패로 따지는 규칙은 드러날 때 잡는다.
 */
export function heartsBlindStep(
  input: MatchState,
  seat: number,
  action: Action,
  slot?: number,
): StepResult {
  const hand = input.round.hands[seat] ?? [];
  if (action.type !== "play" || hand.includes(action.card))
    return step(input, seat, action);
  if (slot === undefined || !hand.includes(tokenOf(slot)))
    return { ok: false, error: "그 자리의 카드가 아니다" };
  const state: MatchState = JSON.parse(JSON.stringify(input));
  state.round.hands[seat] = [action.card];
  const { slot: shown, ...rest } = action;
  const result = step(state, seat, rest);
  if (!result.ok) return result;
  result.state.round.hands[seat] = hand.filter((c) => c !== tokenOf(slot));
  const valid =
    Number.isInteger(shown) &&
    (shown as number) >= 0 &&
    (shown as number) < hand.length
      ? (shown as number)
      : null;
  for (const e of result.events as GameEvent[])
    if (e.type === "played" && e.seat === seat) e.slot = valid;
  return result;
}

/** 화면의 자리 표를 내 카드로 바꾸고 내 패에 따라 달라지는 결정을 다시 계산한다. 못 연 자리 표가 있으면 null */
export function revealHeartsView(
  view: PlayerView,
  cards: ReadonlyMap<number, Card>,
): PlayerView | null {
  let missing = false;
  const swap = (c: Card): Card => {
    const slot = slotOfToken(c);
    if (slot === null) return c;
    const card = cards.get(slot);
    if (card === undefined) missing = true;
    return card ?? c;
  };
  const hand = view.hand.map(swap);
  const myPass = view.myPass ? view.myPass.map(swap) : null;
  const received = view.received.map(swap);
  if (missing) return null;
  const real: PlayerView = { ...view, hand, myPass, received };
  real.decision = heartsDecisionFromView(real);
  return real;
}

/** 화면 정보로 이 자리의 결정을 다시 계산한다(엔진 `decisionFor`와 같은 판단) */
export function heartsDecisionFromView(
  view: PlayerView,
): PlayerView["decision"] {
  const decision = view.decision;
  if (view.phase !== "play" || view.trick === null) return decision;
  const opening =
    view.trickIndex === 0 &&
    view.turn === null &&
    view.trick.plays.length === 0;
  if (opening)
    return view.hand.includes(TWO_OF_CLUBS)
      ? { kind: "play", cards: [TWO_OF_CLUBS], leading: true }
      : null;
  if (view.turn !== view.seat) return null;
  return {
    kind: "play",
    cards: playableCards(
      view.rules,
      view.hand,
      view.trick,
      view.trickIndex,
      view.heartsBroken,
    ),
    leading: view.trick.plays.length === 0,
  };
}

interface PastPlay {
  trickIndex: number;
  seat: number;
  card: Card;
  /** 그 카드를 내기 전 턴 */
  before: Trick;
  broken: boolean;
}

/**
 * 하트 무늬 안 따르기 감시. 카드 c가 드러나는 순간 "c는 그 전 턴에도 손에 있었다"를 안다.
 * 그 사람이 앞서 낸 카드 x가 손패 {x, c}만으로도 낼 수 없는 카드였으면 위반이다
 * (따라 내기, 하트 깨기 전 하트 선, 첫 턴 점수 카드, 첫 선 ♣2는 손에 카드가 늘어도 풀리지 않는다).
 */
export class HeartsRenegeWatch {
  private readonly plays: PastPlay[] = [];
  private readonly revealed = new Set<Card>();

  constructor(private readonly rules: HeartsRules) {}

  reveal(play: PastPlay): { seat: number; reason: string } | null {
    if (this.revealed.has(play.card))
      return {
        seat: play.seat,
        reason: `${cardText(play.card)}가 두 번 나왔다(섞기 조작)`,
      };
    this.revealed.add(play.card);
    for (const past of this.plays) {
      if (past.seat !== play.seat || past.trickIndex >= play.trickIndex)
        continue;
      const allowed = playableCards(
        this.rules,
        [past.card, play.card],
        past.before,
        past.trickIndex,
        past.broken,
      );
      if (!allowed.includes(past.card))
        return {
          seat: play.seat,
          reason: `${past.trickIndex + 1}번째 턴에 ${cardText(past.card)}를 냈는데, 그때 ${cardText(play.card)}가 손에 있었다: ${describeHearts(past)}`,
        };
    }
    this.plays.push(play);
    return null;
  }
}

function describeHearts(past: PastPlay): string {
  if (past.before.plays.length > 0)
    return "선 무늬가 있었는데 따라 내지 않았다";
  if (past.trickIndex === 0) return "첫 선은 ♣2로 해야 한다";
  return "하트가 깨지기 전에 다른 무늬가 있었는데 하트로 선을 잡았다";
}

/** 기록 속 자리 표를 진짜 카드로 바꾸고 엔진이 모르는 칸(카드 자리)을 뺀다 */
export function realHeartsAction(
  action: Action,
  cards: ReadonlyMap<number, Card>,
): Action {
  const swap = (c: Card) => {
    const slot = slotOfToken(c);
    return slot === null ? c : (cards.get(slot) ?? c);
  };
  switch (action.type) {
    case "pass":
      return { ...action, cards: action.cards.map(swap) };
    case "play": {
      const { deckSlot: _, ...rest } = action as Action & { deckSlot?: number };
      return rest as Action;
    }
    default:
      return action;
  }
}

export interface HeartsRoundDeal {
  hands: Card[][];
  cards: ReadonlyMap<number, Card>;
}

export interface HeartsLogged {
  seat: number;
  action: Action;
  bot?: true;
}

export type HeartsReplayCheck =
  | { ok: true; state: MatchState; states: MatchState[]; upTo: number }
  | { ok: false; index: number; seat: number; reason: string };

function decisive(events: readonly GameEvent[]): string {
  return JSON.stringify(
    events
      .filter(
        (e) =>
          e.type === "played" ||
          e.type === "trickWon" ||
          e.type === "heartsBroken" ||
          e.type === "passed",
      )
      .map((e) => (e.type === "played" ? { ...e, slot: null } : e)),
  );
}

/** 판마다의 실제 패로 기록을 처음부터 다시 돌린다. 아직 패를 모르는 판에 들어서면 거기서 멈춘다 */
export function checkHeartsReplay(
  rules: HeartsRules,
  seed: number,
  log: readonly HeartsLogged[],
  deals: ReadonlyMap<number, HeartsRoundDeal>,
  observed?: readonly (readonly GameEvent[])[],
): HeartsReplayCheck {
  const first = deals.get(1);
  if (!first)
    return { ok: false, index: -1, seat: 0, reason: "첫 판 패가 없다" };
  let state = createMatch({ rules, seed, presetHands: first.hands }).state;
  const states = [state];
  for (const [index, entry] of log.entries()) {
    const round = state.roundNumber;
    const current = deals.get(round);
    if (!current) return { ok: true, state, states, upTo: index };
    const nextDeal = deals.get(round + 1);
    if (nextDeal) state.presetHands = nextDeal.hands;
    else delete state.presetHands;
    const result = step(
      state,
      entry.seat,
      realHeartsAction(entry.action, current.cards),
    );
    if (!result.ok)
      return {
        ok: false,
        index,
        seat: entry.seat,
        reason: `진짜 카드로 다시 계산하니 규칙에 맞지 않는 행동이었다(${result.error})`,
      };
    if (result.state.roundNumber !== round && !nextDeal)
      return { ok: true, state, states, upTo: index };
    const seen = observed?.[index];
    if (seen && decisive(seen) !== decisive(result.events))
      return {
        ok: false,
        index,
        seat: 0,
        reason: `방장이 진행한 결과가 진짜 카드로 다시 계산한 것과 다르다(${entry.seat}번 차례)`,
      };
    delete result.state.presetHands;
    state = result.state;
    states.push(state);
  }
  return { ok: true, state, states, upTo: log.length };
}

export { awaitingOpening };
