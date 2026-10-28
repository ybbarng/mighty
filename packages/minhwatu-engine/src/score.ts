import {
  CHEONGDAN,
  CHODAN,
  cardOf,
  HONGDAN,
  hasAll,
  type Month,
} from "@mighty/hwatu";

import { baseScore, type MinhwatuRules } from "./rules";

/** 카드 한 장의 점수: 광 20, 열끗 10, 띠 5, 피(쌍피 포함) 0 */
export function cardPoints(id: string): number {
  const kind = cardOf(id).kind;
  return kind === "gwang"
    ? 20
    : kind === "animal"
      ? 10
      : kind === "ribbon"
        ? 5
        : 0;
}

export function sumPoints(ids: readonly string[]): number {
  let total = 0;
  for (const id of ids) total += cardPoints(id);
  return total;
}

/** 약 이름표 */
export type YakId =
  | "choyak"
  | "pungyak"
  | "biyak"
  | "hongdan"
  | "cheongdan"
  | "chodan"
  | "saodong";

export const YAK_NAMES: Record<YakId, string> = {
  choyak: "초약",
  pungyak: "풍약",
  biyak: "비약",
  hongdan: "홍단",
  cheongdan: "청단",
  chodan: "초단",
  saodong: "사오동",
};

/** 약의 조건(쉬운 말) */
export const YAK_DESCRIPTIONS: Record<YakId, string> = {
  choyak: "5월 난초 4장",
  pungyak: "10월 단풍 4장",
  biyak: "12월 비 4장",
  hongdan: "1·2·3월 붉은 띠(홍단) 3장",
  cheongdan: "6·9·10월 파란 띠(청단) 3장",
  chodan: "4·5·7월 풀 띠(초단) 3장",
  saodong: "11월 오동 4장",
};

/** 약을 이루는 카드 */
export const YAK_CARDS: Record<YakId, readonly string[]> = {
  choyak: ["05a", "05r", "05p", "05q"],
  pungyak: ["10a", "10r", "10p", "10q"],
  biyak: ["12g", "12a", "12r", "12d"],
  hongdan: HONGDAN,
  cheongdan: CHEONGDAN,
  chodan: CHODAN,
  saodong: ["11g", "11d", "11p", "11q"],
};

/** 달 4장 약의 달 */
export const YAK_MONTH: Partial<Record<YakId, Month>> = {
  choyak: 5,
  pungyak: 10,
  biyak: 12,
  saodong: 11,
};

/** 이 규칙에서 인정하는 약과 점수 */
export function yakList(rules: MinhwatuRules): { id: YakId; value: number }[] {
  const list: { id: YakId; value: number }[] = [
    { id: "choyak", value: rules.yakScore },
    { id: "pungyak", value: rules.yakScore },
    { id: "biyak", value: rules.yakScore },
    { id: "hongdan", value: 30 },
    { id: "cheongdan", value: 30 },
  ];
  if (rules.chodan) list.push({ id: "chodan", value: 30 });
  if (rules.saodong) list.push({ id: "saodong", value: 40 });
  return list;
}

/** 먹은 패로 이룬 약 */
export function yaksOf(
  captured: readonly string[],
  rules: MinhwatuRules,
): { id: YakId; value: number }[] {
  return yakList(rules).filter((y) => hasAll(captured, YAK_CARDS[y.id]));
}

/** 한 자리의 판 점수 내역 */
export interface SeatScore {
  /** 광·열끗·띠 점수 */
  gwang: number;
  animal: number;
  ribbon: number;
  /** 카드 점수 합 */
  cards: number;
  /** 내가 이룬 약 */
  yaks: { id: YakId; value: number }[];
  /** 약으로 주고받은 점수(받은 것 − 준 것) */
  yakNet: number;
  /** 기본 점수(본) */
  base: number;
  /** 이번 판 점수 = 카드 + 약 주고받기 − 본. 모두 더하면 0이다 */
  total: number;
}

/**
 * 판 점수. 약을 이루면 나머지 사람 모두에게서 그 점수를 받는다(2인이면 서로 이룬 약의 차이만큼 받는 것과 같다).
 * 카드 점수에서 본을 빼므로 판 점수를 모두 더하면 0이다(나무위키 "민화투" 정산)
 */
export function scoreRound(
  captured: readonly (readonly string[])[],
  rules: MinhwatuRules,
): SeatScore[] {
  const n = captured.length;
  const yaks = captured.map((c) => yaksOf(c, rules));
  const yakSum = yaks.map((list) => list.reduce((s, y) => s + y.value, 0));
  const allYak = yakSum.reduce((a, b) => a + b, 0);
  const base = baseScore(rules.players);
  return captured.map((ids, seat) => {
    let gwang = 0;
    let animal = 0;
    let ribbon = 0;
    for (const id of ids) {
      const kind = cardOf(id).kind;
      if (kind === "gwang") gwang += 20;
      else if (kind === "animal") animal += 10;
      else if (kind === "ribbon") ribbon += 5;
    }
    const cards = gwang + animal + ribbon;
    const mine = yakSum[seat] ?? 0;
    const yakNet = mine * (n - 1) - (allYak - mine);
    return {
      gwang,
      animal,
      ribbon,
      cards,
      yaks: yaks[seat] ?? [],
      yakNet,
      base,
      total: cards + yakNet - base,
    };
  });
}
