import type { Card } from "./cards";

/** 여당 승리 때 기본 이동량 계산 방식. 목=공약, 기=최소 공약, 득=여당 득점. */
export type WinScoring =
  /** 위험보상 2.0 `(목-기)×2+(득-목)` — 원작 `bS_Use20` */
  | "risk20"
  /** 위험보상 4.0 `(목-기)×1.5+(득-목)` — `bS_Use40` */
  | "risk40"
  /** 부르는 게 값 `(목-기+1)×2` — `bS_Call` */
  | "call"
  /** 눈에는 눈 `득-목` — `bS_Efe` */
  | "eyeForEye"
  /** 수정된 눈에는 눈 `득-목+1` — `bS_MEfe` */
  | "modifiedEyeForEye"
  /** `득-10` — `bS_Base10` */
  | "base10"
  /** `득-13` — `bS_Base13` */
  | "base13"
  /** `득-기` — `bS_BaseM` */
  | "baseMin";

/** 야당 승리 때 기본 이동량 계산 방식. */
export type LoseScoring =
  /** `목-득` — `bSS_Efe` */
  | "eyeForEye"
  /** 득이 기 이상이면 `목-득`, 아니면 `(목-기)+(기-득)×2` — `bSS_Tft` */
  | "toothForTooth";

/** 백런으로 치는 조건. */
export type ReverseRunCondition =
  /** 야당이 공약 수 이상 — `bS_AGoalReverse` */
  | "goal"
  /** 야당이 11장 이상 — `bS_A11Reverse` */
  | "eleven"
  /** 야당이 최소 공약 이상 — `bS_AMReverse` */
  | "minGoal";

export interface DealMissRules {
  /** 점수 카드 0장 — `bDM_NoPoint` */
  noPoint: boolean;
  /** `noPoint`의 기준을 1장 이하로 넓힌다 — `bDM_OnlyOne` */
  oneOrLess: boolean;
  /** 모두 점수 카드 — `bDM_AllPoint` */
  allPoint: boolean;
  /** 조커는 점수 카드 1장을 상쇄한다 — `bDM_JokerIsReversePoint` */
  jokerCountsMinusOne: boolean;
  /** 마이티는 점수 카드로 세지 않는다 — `bDM_OnlyMighty` */
  mightyCountsZero: boolean;
  /** 점수 카드가 10 한 장뿐 — `bDM_Only10` */
  only10: boolean;
  /** 점수 카드가 애꾸눈 J(♥J·♠J) 한 장뿐 — `bDM_OneEyedJack` */
  oneEyedJack: boolean;
  /** 조커·마이티 상쇄 뒤에도 10·애꾸눈 J 조건을 다시 본다 — `bDM_Duplicate` */
  duplicate: boolean;
}

/**
 * 규칙 옵션. 원작 Mighty Network의 `CRule`(Rule.h) 59개 항목을 그대로 따른다.
 * 각 항목 주석의 `b…`/`n…`이 원작 이름이다.
 */
export interface RuleSet {
  /** 인원 2~7 — `nPlayerNum` */
  playerCount: number;
  /** 최소 공약 — `nMinScore` */
  minGoal: number;
  /** 마이티 — `nMighty` */
  mighty: Card;
  /** 기루다가 마이티 무늬일 때의 마이티 — `nAlterMighty` */
  alterMighty: Card;
  /** 조커콜 — `nJokercall` */
  jokerCall: Card;
  /** 기루다가 조커콜 무늬일 때의 조커콜 — `nAlterJokercall` */
  alterJokerCall: Card;

  // 진행
  /** 딴 점수 카드를 뒤집어 둔다 — `bHideScore` */
  hideScoredCards: boolean;
  /** 프렌드 제도 — `bFriend` */
  friend: boolean;
  /** 조커 프렌드 허용 — `bJokerFriend` */
  jokerFriend: boolean;
  /** 프렌드가 처음 득점할 때 정체를 밝힌다 — `bShowFriend` */
  revealFriendOnScore: boolean;
  /** 주공이 버린 카드의 점수를 야당 득점으로 친다 — `bAttScoreThrownPoints` */
  discardedPointsToOpposition: boolean;
  /** 전판 프렌드가 다음 판 선이 된다 — `bFriendGetsBeginer` */
  friendLeadsNextRound: boolean;
  /** 판마다 자리를 섞는다 — `bRandomSeat` */
  randomSeat: boolean;

