import { fromHex } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  biasedDraw,
  chiSquare,
  countBand,
  createTally,
  drawPair,
  REPEAT_EXPECTED,
  tailOf,
  windowsTail,
} from "./fairness";

// drand quicknet 1000000회차 난수(규칙 패키지 시험과 같은 값)
const BASE = fromHex(
  "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
);

describe("세는 계산", () => {
  it("완전히 고르면 카이제곱 0, 꼬리 확률 1", () => {
    // 45회차 × 6개 = 번호마다 정확히 6번
    expect(chiSquare(new Array(45).fill(6), 45)).toBe(0);
    expect(tailOf(0)).toBe(1);
  });

  it("한 번호에 몰리면 꼬리 확률이 아주 작다", () => {
    // 합은 그대로 45회차 × 6개: 1번에 30번을 몰고 2~6번을 0번으로
    const counts = new Array(45).fill(6);
    counts[0] += 30;
    for (let i = 1; i <= 5; i++) counts[i] = 0;
    expect(tailOf(chiSquare(counts, 45))).toBeLessThan(0.001);
  });

  it("우연 범위는 기대값을 가운데 둔다", () => {
    const b = countBand(4500);
    expect(b.expected).toBe(600);
    expect(b.low).toBeLessThan(600);
    expect(b.high - 600).toBeCloseTo(600 - b.low);
  });

  it("묶음은 묶음끼리만 센다, 연속 회차 겹침도 센다", () => {
    const t = createTally(2);
    t.add([1, 2, 3, 4, 5, 6]);
    t.add([1, 2, 7, 8, 9, 10]);
    t.add([11, 12, 13, 14, 15, 16]);
    expect(t.tally.draws).toBe(3);
    expect(t.tally.windows).toHaveLength(1);
    expect(t.tally.counts[0]).toBe(2);
    expect(t.tally.repeats).toBe(2);
    expect(t.tally.repeatPairs).toBe(12);
  });
});

describe("실제 규칙과 치우친 뽑기(seed 고정, 결과가 늘 같다)", () => {
  const run = (n: number, size: number) => {
    const fair = createTally(size);
    const biased = createTally(size);
    for (let r = 1; r <= n; r++) {
      const d = drawPair(BASE, r);
      fair.add(d.fair);
      biased.add(d.biased);
    }
    return { fair: fair.tally, biased: biased.tally };
  };

  it("치우친 뽑기도 서로 다른 1~45의 6개", () => {
    const seed = fromHex("00".repeat(32));
    const o = biasedDraw(seed);
    expect(new Set(o).size).toBe(6);
    for (const n of o) expect(n >= 1 && n <= 45).toBe(true);
  });

  it("1만 회차: 실제 규칙은 고르고, 치우친 뽑기는 바로 드러난다", () => {
    const { fair, biased } = run(10_000, 1_000);
    expect(tailOf(chiSquare(fair.counts, fair.draws))).toBeGreaterThan(0.01);
    expect(tailOf(chiSquare(biased.counts, biased.draws))).toBeLessThan(0.001);
    // 작은 번호(1~31)가 큰 번호(32~45)보다 자주 나온다
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(biased.counts.slice(0, 31))).toBeGreaterThan(
      avg(biased.counts.slice(31)) * 1.08,
    );
    // 연속 회차 겹침은 6/45 근처
    expect(fair.repeats / fair.repeatPairs).toBeCloseTo(REPEAT_EXPECTED, 1);
    // 묶음 열 개 대부분이 우연 범위 안
    expect(fair.windows.filter((p) => p < 0.05).length).toBeLessThanOrEqual(3);
  });
});

describe("묶음 밖 개수의 꼬리 확률", () => {
  it("이항 분포 값과 맞는다", () => {
    expect(windowsTail(0, 20)).toBe(1);
    // P(X ≥ 1 | n=20, p=0.05) = 1 − 0.95^20
    expect(windowsTail(1, 20)).toBeCloseTo(1 - 0.95 ** 20, 10);
    // 20개 중 4개 이상은 약 1.6%
    expect(windowsTail(4, 20)).toBeCloseTo(0.0159, 3);
    expect(windowsTail(20, 20)).toBeLessThan(1e-12);
  });
});
