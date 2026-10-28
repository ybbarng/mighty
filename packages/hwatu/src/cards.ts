/*
 * 화투 48장(12달 × 4장). 고스톱·민화투·나이롱뽕이 함께 쓴다(docs/27).
 * 카드 번호는 달 두 자리 + 종류 글자다. 사람이 기록을 읽기 쉽게 한다.
 *   g 광, a 열끗(동물·물건), r 띠, p·q 피, d 쌍피
 * 예: "01g" 1월(송학) 광, "11d" 11월(오동) 쌍피, "09a" 9월 국진(술잔)
 */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 광·열끗·띠·피 */
export type Kind = "gwang" | "animal" | "ribbon" | "pi";

/** 띠의 색: 홍단(빨강, 글씨), 청단(파랑), 초단(풀), 비띠(어느 단에도 들지 않음) */
export type RibbonColor = "red" | "blue" | "grass" | "plain";

export interface HwatuCard {
  id: string;
  month: Month;
  kind: Kind;
  /** 띠의 색(띠만) */
  ribbon?: RibbonColor;
  /** 피 값: 피 1, 쌍피 2(피만) */
  piValue?: 1 | 2;
  /** 고도리 새(2·4·8월 열끗) */
  bird?: true;
  /** 비광(12월 광)·국진(9월 열끗, 쌍피로도 쓴다) */
  special?: "rainGwang" | "cup";
  /** 사람이 읽는 이름 */
  name: string;
}

/** 달 이름(그림) */
export const MONTH_NAMES: Record<Month, string> = {
  1: "송학",
  2: "매조",
  3: "벚꽃",
  4: "흑싸리",
  5: "난초",
  6: "모란",
  7: "홍싸리",
  8: "공산",
  9: "국화",
  10: "단풍",
  11: "오동",
  12: "비",
};

export const KIND_NAMES: Record<Kind, string> = {
  gwang: "광",
  animal: "열끗",
  ribbon: "띠",
  pi: "피",
};

export const RIBBON_NAMES: Record<RibbonColor, string> = {
  red: "홍단",
  blue: "청단",
  grass: "초단",
  plain: "띠",
};

const pad = (m: Month) => String(m).padStart(2, "0");

function gwang(month: Month, special?: "rainGwang"): HwatuCard {
  return {
    id: `${pad(month)}g`,
    month,
    kind: "gwang",
    ...(special ? { special } : {}),
    name: `${MONTH_NAMES[month]} 광`,
  };
}

function animal(
  month: Month,
  what: string,
  extra: { bird?: true; special?: "cup" } = {},
): HwatuCard {
  return {
    id: `${pad(month)}a`,
    month,
    kind: "animal",
    ...extra,
    name: `${MONTH_NAMES[month]} ${what}`,
  };
}

function ribbon(month: Month, color: RibbonColor): HwatuCard {
  return {
    id: `${pad(month)}r`,
    month,
    kind: "ribbon",
    ribbon: color,
    name: `${MONTH_NAMES[month]} ${RIBBON_NAMES[color]}`,
  };
}

function pi(month: Month, letter: "p" | "q" | "d"): HwatuCard {
  const double = letter === "d";
  return {
    id: `${pad(month)}${letter}`,
    month,
    kind: "pi",
    piValue: double ? 2 : 1,
    name: `${MONTH_NAMES[month]} ${double ? "쌍피" : "피"}`,
  };
}

/** 화투 48장, 달 순서 */
export const HWATU_DECK: readonly HwatuCard[] = [
  gwang(1),
  ribbon(1, "red"),
  pi(1, "p"),
  pi(1, "q"),
  animal(2, "꾀꼬리", { bird: true }),
  ribbon(2, "red"),
  pi(2, "p"),
  pi(2, "q"),
  gwang(3),
  ribbon(3, "red"),
  pi(3, "p"),
  pi(3, "q"),
  animal(4, "두견새", { bird: true }),
  ribbon(4, "grass"),
  pi(4, "p"),
  pi(4, "q"),
  animal(5, "다리"),
  ribbon(5, "grass"),
  pi(5, "p"),
  pi(5, "q"),
  animal(6, "나비"),
  ribbon(6, "blue"),
  pi(6, "p"),
  pi(6, "q"),
  animal(7, "멧돼지"),
  ribbon(7, "grass"),
  pi(7, "p"),
  pi(7, "q"),
  gwang(8),
  animal(8, "기러기", { bird: true }),
  pi(8, "p"),
  pi(8, "q"),
  animal(9, "국진", { special: "cup" }),
  ribbon(9, "blue"),
  pi(9, "p"),
  pi(9, "q"),
  animal(10, "사슴"),
  ribbon(10, "blue"),
  pi(10, "p"),
  pi(10, "q"),
  gwang(11),
  pi(11, "d"),
  pi(11, "p"),
  pi(11, "q"),
  gwang(12, "rainGwang"),
  animal(12, "제비"),
  ribbon(12, "plain"),
  pi(12, "d"),
];

const BY_ID = new Map(HWATU_DECK.map((c) => [c.id, c]));

/** 카드 번호로 카드를 찾는다. 없는 번호면 오류 */
export function cardOf(id: string): HwatuCard {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`없는 화투 카드: ${id}`);
  return card;
}

export function isCardId(id: string): boolean {
  return BY_ID.has(id);
}

export function monthOf(id: string): Month {
  return cardOf(id).month;
}

/** 같은 달인가(화투의 짝 맞추기) */
export function sameMonth(a: string, b: string): boolean {
  return monthOf(a) === monthOf(b);
}
