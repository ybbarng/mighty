import {
  emptyWinners,
  type RoundRecord,
  type Schedule,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  type ClosedRound,
  chiSquareTail,
  computeStats,
  inPeriod,
  statsPeriods,
} from "./stats";

function round(
  n: number,
  numbers: number[],
  bonus: number,
  extra: Partial<RoundRecord> = {},
): ClosedRound {
  const record: RoundRecord = {
    v: 1,
    round: n,
    prev: new Uint8Array(32),
    count: 3,
    merkleRoot: new Uint8Array(32),
    registrationCount: 1,
    registrationRoot: new Uint8Array(32),
    rootLoggedAt: 0,
    void: false,
    drandRound: 1000 + n,
    drandSignature: new Uint8Array(48),
    numbers,
    bonus,
    winners: emptyWinners(),
    scheduleChanges: [],
    nicknames: [],
    ...extra,
  };
  return { record, qualified: 0 };
}

describe("관측 기록 계산", () => {
  it("당첨 번호만 세고 보너스·무효 회차는 따로 둔다", () => {
    const s = computeStats([
      round(1, [1, 2, 3, 4, 5, 6], 7),
      round(2, [1, 2, 8, 9, 10, 11], 3),
      round(3, [], 0, { void: true, drandRound: 0, count: 0 }),
    ]);
    expect(s.draws).toBe(2);
    expect(s.voids).toBe(1);
    expect(s.stars[0]?.drawn).toBe(2);
    expect(s.stars[2]?.drawn).toBe(1);
    expect(s.stars[2]?.bonus).toBe(1);
    expect(s.stars[6]?.drawn).toBe(0);
    expect(s.stars[6]?.bonus).toBe(1);
    expect(s.expected).toBeCloseTo((2 * 6) / 45);
    expect(s.entries).toBe(6);
    expect(s.astronauts).toBe(3);
    expect(s.latestDrand).toBe(1002);
  });

  it("잠든 추첨 수와 이어서 뽑힌 수", () => {
    const s = computeStats([
      round(1, [1, 2, 3, 4, 5, 6], 7),
      round(2, [1, 2, 8, 9, 10, 11], 12),
      round(3, [1, 13, 14, 15, 16, 17], 18),
    ]);
    expect(s.stars[0]).toMatchObject({ drawn: 3, streak: 3, asleep: 0 });
    expect(s.stars[1]).toMatchObject({ drawn: 2, streak: 2, asleep: 1 });
    expect(s.stars[2]).toMatchObject({ drawn: 1, last: 1, asleep: 2 });
    expect(s.stars[44]).toMatchObject({ drawn: 0, last: null, asleep: 3 });
  });

  it("별빛 갈래·밝기 묶음·별자리 묶음의 합은 전체 뽑힌 수와 같다", () => {
    const s = computeStats([
      round(1, [1, 12, 23, 34, 40, 45], 2),
      round(2, [5, 16, 27, 33, 38, 44], 3),
    ]);
    const total = 12;
    const sum = (g: { drawn: number }[]) => g.reduce((t, x) => t + x.drawn, 0);
    expect(sum(s.kinds)).toBe(total);
    expect(sum(s.brightness)).toBe(total);
    expect(sum(s.constellations)).toBe(total);
    expect(s.kinds.reduce((t, k) => t + k.stars, 0)).toBe(45);
    expect(s.kinds.reduce((t, k) => t + k.expected, 0)).toBeCloseTo(total);
  });

  it("등수별 당첨은 회차를 넘어 쌓인다", () => {
    const w = emptyWinners();
    w[5].push(new Uint8Array(32), new Uint8Array(32));
    w[1].push(new Uint8Array(32));
    const s = computeStats([
      round(1, [1, 2, 3, 4, 5, 6], 7, { winners: w }),
      round(2, [1, 2, 3, 4, 5, 6], 7, { winners: w }),
    ]);
    expect(s.winners).toEqual({ 1: 2, 2: 0, 3: 0, 4: 0, 5: 4 });
  });

  it("장부가 비어 있으면 0과 null", () => {
    const s = computeStats([]);
    expect(s).toMatchObject({
      draws: 0,
      firstRound: null,
      latestDrand: null,
      fairness: null,
    });
  });
});

describe("공정성(카이제곱)", () => {
  it("꼬리 확률: 기대값 근처는 크고 아주 크면 0에 가깝다", () => {
    // 자유도 44의 기대값은 44, 99% 지점은 약 68.7
    expect(chiSquareTail(44, 44)).toBeGreaterThan(0.4);
    expect(chiSquareTail(44, 44)).toBeLessThan(0.55);
    expect(chiSquareTail(68.7, 44)).toBeCloseTo(0.01, 2);
    expect(chiSquareTail(200, 44)).toBeLessThan(1e-6);
    expect(chiSquareTail(0, 44)).toBe(1);
  });

  it("한 별만 매번 뽑히면 치우침으로 본다", () => {
    const rounds = Array.from({ length: 40 }, (_, i) =>
      round(i + 1, [1, 2, 3, 4, 5, 6], 7),
    );
    expect(computeStats(rounds).fairness?.verdict).toBe("skewed");
  });

  it("돌아가며 고르게 뽑히면 고르다고 본다", () => {
    const rounds = Array.from({ length: 45 }, (_, i) => {
      const nums = [0, 1, 2, 3, 4, 5].map((k) => ((i * 6 + k) % 45) + 1);
      return round(i + 1, nums, ((i * 6 + 6) % 45) + 1);
    });
    expect(computeStats(rounds).fairness?.verdict).toBe("even");
  });
});

describe("기간: 시험 회차와 정식 회차는 섞어 세지 않는다", () => {
  const entry = (fromRound: number, phase?: "trial" | "live") =>
    ({
      fromRound,
      length: 3600,
      closeMargin: 300,
      powTarget: 0,
      registerPowTarget: 0,
      ...(phase ? { phase } : {}),
    }) as Schedule["entries"][number];
  const phased: Schedule = {
    epoch: 0,
    entries: [entry(1, "trial"), entry(100, "live")],
  };

  it("정식 회차가 닫혔으면 정식이 먼저, 시험 기간은 따로 고른다", () => {
    expect(statsPeriods(phased, [98, 99])).toEqual({
      periods: ["trial"],
      initial: "trial",
    });
    expect(statsPeriods(phased, [98, 99, 100])).toEqual({
      periods: ["live", "trial"],
      initial: "live",
    });
    expect(inPeriod(phased, 99, "live")).toBe(false);
    expect(inPeriod(phased, 100, "live")).toBe(true);
    expect(inPeriod(phased, 99, "trial")).toBe(true);
  });

  it("단계가 없는 일정표(연습 장부)는 나누지 않고 모두 센다", () => {
    const plain: Schedule = { epoch: 0, entries: [entry(1)] };
    expect(statsPeriods(plain, [1, 2])).toEqual({ periods: [], initial: null });
    expect(inPeriod(plain, 2, null)).toBe(true);
  });
});
