import {
  CHEONGDAN,
  CHODAN,
  cardOf,
  GODORI,
  HONGDAN,
  hasAll,
} from "@mighty/hwatu";

import type { GukjinRule } from "./rules";

/** 국진(9월 열끗) */
export const GUKJIN = "09a";

/** 먹은 패로 난 점수와 그 내역 */
export interface ScoreBreakdown {
  /** 광 점수: 3광 3(비광 섞이면 2), 4광 4, 5광 15 */
  gwang: number;
  /** 열끗 5장 1점, 한 장마다 +1 */
  animal: number;
  /** 띠 5장 1점, 한 장마다 +1 */
  ribbon: number;
  /** 피 10장 1점, 한 장마다 +1(쌍피는 2장) */
  pi: number;
  godori: number;
  hongdan: number;
  cheongdan: number;
  chodan: number;
  /** 모두 더한 점수 */
  total: number;
  /** 장수(박 판정·화면) */
  counts: { gwang: number; animal: number; ribbon: number; pi: number };
  /** 국진을 쌍피로 셌다 */
  gukjinAsPi: boolean;
}

function piValueOf(id: string): number {
  const card = cardOf(id);
  return card.kind === "pi" ? (card.piValue ?? 1) : 0;
}

function gwangScore(gwangs: readonly string[]): number {
  const n = gwangs.length;
  if (n >= 5) return 15;
  if (n === 4) return 4;
  if (n === 3) return gwangs.includes("12g") ? 2 : 3;
  return 0;
}

function breakdownWith(
  ids: readonly string[],
  gukjinAsPi: boolean,
): ScoreBreakdown {
  const gwangs: string[] = [];
  let animals = 0;
  let ribbons = 0;
  let pi = 0;
  for (const id of ids) {
    const card = cardOf(id);
    if (card.kind === "gwang") gwangs.push(id);
    else if (card.kind === "ribbon") ribbons++;
    else if (card.kind === "pi") pi += card.piValue ?? 1;
    else if (id === GUKJIN && gukjinAsPi) pi += 2;
    else animals++;
  }
  const out: ScoreBreakdown = {
    gwang: gwangScore(gwangs),
    animal: animals >= 5 ? animals - 4 : 0,
    ribbon: ribbons >= 5 ? ribbons - 4 : 0,
    pi: pi >= 10 ? pi - 9 : 0,
    godori: hasAll(ids, GODORI) ? 5 : 0,
    hongdan: hasAll(ids, HONGDAN) ? 3 : 0,
    cheongdan: hasAll(ids, CHEONGDAN) ? 3 : 0,
    chodan: hasAll(ids, CHODAN) ? 3 : 0,
    total: 0,
    counts: { gwang: gwangs.length, animal: animals, ribbon: ribbons, pi },
    gukjinAsPi,
  };
  out.total =
    out.gwang +
    out.animal +
    out.ribbon +
    out.pi +
    out.godori +
    out.hongdan +
    out.cheongdan +
    out.chodan;
  return out;
}

/**
 * 먹은 패의 점수. 국진 규칙이 `best`면 열끗으로 셀 때와 쌍피로 셀 때 가운데 점수가 높은 쪽(같으면 열끗)
 */
export function scoreCaptured(
  ids: readonly string[],
  gukjin: GukjinRule,
): ScoreBreakdown {
  const asAnimal = breakdownWith(ids, false);
  if (gukjin === "animal" || !ids.includes(GUKJIN)) return asAnimal;
  const asPi = breakdownWith(ids, true);
  return asPi.total > asAnimal.total ? asPi : asAnimal;
}

/** 피 장수(쌍피 2). 진 사람은 국진을 피박을 피하는 데 쓸 수 있다(`best`) */
export function piCountOf(ids: readonly string[], gukjin: GukjinRule): number {
  let n = 0;
  for (const id of ids) n += piValueOf(id);
  if (gukjin === "best" && ids.includes(GUKJIN)) n += 2;
  return n;
}

/**
 * 피를 한 장 빼앗을 때 가져갈 카드: 보통 피를 먼저, 없으면 쌍피. 피가 없으면 null
 */
export function piToGive(ids: readonly string[]): string | null {
  let double: string | null = null;
  for (const id of ids) {
    const value = piValueOf(id);
    if (value === 1) return id;
    if (value === 2 && double === null) double = id;
  }
  return double;
}
