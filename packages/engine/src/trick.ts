import {
  type Card,
  isJoker,
  type Kiruda,
  rankPower,
  type Suit,
  suitOf,
} from "./cards";
import type { RuleSet } from "./rules";

/** 이번 판의 마이티. 기루다가 마이티 무늬면 대체 마이티. */
export function mightyOf(rules: RuleSet, kiruda: Kiruda): Card {
  return suitOf(rules.mighty) === kiruda ? rules.alterMighty : rules.mighty;
}

/** 이번 판의 조커콜 카드. 기루다가 조커콜 무늬면 대체 조커콜. */
export function jokerCallOf(rules: RuleSet, kiruda: Kiruda): Card {
  return suitOf(rules.jokerCall) === kiruda
    ? rules.alterJokerCall
    : rules.jokerCall;
}

/** 마지막 트릭 번호(0부터). 2마는 13트릭, 그 외 10트릭. */
export function lastTrickIndex(rules: RuleSet): number {
  return rules.playerCount === 2 ? 12 : 9;
}

/** 트릭 판정에 필요한 판 정보. */
export interface TrickContext {
  rules: RuleSet;
  kiruda: Kiruda;
  /** 이번 트릭 번호(0부터) */
  trickIndex: number;
}

/** 진행 중인 트릭. `cards`는 낸 순서대로, 첫 장이 선이다. */
export interface TrickCards {
  cards: readonly Card[];
  /** 선이 조커를 냈을 때 지정한 무늬 */
  jokerSuit: Suit | null;
  /** 선이 조커콜 카드를 내며 조커콜을 선언했는가 */
  jokerCalled: boolean;
}

function isFirst(ctx: TrickContext): boolean {
  return ctx.trickIndex === 0;
}

function isLast(ctx: TrickContext): boolean {
  return ctx.trickIndex === lastTrickIndex(ctx.rules);
}

/** 선 무늬. 조커가 선이면 지정한 무늬. 아직 아무도 안 냈으면 `null`. */
export function leadSuitOf(trick: TrickCards): Suit | null {
  const lead = trick.cards[0];
  if (lead === undefined) return null;
  return isJoker(lead) ? trick.jokerSuit : suitOf(lead);
}

export function isMightyEffective(ctx: TrickContext): boolean {
  const { rules } = ctx;
  return !(
    (isFirst(ctx) && !rules.mightyEffectInFirstTrick) ||
    (isLast(ctx) && !rules.mightyEffectInLastTrick)
  );
}

function isJokerCallEffectiveIn(ctx: TrickContext): boolean {
  return !(isFirst(ctx) && !ctx.rules.jokerCallEffectInFirstTrick);
}

/** 선이 조커콜을 선언할 수 있는가. 이미 조커가 나왔으면 의미가 없다(`IsEffectiveJokercall`). */
export function canDeclareJokerCall(
  ctx: TrickContext,
  jokerAlreadyPlayed: boolean,
): boolean {
  return isJokerCallEffectiveIn(ctx) && !jokerAlreadyPlayed;
}

/** 이번 트릭에서 조커콜을 당했는가. */
function isJokerCalled(ctx: TrickContext, trick: TrickCards): boolean {
  const lead = trick.cards[0];
  return (
    lead !== undefined &&
    lead === jokerCallOf(ctx.rules, ctx.kiruda) &&
    trick.jokerCalled &&
    isJokerCallEffectiveIn(ctx)
  );
}

export function isJokerEffective(
  ctx: TrickContext,
  trick: TrickCards,
): boolean {
  const { rules } = ctx;
  return !(
    (isFirst(ctx) && !rules.jokerEffectInFirstTrick) ||
    (isLast(ctx) && !rules.jokerEffectInLastTrick) ||
    (isJokerCalled(ctx, trick) && !rules.calledJokerKeepsEffect)
  );
}

