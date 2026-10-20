import {
  type Card,
  countPoints,
  isJoker,
  type Kiruda,
  rankOf,
  suitOf,
} from "./cards";
import { maxGoal, type RuleSet } from "./rules";
import { mightyOf } from "./trick";

/** 공약: 기루다 + 여당이 가져갈 점수 카드 장수. */
export interface Goal {
  kiruda: Kiruda;
  score: number;
}

/** 이 기루다로 부를 수 있는 가장 낮은 공약. */
export function lowestGoal(rules: RuleSet, kiruda: Kiruda): number {
  return rules.noKirudaAdvantage && kiruda === "NT"
    ? rules.minGoal - 1
    : rules.minGoal;
}

function withinLimits(rules: RuleSet, goal: Goal): boolean {
  return (
    goal.score >= lowestGoal(rules, goal.kiruda) && goal.score <= maxGoal(rules)
  );
}

/**
 * 선거 중 새 공약이 유효한가 (`IsValidNewGoal`의 선거 부분, State.cpp).
 * 직전 공약보다 숫자가 커야 한다. `noKirudaAlways`면 노기루다는 1 적게 친다.
 */
export function isValidBid(
  rules: RuleSet,
  current: Goal | null,
  next: Goal,
): boolean {
  if (!withinLimits(rules, next)) return false;
  if (current === null) return true;
  let threshold = current.score;
  if (rules.noKirudaAlways) {
    if (next.kiruda === "NT") threshold--;
    // 직전이 노기 19면 기루다 20을 부를 수 있다.
    if (current.kiruda === "NT" && threshold < 19) threshold++;
  }
  return next.score > threshold;
}

/**
 * 당선 후 공약 변경이 유효한가 (`IsValidNewGoal`의 특권 부분).
 * 기루다를 바꾸면 +2(`raise2ForKirudaChange`가 꺼져 있거나 키티를 보기 전이면 +1),
 * 노기루다로 바꿀 때 `noKirudaAdvantage`면 1 덜 올린다. 기루다를 안 바꾸면 낮출 수 없다.
 */
export function isValidGoalChange(
  rules: RuleSet,
  current: Goal,
  next: Goal,
  beforeKitty: boolean,
): boolean {
  if (!withinLimits(rules, next)) return false;
  if (current.kiruda === next.kiruda) return next.score >= current.score;
  let raise = !rules.raise2ForKirudaChange || beforeKitty ? 1 : 2;
  if (rules.noKirudaAdvantage && next.kiruda === "NT") raise--;
  const max = maxGoal(rules);
  return Math.min(current.score + raise, max) <= Math.min(next.score, max);
}

function isOneEyedJack(card: Card): boolean {
  return rankOf(card) === "J" && (suitOf(card) === "H" || suitOf(card) === "S");
}

/**
 * 딜미스인가 (`IsDealMiss`, State.cpp).
 * `kiruda`는 마이티를 정하는 데 쓰는 지금의 기루다(공약이 없으면 노기루다).
 */
export function isDealMiss(
  rules: RuleSet,
  hand: readonly Card[],
  kiruda: Kiruda,
): boolean {
  const dm = rules.dealMiss;
  const hasMighty = hand.includes(mightyOf(rules, kiruda));
  const hasJoker = hand.some(isJoker);
  let points = countPoints(hand);

  const single10 = () => points === 1 && hand.some((c) => rankOf(c) === "10");
  const singleJack = () => points === 1 && hand.some(isOneEyedJack);

  if (dm.only10 && single10()) return true;
  if (dm.oneEyedJack && singleJack()) return true;

  if (dm.jokerCountsMinusOne && hasJoker) points--;
  if (dm.mightyCountsZero && hasMighty) points--;

  if (dm.duplicate) {
    if (dm.only10 && single10()) return true;
    if (dm.oneEyedJack && singleJack()) return true;
  }

  if (dm.noPoint) {
    if (dm.oneOrLess && points <= 1) return true;
    if (points <= 0) return true;
  }
  return dm.allPoint && points >= hand.length;
}
