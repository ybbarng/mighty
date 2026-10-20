import type { Goal } from "./goal";
import { type RuleSet, runScore } from "./rules";

export interface ScoreInput {
  rules: RuleSet;
  goal: Goal;
  /** 이번 판에 참가한 자리. 6·7마에서 죽은 사람은 빠진다 */
  players: readonly number[];
  declarer: number;
  /** 프렌드 자리. 노프렌드면 `null` */
  friend: number | null;
  /** 처음부터 노프렌드를 선언했는가. 노프렌드 2배는 이때만 붙는다 */
  noFriendDeclared: boolean;
  /** 자리별 이번 판에 딴 점수 카드 장수 */
  scoredBySeat: readonly number[];
  /** 주공이 버린 카드 속 점수 카드 장수 */
  discardedPoints: number;
  /** 자리별 판 시작 때의 돈 */
  money: readonly number[];
}

export type ScoreMultiplier = "run" | "reverseRun" | "noKiruda" | "noFriend";

export interface ScoreResult {
  rulingWon: boolean;
  rulingPoints: number;
  oppositionPoints: number;
  /** 배수를 곱하기 전 기본 이동량 */
  base: number;
  /** 런 고정액이 적용되었는가 */
  staticRun: boolean;
  multipliers: ScoreMultiplier[];
  /** 야당 한 사람이 내거나 받는 양 */
  moved: number;
  /** 자리별 판이 끝난 뒤의 돈 */
  money: number[];
}

/** C++ 정수 나눗셈처럼 0 쪽으로 버린다. 원작과 같은 값을 내기 위해 쓴다. */
function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

function baseAmount(
  rules: RuleSet,
  goal: Goal,
  rulingPoints: number,
  won: boolean,
): number {
  const m = goal.score;
  let b = rules.minGoal;
  // 노기루다로 1 적게 부를 수 있는 경우 기본을 1 줄인다.
  if (
    goal.kiruda === "NT" &&
    ((rules.noKirudaAdvantage && m === b) || rules.noKirudaAlways)
  ) {
    b--;
  }
  const s = rulingPoints;
  if (won) {
    switch (rules.winScoring) {
      case "risk20":
        return (m - b) * 2 + (s - m);
      case "risk40":
        return idiv((m - b) * 3, 2) + (s - m);
      case "call":
        return (m - b + 1) * 2;
      case "eyeForEye":
        return s - m;
      case "modifiedEyeForEye":
        return s - m + 1;
      case "base10":
        return s - 10;
      case "base13":
        return s - 13;
      case "baseMin":
        return s - b;
    }
  }
  switch (rules.loseScoring) {
    case "eyeForEye":
      return m - s;
    case "toothForTooth":
      return s >= b ? m - s : m - b + (b - s) * 2;
  }
}

/** 판의 점수 계산과 돈 분배 (MFSM.cpp). */
export function scoreRound(input: ScoreInput): ScoreResult {
  const { rules, goal, players, declarer, friend } = input;
  const seatCount = players.length;
  const hasFriend = rules.friend && friend !== null;
  const isRuling = (seat: number) =>
    seat === declarer || (hasFriend && seat === friend);

  let rulingPoints = 0;
  let oppositionPoints = 0;
  input.scoredBySeat.forEach((points, seat) => {
    if (isRuling(seat)) rulingPoints += points;
    else oppositionPoints += points;
  });
  if (rules.discardedPointsToOpposition)
    oppositionPoints += input.discardedPoints;
  else if (rules.playerCount !== 2) rulingPoints += input.discardedPoints;

  const run = runScore(rules);
  const rulingWon = rulingPoints >= Math.min(goal.score, run);

  const base = baseAmount(rules, goal, rulingPoints, rulingWon);
  let moved = Math.max(0, base);
  const multipliers: ScoreMultiplier[] = [];
  let staticRun = false;

  if (rulingWon && rulingPoints >= run) {
    if (rules.staticRun) {
      moved = 20;
      staticRun = true;
    } else if (rules.doubleForDeclaredRunOnly) {
      if (goal.score >= run) {
        moved *= 2;
        multipliers.push("run");
      }
    } else if (rules.doubleForRun) {
      moved *= 2;
      multipliers.push("run");
    }
  }
  if (!rulingWon && rules.doubleForReverseRun) {
    const threshold =
      rules.reverseRunCondition === "goal"
        ? goal.score
        : rules.reverseRunCondition === "eleven"
          ? 11
          : rules.minGoal;
    if (oppositionPoints >= threshold) {
      moved *= 2;
      multipliers.push("reverseRun");
    }
  }
  if (rules.doubleForNoKiruda && rulingWon && goal.kiruda === "NT") {
    moved *= 2;
    multipliers.push("noKiruda");
  }
  if (
    rules.doubleForNoFriend &&
    rules.friend &&
    rulingWon &&
    input.noFriendDeclared
  ) {
    moved *= 2;
    multipliers.push("noFriend");
  }

  const money = [...input.money];
  let pool = 0;
  for (const seat of players) {
    if (isRuling(seat)) continue;
    money[seat] = (money[seat] ?? 0) + (rulingWon ? -moved : moved);
    pool += rulingWon ? moved : -moved;
  }

  // 야당 몫을 주공과 프렌드가 나눈다. 5마면 주공 2 : 프렌드 1.
  let declarerShare: number;
  let friendShare: number;
  if (!hasFriend) {
    declarerShare = seatCount - 1;
    friendShare = 0;
  } else if (seatCount - 2 < 2) {
    declarerShare = 1;
    friendShare = 1;
  } else {
    declarerShare = seatCount - 3;
    friendShare = 1;
  }
  const declarerGain = idiv(pool * declarerShare, declarerShare + friendShare);
  money[declarer] = (money[declarer] ?? 0) + declarerGain;
  pool -= declarerGain;
  if (hasFriend && friend !== null) {
    money[friend] = (money[friend] ?? 0) + pool;
    pool = 0;
  }

  // 0 밑으로 내려간 돈을 메운다. 여당 승이면 주공이 덜 받고, 야당 승이면 야당이 나눠 덜 받는다.
  let shortfall = 0;
  for (const seat of players) {
    const value = money[seat] ?? 0;
    if (value < 0) {
      shortfall += value;
      money[seat] = 0;
    }
  }
  if (shortfall < 0) {
    if (rulingWon) {
      money[declarer] = (money[declarer] ?? 0) + shortfall;
    } else {
      let remaining = seatCount - 1 - (hasFriend ? 1 : 0);
      const share = idiv(shortfall, remaining);
      for (const seat of players) {
        if (isRuling(seat)) continue;
        remaining--;
        if (remaining > 0) {
          money[seat] = (money[seat] ?? 0) + share;
          shortfall -= share;
        } else {
          money[seat] = (money[seat] ?? 0) + shortfall;
          shortfall = 0;
        }
      }
    }
  }

  return {
    rulingWon,
    rulingPoints,
    oppositionPoints,
    base,
    staticRun,
    multipliers,
    moved,
    money,
  };
}
