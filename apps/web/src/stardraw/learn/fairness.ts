import {
  ByteWriter,
  drawNumbers,
  drawSeed,
  taggedHash,
} from "@mighty/stardraw-core";

import { chiSquareTail } from "../stats";

/**
 * 보안 배우기 「고르게 뽑히나」: 실제 규칙 코드(drawNumbers)를 여러 회차 돌려 고른지 세어 본다(docs/36 4절 「왜 고른가」).
 * 비교용 "치우친 뽑기"는 225 이상을 버리지 않고 256을 그대로 45로 나눈 것(0~30이 6번, 31~44가 5번이라 작은 번호가 약 20% 더 자주).
 */

const STARS = 45;
const PICK = 6;
/** 묶음마다 치우침 점수가 "우연 범위"를 넘었다고 보는 꼬리 확률 */
export const WINDOW_ALPHA = 0.05;

/** 비교용: 거절 표본 없이 b % 45 + 1(실제 규칙과 같은 해시 줄, 버리는 단계만 없음) */
export function biasedDraw(seed: Uint8Array): number[] {
  const order: number[] = [];
  for (let i = 0; order.length < PICK; i++) {
    const block = taggedHash(
      "stardraw/draw/v1",
      seed,
      new ByteWriter().u32(i).done(),
    );
    for (const b of block) {
      const n = (b % STARS) + 1;
      if (order.includes(n)) continue;
      order.push(n);
      if (order.length === PICK) break;
    }
  }
  return order;
}

/**
 * 한 회차에 6개를 겹치지 않게 뽑을 때 번호별 당첨 횟수의 카이제곱(자유도 44).
 * 나누는 값은 기대값 × (45 − 6)/(45 − 1): 번호 하나의 분산(기대값 × 39/45)에 번호끼리의 음의 공분산을 더한 값이라,
 * 합이 고정된 44차원에서 이 값으로 나눠야 카이제곱 분포를 따른다(39/45로 나누면 약 2% 크게 나온다)
 */
export function chiSquare(counts: readonly number[], draws: number): number {
  const e = (draws * PICK) / STARS;
  const variance = (e * (STARS - PICK)) / (STARS - 1);
  let t = 0;
  for (const c of counts) t += (c - e) ** 2 / variance;
  return t;
}

/** 위 카이제곱의 꼬리 확률(자유도 44). 작을수록 우연으로 보기 어렵다 */
export const tailOf = (chi2: number) => chiSquareTail(chi2, STARS - 1);

/** 번호 하나의 당첨 횟수가 우연으로 흔히 나오는 범위(약 95%, 정규 근사) */
export function countBand(draws: number): {
  expected: number;
  low: number;
  high: number;
} {
  const expected = (draws * PICK) / STARS;
  const sd = Math.sqrt(expected * (1 - PICK / STARS));
  return { expected, low: expected - 1.96 * sd, high: expected + 1.96 * sd };
}

/** 연속 회차에서 앞 회차 번호가 다음 회차에 다시 나오는 비율의 기대값(6/45) */
export const REPEAT_EXPECTED = PICK / STARS;

export interface Tally {
  draws: number;
  /** 번호 1~45의 당첨 횟수(0번 칸이 1번) */
  counts: number[];
  /** 끝난 묶음마다 꼬리 확률 */
  windows: number[];
  /** 앞 회차 번호가 다음 회차에 다시 나온 수 / 견준 번호 수 */
  repeats: number;
  repeatPairs: number;
}

/**
 * 나눠 돌리기 쉬운 세기. `add`로 한 회차씩 넣는다. 묶음 크기마다 그 묶음만의 꼬리 확률을 남긴다
 * (묶음끼리 섞지 않아, "묶음마다 치우쳤다가 합치면 고르게" 같은 일이 있으면 드러난다)
 */
export function createTally(windowSize: number) {
  const tally: Tally = {
    draws: 0,
    counts: new Array(STARS).fill(0),
    windows: [],
    repeats: 0,
    repeatPairs: 0,
  };
  let windowCounts: number[] = new Array(STARS).fill(0);
  let windowDraws = 0;
  let prev: readonly number[] | null = null;
  return {
    tally,
    add(numbers: readonly number[]) {
      tally.draws++;
      windowDraws++;
      for (const n of numbers) {
        tally.counts[n - 1] = (tally.counts[n - 1] ?? 0) + 1;
        windowCounts[n - 1] = (windowCounts[n - 1] ?? 0) + 1;
      }
      if (prev) {
        for (const n of numbers) if (prev.includes(n)) tally.repeats++;
        tally.repeatPairs += numbers.length;
      }
      prev = numbers;
      if (windowDraws === windowSize) {
        tally.windows.push(tailOf(chiSquare(windowCounts, windowDraws)));
        windowCounts = new Array(STARS).fill(0);
        windowDraws = 0;
      }
    },
  };
}

/** 회차 `round`의 실제 규칙 당첨 번호 6개와 비교용 치우친 6개 */
export function drawPair(
  base: Uint8Array,
  round: number,
): { fair: number[]; biased: number[] } {
  const seed = drawSeed(round, base);
  return { fair: drawNumbers(seed).numbers, biased: biasedDraw(seed) };
}

/** 고르게 뽑을 때 묶음 n개 중 k개 이상이 우연 범위 밖으로 나올 확률(이항 분포 위쪽 꼬리) */
export function windowsTail(k: number, n: number, p = WINDOW_ALPHA): number {
  if (k <= 0) return 1;
  // P(X ≥ k) = 1 − Σ_{i<k} C(n,i) p^i (1−p)^(n−i), 로그로 더해 큰 n에서도 넘치지 않게
  let below = 0;
  let logTerm = n * Math.log(1 - p); // i = 0
  for (let i = 0; i < k && i <= n; i++) {
    below += Math.exp(logTerm);
    logTerm += Math.log((n - i) / (i + 1)) + Math.log(p / (1 - p));
  }
  return Math.max(0, 1 - below);
}
