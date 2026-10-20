import {
  type Card,
  isJoker,
  JOKER,
  RANKS,
  rankOf,
  SUITS,
  suitOf,
} from "./cards";
import type {
  LoseScoring,
  ReverseRunCondition,
  RuleSet,
  WinScoring,
} from "./rules";

/**
 * 원작 Mighty Network의 규칙 문자열(`CRule::Encode`/`Decode`, Rule.cpp)과 같은 형식.
 *
 * - 글자 하나가 `값 + 35`로 0~63을 담는다.
 * - 앞의 6글자는 정수 6개(인원, 최소 공약, 마이티, 대체 마이티, 조커콜, 대체 조커콜).
 * - 그 뒤로 bool 53개를 아래 `BOOL_FIELDS` 순서대로 한 글자에 6개씩, 낮은 비트부터 채운다.
 */
const BASE_CHAR = 35;

// 원작 순서를 그대로 지킨다. 순서를 바꾸면 원작 문자열과 호환되지 않는다.
const BOOL_FIELDS = [
  "bHideScore",
  "bFriend",
  "bJokerFriend",
  "bShowFriend",
  "bAttScoreThrownPoints",
  "bFriendGetsBeginer",
  "bHighScore",
  "bBeginerPass",
  "bRaise2ForKirudaChange",
  "bPassAgain",
  "bNoKirudaAdvantage",
  "bNoKirudaAlways",
  "bInitMighty",
  "bInitMightyEffect",
  "bLastMighty",
  "bLastMightyEffect",
  "bOverrideMighty",
  "bInitJoker",
  "bInitJokerEffect",
  "bLastJoker",
  "bLastJokerEffect",
  "bInitKiruda",
  "bInitBeginKiruda",
  "bInitJokercallEffect",
  "bJokercallJokerEffect",
  "bDM_NoPoint",
  "bDM_OnlyOne",
  "bDM_AllPoint",
  "bDM_JokerIsReversePoint",
  "bDM_OnlyMighty",
  "bDM_Only10",
  "bDM_OneEyedJack",
  "bDM_Duplicate",
  "bS_Use20",
  "bS_Use40",
  "bS_Call",
  "bS_Efe",
  "bS_MEfe",
  "bS_Base10",
  "bS_Base13",
  "bS_BaseM",
  "bSS_Efe",
  "bSS_Tft",
  "bS_DoubleForRun",
  "bS_DoubleForDeclaredRun",
  "bS_DoubleForReverseRun",
  "bS_DoubleForNoKiruda",
  "bS_DoubleForNoFriend",
  "bS_StaticRun",
  "bS_AGoalReverse",
  "bS_A11Reverse",
  "bS_AMReverse",
  "bRandomSeat",
] as const;

type BoolField = (typeof BOOL_FIELDS)[number];
type BoolMap = Record<BoolField, boolean>;

const INT_COUNT = 6;
const ENCODED_LENGTH = INT_COUNT + Math.ceil(BOOL_FIELDS.length / 6);

// 원작이 if-else로 처음 켜진 것을 고르는 순서와 같다.
const WIN_SCORING: readonly [BoolField, WinScoring][] = [
  ["bS_Use20", "risk20"],
  ["bS_Use40", "risk40"],
  ["bS_Call", "call"],
  ["bS_Efe", "eyeForEye"],
  ["bS_MEfe", "modifiedEyeForEye"],
  ["bS_Base10", "base10"],
  ["bS_Base13", "base13"],
  ["bS_BaseM", "baseMin"],
];
const LOSE_SCORING: readonly [BoolField, LoseScoring][] = [
  ["bSS_Efe", "eyeForEye"],
  ["bSS_Tft", "toothForTooth"],
];
const REVERSE_RUN: readonly [BoolField, ReverseRunCondition][] = [
  ["bS_AGoalReverse", "goal"],
  ["bS_A11Reverse", "eleven"],
  ["bS_AMReverse", "minGoal"],
];

/** 원작 카드 번호: `(무늬-1)×13 + 숫자`, 무늬 S=1 D=2 H=3 C=4, 숫자 A=1 … K=13, 조커 53. */
export function cardToLegacyNumber(card: Card): number {
  if (isJoker(card)) return 53;
  const suitIndex = SUITS.indexOf(suitOf(card));
  const rank = rankOf(card);
  const num = rank === "A" ? 1 : RANKS.indexOf(rank) + 2;
  return suitIndex * 13 + num;
}

