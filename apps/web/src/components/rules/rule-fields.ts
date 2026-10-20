import type {
  DealMissRules,
  LoseScoring,
  ReverseRunCondition,
  RuleSet,
  WinScoring,
} from "@mighty/engine";

type BoolKey = {
  [K in keyof RuleSet]: RuleSet[K] extends boolean ? K : never;
}[keyof RuleSet];

export interface BoolField {
  key: BoolKey;
  label: string;
  hint?: string;
}

export interface DealMissField {
  key: keyof DealMissRules;
  label: string;
  hint?: string;
}

export interface RuleGroup {
  title: string;
  fields: BoolField[];
}

/** 켜고 끄는 옵션. 원작 옵션 창(PRule*.cpp)의 묶음을 따른다 */
export const BOOL_GROUPS: RuleGroup[] = [
  {
    title: "진행",
    fields: [
      {
        key: "friend",
        label: "프렌드 제도",
        hint: "끄면 주공 혼자 4명과 싸운다",
      },
      { key: "jokerFriend", label: "조커 프렌드 허용" },
      {
        key: "revealFriendOnScore",
        label: "프렌드가 득점하면 바로 공개",
        hint: "카드 프렌드가 점수 카드가 든 트릭을 이기면 그 자리에서 정체를 밝힌다",
      },
      {
        key: "hideScoredCards",
        label: "딴 점수 카드 숨기기",
        hint: "각자 딴 점수 카드를 장수로만 보여 준다",
      },
      {
        key: "discardedPointsToOpposition",
        label: "버린 점수 카드는 야당 몫",
        hint: "끄면 주공이 버린 점수 카드를 여당 득점으로 친다",
      },
      {
        key: "friendLeadsNextRound",
        label: "다음 판 선은 프렌드",
        hint: "끄면 주공이 다음 판 선이 된다",
      },
      { key: "randomSeat", label: "판마다 자리 섞기" },
    ],
  },
  {
    title: "공약",
    fields: [
      { key: "highGoal", label: "25까지 부르기", hint: "끄면 20이 최고" },
      { key: "firstBidderMayPass", label: "선도 포기할 수 있다" },
      { key: "passAgain", label: "포기한 사람도 다시 부를 수 있다" },
      {
        key: "raise2ForKirudaChange",
        label: "당선 후 기루다를 바꾸면 +2",
        hint: "끄면 +1",
      },
      {
        key: "noKirudaAdvantage",
        label: "노기루다는 1 적게 부를 수 있다",
        hint: "최소 공약과 기루다 바꾸기에서",
      },
      {
        key: "noKirudaAlways",
        label: "노기루다는 늘 1 적게 친다",
        hint: "스페이드 15 다음에 노기 15를 부를 수 있다",
      },
    ],
  },
  {
    title: "카드 효력",
    fields: [
      { key: "mightyInFirstTrick", label: "첫 트릭에 마이티 내기" },
      { key: "mightyEffectInFirstTrick", label: "첫 트릭 마이티 효력" },
      { key: "mightyInLastTrick", label: "막 트릭에 마이티 내기" },
      { key: "mightyEffectInLastTrick", label: "막 트릭 마이티 효력" },
      { key: "jokerInFirstTrick", label: "첫 트릭에 조커 내기" },
      { key: "jokerEffectInFirstTrick", label: "첫 트릭 조커 효력" },
      {
        key: "jokerInLastTrick",
        label: "막 트릭에 조커 내기",
        hint: "못 내면 그 전에 강제로 낸다",
      },
      { key: "jokerEffectInLastTrick", label: "막 트릭 조커 효력" },
      {
        key: "mightyOverridesJokerCall",
        label: "조커콜에 마이티로 대신 내기 (올마)",
      },
      { key: "jokerCallEffectInFirstTrick", label: "첫 트릭 조커콜 효력" },
      {
        key: "calledJokerKeepsEffect",
        label: "조커콜로 끌려 나온 조커도 효력",
      },
      {
        key: "kirudaInFirstTrick",
        label: "첫 트릭에 기루다 내기 (선이 아닌 사람)",
      },
      {
        key: "leaderKirudaInFirstTrick",
        label: "첫 트릭 선(주공)도 기루다 내기",
      },
    ],
  },
  {
    title: "점수 배수",
    fields: [
      { key: "doubleForRun", label: "런(20장) 2배" },
      { key: "doubleForDeclaredRunOnly", label: "20을 선언한 런만 2배" },
      { key: "staticRun", label: "런은 고정 20" },
      { key: "doubleForReverseRun", label: "백런 2배" },
      { key: "doubleForNoKiruda", label: "노기루다 승리 2배" },
      { key: "doubleForNoFriend", label: "노프렌드 승리 2배" },
    ],
  },
];

export const DEAL_MISS_FIELDS: DealMissField[] = [
  { key: "noPoint", label: "점수 카드 0장" },
  { key: "oneOrLess", label: "1장 이하로 넓히기" },
  { key: "only10", label: "점수 카드가 10 한 장뿐" },
  { key: "oneEyedJack", label: "점수 카드가 애꾸눈 J(♥J·♠J) 한 장뿐" },
  { key: "allPoint", label: "모두 점수 카드" },
  { key: "jokerCountsMinusOne", label: "조커는 점수 카드 1장을 상쇄" },
  { key: "mightyCountsZero", label: "마이티는 점수 카드로 세지 않음" },
  { key: "duplicate", label: "상쇄 뒤에도 10·J 조건을 다시 보기" },
];

export const WIN_SCORING: { value: WinScoring; label: string }[] = [
  { value: "risk20", label: "위험보상 2.0 — (공약−최소)×2 + (득점−공약)" },
  { value: "risk40", label: "위험보상 4.0 — (공약−최소)×1.5 + (득점−공약)" },
  { value: "call", label: "부르는 게 값 — (공약−최소+1)×2" },
  { value: "eyeForEye", label: "눈에는 눈 — 득점−공약" },
  { value: "modifiedEyeForEye", label: "수정 눈에는 눈 — 득점−공약+1" },
  { value: "base10", label: "득점−10" },
  { value: "base13", label: "득점−13" },
  { value: "baseMin", label: "득점−최소 공약" },
];

export const LOSE_SCORING: { value: LoseScoring; label: string }[] = [
  { value: "eyeForEye", label: "공약−득점" },
  {
    value: "toothForTooth",
    label: "최소 공약에 못 미치면 2배로 — (공약−최소)+(최소−득점)×2",
  },
];

export const REVERSE_RUN: { value: ReverseRunCondition; label: string }[] = [
  { value: "goal", label: "야당이 공약 장수 이상" },
  { value: "eleven", label: "야당이 11장 이상" },
  { value: "minGoal", label: "야당이 최소 공약 장수 이상" },
];
