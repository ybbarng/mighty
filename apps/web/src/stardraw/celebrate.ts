import type { Rank } from "@mighty/stardraw-core";

import { starOf } from "./sky";

/**
 * 당첨 축하(docs/36 11-3): 맞은 내 별이 하나씩 켜지고 그 사이에 선이 그어져 "나만의 별자리"가 생긴다.
 * 3등 이상은 별똥별이 하늘을 가로지르고(1등은 별똥별 비), 1~3등은 마지막에 우주국 당첨 직인이 찍힌다.
 * 등수가 높을수록 커진다. 여기서는 순서·선·시각만 계산하고 그리기는 `Celebration.tsx`가 한다.
 * 시각은 연출이 시작된 때(결과가 나온 때)부터의 ms다. CSS 지연으로 쓰여 화면이 늦게 그려져도 어긋나지 않는다.
 */

/** 별 하나가 켜지는 간격 */
const STAR_GAP = 320;
/** 첫 별이 켜지기 전 */
const LEAD = 250;
/** 선 하나를 긋는 시간 */
export const LINE_MS = 340;
/** 별자리가 다 생기고 직인이 찍히기까지 */
const SEAL_AFTER = 1000;
/** 별똥별 하나가 지나가는 시간 */
export const METEOR_MS = 1100;

export interface Constellation {
  /** 켜지는 차례(맞은 내 별 번호) */
  order: number[];
  /** 그어지는 차례의 선(별 번호 둘) */
  edges: [number, number][];
}

/**
 * 맞은 별들을 잇는 별자리: 가장 왼쪽 별에서 시작해 이미 이은 별들에서 가장 가까운 별을 하나씩 잇는다(최소 신장 트리).
 * 실제 별자리처럼 선이 겹치지 않고 가까운 별끼리 이어진다. 같은 별들이면 늘 같은 모양이다
 */
export function constellationOf(stars: readonly number[]): Constellation {
  const left = [...new Set(stars)].sort(
    (a, b) => starOf(a).x - starOf(b).x || a - b,
  );
  const first = left.shift();
  if (first === undefined) return { order: [], edges: [] };
  const order = [first];
  const edges: [number, number][] = [];
  const dist = (a: number, b: number) => {
    const p = starOf(a);
    const q = starOf(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  while (left.length > 0) {
    let best: { from: number; to: number; d: number } | null = null;
    for (const to of left)
      for (const from of order) {
        const d = dist(from, to);
        if (!best || d < best.d) best = { from, to, d };
      }
    if (!best) break;
    order.push(best.to);
    edges.push([best.from, best.to]);
    left.splice(left.indexOf(best.to), 1);
  }
  return { order, edges };
}

export interface Meteor {
  /** 시작 자리(판 너비 %) */
  x: number;
  y: number;
  /** 기울기(도, 오른쪽 아래로) */
  angle: number;
  /** 시작 시각(ms) */
  at: number;
  /** 꼬리 길이(판 너비 %) */
  length: number;
}

export interface CelebrationPlan extends Constellation {
  rank: Rank;
  /** 별 i가 켜지는 시각 */
  starAt: number[];
  /** 선 i를 긋기 시작하는 시각 */
  lineAt: number[];
  /** 별자리가 다 생긴 뒤 반짝이는 시각 */
  sparkleAt: number;
  meteors: Meteor[];
  /** 당첨 직인이 찍히는 시각(1~3등만) */
  sealAt: number | null;
}

/** 등수별 별똥별 수: 5·4등은 없고 3등부터, 1등은 비처럼 */
export const METEOR_COUNT: Record<Rank, number> = {
  1: 18,
  2: 6,
  3: 3,
  4: 0,
  5: 0,
};

/** 0~1 사이의 늘 같은 값(별똥별 자리가 화면마다 바뀌지 않게) */
function unit(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 맞은 내 별(보너스 포함)과 등수로 축하 연출의 차례와 시각을 정한다 */
export function celebrationPlan(
  rank: Rank,
  hits: readonly number[],
): CelebrationPlan {
  const { order, edges } = constellationOf(hits);
  const starAt = order.map((_, i) => LEAD + i * STAR_GAP);
  const linesFrom = (starAt.at(-1) ?? LEAD) + 260;
  const lineAt = edges.map((_, i) => linesFrom + i * LINE_MS);
  const formed = linesFrom + edges.length * LINE_MS;
  const count = METEOR_COUNT[rank];
  // 1등은 별똥별이 2초 넘게 쏟아지고, 2·3등은 몇 개가 띄엄띄엄
  const spread = rank === 1 ? 2600 : 1400;
  const meteors: Meteor[] = Array.from({ length: count }, (_, i) => ({
    x: -10 + unit(i, 1) * 80,
    y: -8 + unit(i, 2) * 45,
    angle: 22 + unit(i, 3) * 18,
    at: formed + 100 + Math.round((i / Math.max(1, count)) * spread),
    length: 18 + unit(i, 4) * 14,
  }));
  return {
    rank,
    order,
    edges,
    starAt,
    lineAt,
    sparkleAt: formed,
    meteors,
    // 직인은 별똥별이 지나는 사이에 찍는다(1등의 비를 끝까지 기다리지 않게)
    sealAt: rank <= 3 ? formed + SEAL_AFTER : null,
  };
}