export function legacyNumberToCard(n: number): Card | null {
  if (n === 53) return JOKER;
  if (!Number.isInteger(n) || n < 1 || n > 52) return null;
  const suit = SUITS[Math.floor((n - 1) / 13)];
  const num = ((n - 1) % 13) + 1;
  const rank = num === 1 ? "A" : RANKS[num - 2];
  if (suit === undefined || rank === undefined) return null;
  return `${suit}${rank}`;
}

function pick<T>(
  flags: BoolMap,
  table: readonly [BoolField, T][],
  fallback: T,
): T {
  return table.find(([field]) => flags[field])?.[1] ?? fallback;
}

function toFlags(rules: RuleSet): BoolMap {
  const dm = rules.dealMiss;
  const flags: BoolMap = {
    bHideScore: rules.hideScoredCards,
    bFriend: rules.friend,
    bJokerFriend: rules.jokerFriend,
    bShowFriend: rules.revealFriendOnScore,
    bAttScoreThrownPoints: rules.discardedPointsToOpposition,
    bFriendGetsBeginer: rules.friendLeadsNextRound,
    bHighScore: rules.highGoal,
    bBeginerPass: rules.firstBidderMayPass,
    bRaise2ForKirudaChange: rules.raise2ForKirudaChange,
    bPassAgain: rules.passAgain,
    bNoKirudaAdvantage: rules.noKirudaAdvantage,
    bNoKirudaAlways: rules.noKirudaAlways,
    bInitMighty: rules.mightyInFirstTrick,
    bInitMightyEffect: rules.mightyEffectInFirstTrick,
    bLastMighty: rules.mightyInLastTrick,
    bLastMightyEffect: rules.mightyEffectInLastTrick,
    bOverrideMighty: rules.mightyOverridesJokerCall,
    bInitJoker: rules.jokerInFirstTrick,
    bInitJokerEffect: rules.jokerEffectInFirstTrick,
    bLastJoker: rules.jokerInLastTrick,
    bLastJokerEffect: rules.jokerEffectInLastTrick,
    bInitKiruda: rules.kirudaInFirstTrick,
    bInitBeginKiruda: rules.leaderKirudaInFirstTrick,
    bInitJokercallEffect: rules.jokerCallEffectInFirstTrick,
    bJokercallJokerEffect: rules.calledJokerKeepsEffect,
    bDM_NoPoint: dm.noPoint,
    bDM_OnlyOne: dm.oneOrLess,
    bDM_AllPoint: dm.allPoint,
    bDM_JokerIsReversePoint: dm.jokerCountsMinusOne,
    bDM_OnlyMighty: dm.mightyCountsZero,
    bDM_Only10: dm.only10,
    bDM_OneEyedJack: dm.oneEyedJack,
    bDM_Duplicate: dm.duplicate,
    bS_Use20: false,
    bS_Use40: false,
    bS_Call: false,
    bS_Efe: false,
    bS_MEfe: false,
    bS_Base10: false,
    bS_Base13: false,
    bS_BaseM: false,
    bSS_Efe: false,
    bSS_Tft: false,
    bS_DoubleForRun: rules.doubleForRun,
    bS_DoubleForDeclaredRun: rules.doubleForDeclaredRunOnly,
    bS_DoubleForReverseRun: rules.doubleForReverseRun,
    bS_DoubleForNoKiruda: rules.doubleForNoKiruda,
    bS_DoubleForNoFriend: rules.doubleForNoFriend,
    bS_StaticRun: rules.staticRun,
    bS_AGoalReverse: false,
    bS_A11Reverse: false,
    bS_AMReverse: false,
    bRandomSeat: rules.randomSeat,
  };
  for (const [field, value] of WIN_SCORING) {
    if (value === rules.winScoring) flags[field] = true;
  }
  for (const [field, value] of LOSE_SCORING) {
    if (value === rules.loseScoring) flags[field] = true;
  }
  for (const [field, value] of REVERSE_RUN) {
    if (value === rules.reverseRunCondition) flags[field] = true;
  }
  return flags;
}

