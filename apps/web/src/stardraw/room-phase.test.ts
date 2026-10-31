// @vitest-environment node
import {
  drandRoundForClose,
  drandTime,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { roomPhase } from "./room-phase";
import { LIVE_LEAD_MS } from "./roulette";

/** 운영과 같은 20분 회차 */
const SCHEDULE: Schedule = {
  epoch: 1793253300,
  entries: [
    {
      fromRound: 1,
      length: 1200,
      closeMargin: 5,
      powTarget: 0,
      registerPowTarget: 0,
    } as ScheduleEntry,
  ],
};

describe("회차 방 진행 단계", () => {
  const times = roundTimes(SCHEDULE, 3);
  const showStart =
    drandTime(drandRoundForClose(times.closesAt)) * 1000 + LIVE_LEAD_MS;
  const showLength = 46_000;
  const at = (ms: number) =>
    roomPhase(ms, times.entryDeadline, showStart, showLength);

  it("응모 마감 전은 응모 받는 중, 마감 뒤부터 추첨 15초 전까지는 마감", () => {
    expect(at(times.entryDeadline * 1000 - 1)).toBe("open");
    expect(at(times.entryDeadline * 1000)).toBe("closed");
    expect(at(showStart - 15_001)).toBe("closed");
  });

  it("15초 전 안내, 10초 전부터 카운트다운, 시작 시각에 생방송", () => {
    expect(at(showStart - 15_000)).toBe("announce");
    expect(at(showStart - 10_001)).toBe("announce");
    expect(at(showStart - 10_000)).toBe("count");
    expect(at(showStart - 1)).toBe("count");
    expect(at(showStart)).toBe("live");
  });

  it("연출 길이가 지나면 추첨 뒤(늦게 들어와도 같은 시각이면 같은 장면)", () => {
    expect(at(showStart + showLength - 1)).toBe("live");
    expect(at(showStart + showLength)).toBe("after");
  });
});
