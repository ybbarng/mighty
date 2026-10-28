import { TIME_PRESETS } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { clockDisplay } from "./GameClock";

const FAST = TIME_PRESETS.fast;

describe("시계 표시", () => {
  it("기본 시간이 남았으면 기본 시간을 보인다", () => {
    expect(clockDisplay({ main: 60_000, periods: 3 }, FAST, 10_000)).toEqual({
      main: 50_000,
      byoyomi: null,
      periods: 3,
    });
  });

  it("기본 시간을 넘기면 초읽기 남은 초와 횟수를 보인다", () => {
    expect(clockDisplay({ main: 5_000, periods: 3 }, FAST, 12_000)).toEqual({
      main: 0,
      byoyomi: 23_000,
      periods: 3,
    });
    // 초읽기 하나를 넘기면 횟수가 준다.
    expect(clockDisplay({ main: 0, periods: 3 }, FAST, 31_000)).toEqual({
      main: 0,
      byoyomi: 29_000,
      periods: 2,
    });
  });

  it("다 쓰면 0", () => {
    expect(clockDisplay({ main: 0, periods: 1 }, FAST, 40_000)).toEqual({
      main: 0,
      byoyomi: 0,
      periods: 0,
    });
  });
});