function fromFlags(
  ints: readonly Card[],
  head: readonly number[],
  f: BoolMap,
): RuleSet {
  const [mighty, alterMighty, jokerCall, alterJokerCall] = ints as [
    Card,
    Card,
    Card,
    Card,
  ];
  return {
    playerCount: head[0] as number,
    minGoal: head[1] as number,
    mighty,
    alterMighty,
    jokerCall,
    alterJokerCall,
    hideScoredCards: f.bHideScore,
    friend: f.bFriend,
    jokerFriend: f.bJokerFriend,
    revealFriendOnScore: f.bShowFriend,
    discardedPointsToOpposition: f.bAttScoreThrownPoints,
    friendLeadsNextRound: f.bFriendGetsBeginer,
    randomSeat: f.bRandomSeat,
    highGoal: f.bHighScore,
    firstBidderMayPass: f.bBeginerPass,
    raise2ForKirudaChange: f.bRaise2ForKirudaChange,
    passAgain: f.bPassAgain,
    noKirudaAdvantage: f.bNoKirudaAdvantage,
    noKirudaAlways: f.bNoKirudaAlways,
    mightyInFirstTrick: f.bInitMighty,
    mightyEffectInFirstTrick: f.bInitMightyEffect,
    mightyInLastTrick: f.bLastMighty,
    mightyEffectInLastTrick: f.bLastMightyEffect,
    mightyOverridesJokerCall: f.bOverrideMighty,
    jokerInFirstTrick: f.bInitJoker,
    jokerEffectInFirstTrick: f.bInitJokerEffect,
    jokerInLastTrick: f.bLastJoker,
    jokerEffectInLastTrick: f.bLastJokerEffect,
    kirudaInFirstTrick: f.bInitKiruda,
    leaderKirudaInFirstTrick: f.bInitBeginKiruda,
    jokerCallEffectInFirstTrick: f.bInitJokercallEffect,
    calledJokerKeepsEffect: f.bJokercallJokerEffect,
    dealMiss: {
      noPoint: f.bDM_NoPoint,
      oneOrLess: f.bDM_OnlyOne,
      allPoint: f.bDM_AllPoint,
      jokerCountsMinusOne: f.bDM_JokerIsReversePoint,
      mightyCountsZero: f.bDM_OnlyMighty,
      only10: f.bDM_Only10,
      oneEyedJack: f.bDM_OneEyedJack,
      duplicate: f.bDM_Duplicate,
    },
    winScoring: pick(f, WIN_SCORING, "risk20"),
    loseScoring: pick(f, LOSE_SCORING, "eyeForEye"),
    doubleForRun: f.bS_DoubleForRun,
    doubleForDeclaredRunOnly: f.bS_DoubleForDeclaredRun,
    staticRun: f.bS_StaticRun,
    doubleForReverseRun: f.bS_DoubleForReverseRun,
    reverseRunCondition: pick(f, REVERSE_RUN, "goal"),
    doubleForNoKiruda: f.bS_DoubleForNoKiruda,
    doubleForNoFriend: f.bS_DoubleForNoFriend,
  };
}

export function encodeRuleString(rules: RuleSet): string {
  const values = [
    rules.playerCount,
    rules.minGoal,
    cardToLegacyNumber(rules.mighty),
    cardToLegacyNumber(rules.alterMighty),
    cardToLegacyNumber(rules.jokerCall),
    cardToLegacyNumber(rules.alterJokerCall),
  ];
  const flags = toFlags(rules);
  BOOL_FIELDS.forEach((field, i) => {
    const slot = INT_COUNT + Math.floor(i / 6);
    if (flags[field]) values[slot] = (values[slot] ?? 0) | (1 << (i % 6));
    else values[slot] ??= 0;
  });
  return String.fromCharCode(...values.map((v) => v + BASE_CHAR));
}

export type DecodeResult =
  | { ok: true; rules: RuleSet }
  | { ok: false; reason: string };

export function decodeRuleString(text: string): DecodeResult {
  const trimmed = text.trim();
  if (trimmed.length !== ENCODED_LENGTH) {
    return {
      ok: false,
      reason: `규칙 문자열은 ${ENCODED_LENGTH}글자여야 한다`,
    };
  }
  const values = [...trimmed].map((ch) => ch.charCodeAt(0) - BASE_CHAR);
  if (values.some((v) => v < 0 || v > 91)) {
    return { ok: false, reason: "규칙 문자열에 쓸 수 없는 글자가 있다" };
  }
  const head = values.slice(0, 2);
  const cards = values.slice(2, INT_COUNT).map(legacyNumberToCard);
  if (cards.some((c) => c === null)) {
    return { ok: false, reason: "카드 번호가 올바르지 않다" };
  }
  const playerCount = head[0] as number;
  if (playerCount < 2 || playerCount > 7) {
    return { ok: false, reason: "인원은 2~7명이어야 한다" };
  }
  const flags = Object.fromEntries(
    BOOL_FIELDS.map((field, i) => {
      const slot = values[INT_COUNT + Math.floor(i / 6)] as number;
      return [field, (slot & (1 << (i % 6))) !== 0];
    }),
  ) as BoolMap;
  return { ok: true, rules: fromFlags(cards as Card[], head, flags) };
}
