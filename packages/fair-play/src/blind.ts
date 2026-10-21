import {
  type Action,
  type Card,
  deckFor,
  type GameEvent,
  handSizeFor,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  type RuleSet,
  type StepResult,
  step,
} from "@mighty/engine";

/*
 * 방장 엔진이 남의 패를 모른 채 진행하기.
 *
 * 멘탈 포커로 나누면 방장 기기에는 자기 자리와 컴퓨터 자리 카드만 있다. 엔진 상태의 다른 사람 패에는
 * 카드 대신 "자리 표"(`?_12` = 12번 자리의 카드)를 넣는다. 자리 표는 무늬도 숫자도 없어서
 * 엔진이 점수 카드나 기루다로 세지 않는다. 카드를 내면 그 사람이 열쇠를 공개하고, 그때 진짜 카드가 된다.
 *
 * 엔진이 남의 패를 알아야 하는 곳은 기기가 증명을 보내 채운다(fair-host.ts).
 * - 카드 내기: 낸 사람의 열쇠로 자리 표를 연다. 규칙 확인은 아래 `blindStep`.
 * - 딜미스: 그 사람이 패 전부의 열쇠를 공개한다.
 * - 6·7마 죽이기: 그 카드를 가진 사람이 그 자리 열쇠를 공개한다.
 * - 프렌드가 점수를 딴 순간: 프렌드 카드를 가진 사람이 증명한다.
 * - 마지막 턴: 모두 남은 열쇠를 공개해 판 전체를 진짜 카드로 다시 계산한다(audit.ts).
 */

const PREFIX = "?_";

export function tokenOf(slot: number): Card {
  return `${PREFIX}${slot}` as Card;
}

/** 자리 표면 그 자리 번호, 진짜 카드면 null */
export function slotOfToken(card: string): number | null {
  if (!card.startsWith(PREFIX)) return null;
  const slot = Number(card.slice(PREFIX.length));
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

export function isToken(card: string): boolean {
  return slotOfToken(card) !== null;
}

/**
 * 판을 시작할 때 자리 표로 나누는 방법. 누구나 같은 값을 계산한다(방장이 자리를 더 가져가지 못하게).
 * 자리 번호 순서로 `handSize`장씩, 남는 자리는 바닥 카드. 선이 누구든 같다.
 */
export function tokenDeal(rules: RuleSet): {
  deal: PresetDeal;
  /** 자리 → 받는 자리 번호(바닥 카드는 −1) */
  owners: number[];
  size: number;
} {
  const size = deckFor(rules).length;
  const handSize = handSizeFor(rules.playerCount);
  const owners = Array.from({ length: size }, (_, slot) =>
    slot < handSize * rules.playerCount ? Math.floor(slot / handSize) : -1,
  );
  const hands = Array.from({ length: rules.playerCount }, (_, seat) =>
    Array.from({ length: handSize }, (_, i) => tokenOf(seat * handSize + i)),
  );
  const kitty = owners
    .map((owner, slot) => ({ owner, slot }))
    .filter((s) => s.owner < 0)
    .map((s) => tokenOf(s.slot));
  return { deal: { hands, kitty }, owners, size };
}

/**
 * 6·7마 다시 나누기: 엔진(match.ts `kill`)과 같은 순서로 새 자리들을 나눈다.
 * `deck`의 맨 뒤부터 주공부터 차례로 한 장씩, 3장이 남을 때까지. 남은 3장은 바닥 카드로 주공에게 간다.
 */
export function redealOwners(
  players: readonly number[],
  declarer: number,
  deck: readonly number[],
): Map<number, number> {
  const i = players.indexOf(declarer);
  const order = [...players.slice(i), ...players.slice(0, i)];
  const owners = new Map<number, number>();
  const rest = [...deck];
  for (let k = 0; rest.length > 3; k++)
    owners.set(rest.pop() as number, order[k % order.length] as number);
  for (const slot of rest) owners.set(slot, declarer);
  return owners;
}

/** 이번 판에서 다시 나눌 때 섞을 자리: 바닥 카드와 죽은 사람 패(엔진 순서대로) */
export function poolOf(state: MatchState, dead: number): Card[] {
  return [...state.round.deck, ...(state.round.hands[dead] ?? [])];
}

/** 손에 든 자리 표를 진짜 카드로 바꾼다. 상태는 새로 만든다 */
export function revealInHand(
  state: MatchState,
  seat: number,
  cards: ReadonlyMap<number, Card>,
): MatchState {
  const next: MatchState = JSON.parse(JSON.stringify(state));
  const swap = (c: Card) => {
    const slot = slotOfToken(c);
    return slot !== null ? (cards.get(slot) ?? c) : c;
  };
  next.round.hands[seat] = (next.round.hands[seat] ?? []).map(swap);
  return next;
}

/**
 * 자리 표를 든 사람의 행동을 엔진에 넣는다.
 * 카드 내기는 손패를 그 카드 한 장으로 보고 규칙을 확인한다. 손에 카드가 많을수록 낼 수 있는 카드는
 * 줄기만 하므로(renege.ts), 한 장이면 정직한 사람이 낸 카드는 언제나 통과한다. 남은 손패로 따지는 규칙
 * (무늬 따르기 등)은 그 카드들이 드러날 때 각 기기가 확인한다(RenegeWatch, 마지막 턴 다시 계산).
 * 프렌드 카드를 내면 그 자리가 프렌드다(방장 엔진은 그때 처음 안다).
 */
export function blindStep(
  input: MatchState,
  seat: number,
  action: Action,
  /** 이 카드가 들어 있던 자리(카드를 낼 때) */
  slot?: number,
): StepResult {
  const hand = input.round.hands[seat] ?? [];
  if (action.type !== "play" || hand.includes(action.card))
    return step(input, seat, action);
  if (slot === undefined || !hand.includes(tokenOf(slot)))
    return { ok: false, error: "그 자리의 카드가 아니다" };
  const state: MatchState = JSON.parse(JSON.stringify(input));
  const { round } = state;
  round.hands[seat] = [action.card];
  const declaration = round.friendDeclaration;
  if (
    declaration?.kind === "card" &&
    declaration.card === action.card &&
    !round.friendRevealed
  )
    round.friend = seat;
  const { slot: shown, ...rest } = action;
  const result = step(state, seat, rest);
  if (!result.ok) return result;
  result.state.round.hands[seat] = hand.filter((c) => c !== tokenOf(slot));
  // 연출용 손패 위치는 원래 손패 길이로 확인한다.
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

/** 참가자 화면: 방장이 보낸 화면의 자리 표를 내가 연 카드로 바꾼다. 모르는 자리 표가 남으면 null */
export function revealView(
  view: PlayerView,
  cards: ReadonlyMap<number, Card>,
): PlayerView | null {
  let missing = false;
  const swap = (c: Card) => {
    const slot = slotOfToken(c);
    if (slot === null) return c;
    const card = cards.get(slot);
    if (card === undefined) missing = true;
    return card ?? c;
  };
  const hand = view.hand.map(swap);
  const discarded = view.discarded ? view.discarded.map(swap) : null;
  return missing ? null : { ...view, hand, discarded };
}
