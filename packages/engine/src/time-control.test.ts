import { describe, expect, it } from "vitest";

import {
  decodeTimePreset,
  encodeTimePreset,
  spendTime,
  startClock,
  TIME_PRESETS,
  timeLeft,
} from "./time-control";

const FAST = TIME_PRESETS.fast;

describe("개인 시간(기본 시간 + 초읽기)", () => {
  it("기본 시간 안에서는 쓴 만큼 줄고 초읽기는 그대로다", () => {
    const { clock, flagged } = spendTime(startClock(FAST), 60_000, FAST);
    expect(clock).toEqual({ main: 120_000, periods: 3 });
    expect(flagged).toBe(false);
  });

  it("기본 시간을 넘겨도 초읽기 한 번 안에 두면 초읽기 횟수가 그대로다", () => {
    const { clock, flagged } = spendTime(
      { main: 10_000, periods: 3 },
      35_000,
      FAST,
    );
    expect(clock).toEqual({ main: 0, periods: 3 });
    expect(flagged).toBe(false);
  });

  it("초읽기를 넘길 때마다 한 번씩 줄어든다", () => {
    expect(spendTime({ main: 0, periods: 3 }, 31_000, FAST).clock).toEqual({
      main: 0,
      periods: 2,
    });
    expect(spendTime({ main: 0, periods: 3 }, 65_000, FAST).clock).toEqual({
      main: 0,
      periods: 1,
    });
  });

  it("초읽기를 모두 넘기면 시간패다", () => {
    expect(spendTime({ main: 0, periods: 1 }, 30_001, FAST).flagged).toBe(true);
    expect(spendTime({ main: 0, periods: 3 }, 90_001, FAST).flagged).toBe(true);
    // 마지막 초읽기 끝까지 쓰는 것(딱 30초)은 괜찮다.
    expect(spendTime({ main: 0, periods: 1 }, 29_999, FAST).flagged).toBe(
      false,
    );
  });

  it("남은 시간은 기본 시간 + 초읽기 전부", () => {
    expect(timeLeft(startClock(FAST), FAST)).toBe(180_000 + 90_000);
  });

  it("규칙 문자열 꼬리는 없으면 시간 없음, -t1은 빠른, -t2는 보통", () => {
    expect(decodeTimePreset(undefined)).toBe("none");
    expect(decodeTimePreset(encodeTimePreset("fast"))).toBe("fast");
    expect(decodeTimePreset(encodeTimePreset("normal"))).toBe("normal");
    expect(encodeTimePreset("none")).toBe("");
    expect(decodeTimePreset("-t9")).toBeNull();
  });
});
