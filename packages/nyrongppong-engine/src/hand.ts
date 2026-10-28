import { type Month, monthOf } from "@mighty/hwatu";

/*
 * 손패 계산(docs/30 1절): 카드 값은 달 숫자(1~12)다. 판이 끝나면 손에 남은 값의 합이 벌점이고, 낮을수록 좋다.
 * 같은 달 석 장 이상(자연뽕)은 합에 세지 않는다. 여섯 장이 약을 이루면 판을 끝내고 약 점수를 받는다.
 */

export type YakKind = "ttoi" | "fourPair" | "straight" | "under10" | "over60";

export interface Yak {
  kind: YakKind;
  /** 판 점수(낮을수록 좋다. 0 또는 음수) */
  value: number;
}

export const YAK_NAMES: Record<YakKind, string> = {
  ttoi: "또이또이",
  fourPair: "네 장 또이",
  straight: "줄",
  under10: "10 부족",
  over60: "60 이상",
};

export const YAK_INFO: readonly { kind: YakKind; text: string }[] = [
  { kind: "under10", text: "여섯 장 합이 10 이하: −100점" },
  { kind: "over60", text: "여섯 장 합이 60 이상: −100점" },
  { kind: "fourPair", text: "같은 달 넉 장 + 다른 달 두 장: −50점" },
  {
    kind: "straight",
    text: "여섯 달이 이어짐(예: 3·4·5·6·7·8월): 합만큼 빼기(−21~−57점)",
  },
  { kind: "ttoi", text: "두 장씩 세 쌍, 또는 석 장씩 두 쌍: 0점" },
];

export function cardValue(id: string): number {
  return monthOf(id);
}

export function handSum(ids: readonly string[]): number {
  return ids.reduce((n, id) => n + cardValue(id), 0);
}

/** 달별 장수 */
export function monthCounts(ids: readonly string[]): Map<Month, number> {
  const counts = new Map<Month, number>();
  for (const id of ids) {
    const m = monthOf(id);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return counts;
}

/** 자연뽕(같은 달 석 장 이상)인 달 */
export function naturalPpongMonths(ids: readonly string[]): Month[] {
  return [...monthCounts(ids)]
    .filter(([, n]) => n >= 3)
    .map(([m]) => m)
    .sort((a, b) => a - b);
}

/** 판 끝 벌점: 손패 합. 자연뽕은 세지 않는다 */
export function handValue(ids: readonly string[]): number {
  const counts = monthCounts(ids);
  return ids.reduce(
    (n, id) => ((counts.get(monthOf(id)) ?? 0) >= 3 ? n : n + cardValue(id)),
    0,
  );
}

/** 이 손패에서 같은 달 카드(`card`와 같은 달) */
export function sameMonthIn(ids: readonly string[], card: string): string[] {
  const m = monthOf(card);
  return ids.filter((id) => monthOf(id) === m);
}

/** 여섯 장 약. 여럿이면 가장 좋은(낮은) 것. 여섯 장이 아니거나 약이 없으면 null */
export function findYak(ids: readonly string[]): Yak | null {
  if (ids.length !== 6) return null;
  const found: Yak[] = [];
  const sum = handSum(ids);
  if (sum <= 10) found.push({ kind: "under10", value: -100 });
  if (sum >= 60) found.push({ kind: "over60", value: -100 });
  const shape = [...monthCounts(ids).values()].sort((a, b) => b - a).join("");
  if (shape === "42") found.push({ kind: "fourPair", value: -50 });
  if (shape === "222" || shape === "33") found.push({ kind: "ttoi", value: 0 });
  const months = ids.map(monthOf).sort((a, b) => a - b);
  if (
    shape === "111111" &&
    months.every((m, i) => i === 0 || m === (months[i - 1] as number) + 1)
  )
    found.push({ kind: "straight", value: -sum });
  if (found.length === 0) return null;
  return found.reduce((best, y) => (y.value < best.value ? y : best));
}