/** `a`가 `b`보다 세면 양수, 약하면 음수, 비교할 수 없으면 0 (`PowerComp`, Card.cpp). */
function comparePower(
  ctx: TrickContext,
  trick: TrickCards,
  a: Card,
  b: Card,
): number {
  const mighty = mightyOf(ctx.rules, ctx.kiruda);
  if (isMightyEffective(ctx)) {
    if (a === mighty) return 1;
    if (b === mighty) return -1;
  }
  if (isJokerEffective(ctx, trick)) {
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;
  } else {
    if (isJoker(a)) return -1;
    if (isJoker(b)) return 1;
  }
  const aKiruda = suitOf(a) === ctx.kiruda;
  const bKiruda = suitOf(b) === ctx.kiruda;
  if (aKiruda || bKiruda) {
    if (!aKiruda) return -1;
    if (!bKiruda) return 1;
    return rankPower(a) > rankPower(b) ? 1 : -1;
  }
  const lead = leadSuitOf(trick);
  const aLead = suitOf(a) === lead;
  const bLead = suitOf(b) === lead;
  if (!aLead && !bLead) return 0;
  if (!aLead) return -1;
  if (!bLead) return 1;
  return rankPower(a) > rankPower(b) ? 1 : -1;
}

/** 트릭을 이긴 카드의 순번(`trick.cards` 안의 위치). */
export function trickWinnerIndex(ctx: TrickContext, trick: TrickCards): number {
  let winner = 0;
  trick.cards.forEach((card, i) => {
    const best = trick.cards[winner] as Card;
    if (i > 0 && comparePower(ctx, trick, best, card) < 0) winner = i;
  });
  return winner;
}

/**
 * 손패 중 지금 낼 수 있는 카드 (`GetAvList`, Card.cpp).
 * 원작의 판정 순서를 그대로 따른다.
 */
export function playableCards(
  ctx: TrickContext,
  hand: readonly Card[],
  trick: TrickCards,
): Card[] {
  const { rules } = ctx;
  const mighty = mightyOf(rules, ctx.kiruda);
  const first = isFirst(ctx);
  const last = isLast(ctx);
  const leading = trick.cards.length === 0;
  const lead = leadSuitOf(trick);
  const hasLeadSuit =
    lead !== null && hand.some((card) => suitOf(card) === lead);

  let result: Card[] = [];
  let hasMighty = false;
  let hasJoker = false;

  for (const card of hand) {
    if (card === mighty) {
      hasMighty = true;
      if (
        !(
          (first && !rules.mightyInFirstTrick) ||
          (last && !rules.mightyInLastTrick)
        )
      ) {
        result.push(card);
      }
    } else if (isJoker(card)) {
      hasJoker = true;
      if (!leading && isJokerCalled(ctx, trick)) {
        // 조커콜을 당하면 조커만 낼 수 있다. 규칙에 따라 마이티도 된다.
        result = [card];
        hasMighty = hand.includes(mighty);
        if (rules.mightyOverridesJokerCall && hasMighty) result.push(mighty);
        break;
      }
      if (
        !(
          (first && !rules.jokerInFirstTrick) ||
          (last && !rules.jokerInLastTrick)
        )
      ) {
        result.push(card);
      }
    } else if (hasLeadSuit) {
      if (suitOf(card) === lead) result.push(card);
    } else if (suitOf(card) === ctx.kiruda) {
      const blocked =
        (first && !rules.kirudaInFirstTrick) ||
        (first && leading && !rules.leaderKirudaInFirstTrick);
      if (!blocked) result.push(card);
    } else {
      result.push(card);
    }
  }

  // 막 트릭에 마이티·조커를 낼 수 없는 규칙이면 그 전에 내게 한다.
  const lastIndex = lastTrickIndex(rules);
  const mightyStuck = hasMighty && !rules.mightyInLastTrick;
  const jokerStuck = hasJoker && !rules.jokerInLastTrick;
  if (ctx.trickIndex === lastIndex - 2 && mightyStuck && jokerStuck) {
    return [mighty, "JK"];
  }
  if (ctx.trickIndex === lastIndex - 1 && (mightyStuck || jokerStuck)) {
    return [mightyStuck ? mighty : "JK"];
  }

  // 낼 카드가 하나도 없으면(예: 첫 트릭 선인데 모두 기루다) 아무 카드나 낼 수 있다.
  return result.length === 0 ? [...hand] : result;
}