  // 공약
  /** 20을 넘겨 25까지 부를 수 있다 — `bHighScore` */
  highGoal: boolean;
  /** 첫 공약자가 포기할 수 있다 — `bBeginerPass` */
  firstBidderMayPass: boolean;
  /** 당선 후 기루다를 바꾸면 +2 (끄면 +1) — `bRaise2ForKirudaChange` */
  raise2ForKirudaChange: boolean;
  /** 포기한 사람이 다시 부를 수 있다 — `bPassAgain` */
  passAgain: boolean;
  /** 노기루다는 최소 공약보다 1 적게 부를 수 있다 — `bNoKirudaAdvantage` */
  noKirudaAdvantage: boolean;
  /** 노기루다는 늘 1 적게 친다 — `bNoKirudaAlways` */
  noKirudaAlways: boolean;

  // 카드 제약과 효력
  /** 첫 트릭에 마이티를 낼 수 있다 — `bInitMighty` */
  mightyInFirstTrick: boolean;
  /** 첫 트릭 마이티 효력 — `bInitMightyEffect` */
  mightyEffectInFirstTrick: boolean;
  /** 막 트릭에 마이티를 낼 수 있다 — `bLastMighty` */
  mightyInLastTrick: boolean;
  /** 막 트릭 마이티 효력 — `bLastMightyEffect` */
  mightyEffectInLastTrick: boolean;
  /** 조커콜을 당했을 때 조커 대신 마이티를 낼 수 있다 — `bOverrideMighty` */
  mightyOverridesJokerCall: boolean;
  /** 첫 트릭에 조커를 낼 수 있다 — `bInitJoker` */
  jokerInFirstTrick: boolean;
  /** 첫 트릭 조커 효력 — `bInitJokerEffect` */
  jokerEffectInFirstTrick: boolean;
  /** 막 트릭에 조커를 낼 수 있다 — `bLastJoker` */
  jokerInLastTrick: boolean;
  /** 막 트릭 조커 효력 — `bLastJokerEffect` */
  jokerEffectInLastTrick: boolean;
  /** 첫 트릭에 선이 아닌 사람이 기루다를 낼 수 있다 — `bInitKiruda` */
  kirudaInFirstTrick: boolean;
  /** 첫 트릭에 선도 기루다를 낼 수 있다 — `bInitBeginKiruda` */
  leaderKirudaInFirstTrick: boolean;
  /** 첫 트릭 조커콜 효력 — `bInitJokercallEffect` */
  jokerCallEffectInFirstTrick: boolean;
  /** 조커콜로 끌려 나온 조커도 효력이 있다 — `bJokercallJokerEffect` */
  calledJokerKeepsEffect: boolean;

  dealMiss: DealMissRules;

  // 점수
  winScoring: WinScoring;
  loseScoring: LoseScoring;
  /** 런 2배 — `bS_DoubleForRun` */
  doubleForRun: boolean;
  /** 20을 선언한 런만 2배 — `bS_DoubleForDeclaredRun` */
  doubleForDeclaredRunOnly: boolean;
  /** 런은 고정 20 — `bS_StaticRun` */
  staticRun: boolean;
  /** 백런 2배 — `bS_DoubleForReverseRun` */
  doubleForReverseRun: boolean;
  reverseRunCondition: ReverseRunCondition;
  /** 노기루다 승리 2배 — `bS_DoubleForNoKiruda` */
  doubleForNoKiruda: boolean;
  /** 노프렌드 승리 2배 — `bS_DoubleForNoFriend` */
  doubleForNoFriend: boolean;
}

/** 공약 상한. 2마는 13, 그 외 20(`highGoal`이면 25). */
export function maxGoal(rules: RuleSet): number {
  if (rules.playerCount === 2) return Math.max(13, rules.minGoal);
  return rules.highGoal ? 25 : 20;
}

/** 런으로 치는 득점. 2마는 13, 그 외 20. */
export function runScore(rules: RuleSet): number {
  return rules.playerCount === 2 ? 13 : 20;
}
