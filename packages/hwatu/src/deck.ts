import { createRng, shuffleInPlace } from "@mighty/engine";

import { cardOf, HWATU_DECK, type HwatuCard, type Month } from "./cards";

/** 48장을 시드로 섞은 카드 번호들. 같은 시드면 늘 같은 순서(다시 두기·검증) */
export function shuffledDeck(seed: number): string[] {
  return shuffleInPlace(
    createRng(seed),
    HWATU_DECK.map((c) => c.id),
  );
}

/** 달 순서, 같은 달 안에서는 광 → 열끗 → 띠 → 피 순서로 늘어놓는다(손패 정리) */
export function sortCards(ids: readonly string[]): string[] {
  const order = new Map(HWATU_DECK.map((c, i) => [c.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** 달별로 묶는다(바닥 그리기). 달 순서 */
export function groupByMonth(ids: readonly string[]): Map<Month, string[]> {
  const groups = new Map<Month, string[]>();
  for (const id of sortCards(ids)) {
    const month = cardOf(id).month;
    groups.set(month, [...(groups.get(month) ?? []), id]);
  }
  return groups;
}

/** 이름 있는 묶음(약). 게임마다 점수는 엔진이 정하고, 묶음 자체는 같다 */
export const HONGDAN = ["01r", "02r", "03r"] as const;
export const CHEONGDAN = ["06r", "09r", "10r"] as const;
export const CHODAN = ["04r", "05r", "07r"] as const;
export const GODORI = ["02a", "04a", "08a"] as const;

/** 먹은 패를 종류별로 나눈다(먹은 패 그리기·점수 계산의 바탕) */
export interface Captured {
  gwang: string[];
  animal: string[];
  ribbon: string[];
  pi: string[];
  /** 피 장수(쌍피는 2) */
  piCount: number;
}

export function splitCaptured(ids: readonly string[]): Captured {
  const out: Captured = {
    gwang: [],
    animal: [],
    ribbon: [],
    pi: [],
    piCount: 0,
  };
  for (const id of sortCards(ids)) {
    const card: HwatuCard = cardOf(id);
    out[card.kind].push(id);
    if (card.kind === "pi") out.piCount += card.piValue ?? 1;
  }
  return out;
}

/** 묶음을 모두 가졌나 */
export function hasAll(
  ids: readonly string[],
  set: readonly string[],
): boolean {
  return set.every((id) => ids.includes(id));
}

/**
 * 미리 정한 한 판 패(멘탈 포커). 시드로 섞지 않고 이 패로 나눈다.
 * 방장 엔진은 아직 열리지 않은 카드를 자리 표(`?_12`)로 받고, 판 끝 검증·복기는 진짜 카드로 받는다.
 * 손패는 자리 번호 순서, 더미는 앞이 맨 위다
 */
export interface PresetDeal {
  hands: string[][];
  floor: string[];
  deck: string[];
  /** 바닥에 같은 달 넉 장이 깔려 다시 섞은 횟수(고스톱이 화면에 보인다) */
  redeals?: number;
}
