import { describe, expect, it } from "vitest";
import {
  alignedEpoch,
  checkSchedule,
  checkScheduleChange,
  closedMessage,
  isAlignedEpoch,
  roundAt,
  roundTimes,
  SCHEDULE_NOTICE,
  type Schedule,
  type ScheduleEntry,
  withChange,
} from "./schedule";

const HOUR = 3600;
// 2026-10-29 15:00 KST(06:00 UTC)
const EPOCH = 1793253600;
const hourly: Schedule = {
  epoch: EPOCH,
  entries: [
    {
      fromRound: 1,
      length: HOUR,
      closeMargin: 60,
      powTarget: 2 ** 26,
      registerPowTarget: 2 ** 20,
    },
  ],
};

describe("회차 시각", () => {
  it("1시간 회차: 회차 k는 epoch + (k-1)시간에 열리고 1시간 뒤 닫힌다", () => {
    expect(roundTimes(hourly, 1)).toMatchObject({
      opensAt: EPOCH,
      closesAt: EPOCH + HOUR,
      entryDeadline: EPOCH + HOUR - 60,
    });
    expect(roundTimes(hourly, 25).opensAt).toBe(EPOCH + 24 * HOUR);
  });

  it("시각 → 회차: 여는 시각은 그 회차, 닫는 시각은 다음 회차", () => {
    expect(roundAt(hourly, EPOCH - 1)).toBeNull();
    expect(roundAt(hourly, EPOCH)).toBe(1);
    expect(roundAt(hourly, EPOCH + HOUR - 1)).toBe(1);
    expect(roundAt(hourly, EPOCH + HOUR)).toBe(2);
  });

  it("길이가 바뀌어도 차례 번호가 이어진다(1시간 10회 → 하루)", () => {
    const changed = withChange(hourly, {
      fromRound: 11,
      length: 24 * HOUR,
      closeMargin: 300,
      powTarget: 2 ** 26,
      registerPowTarget: 2 ** 20,
    });
    expect(roundTimes(changed, 10).closesAt).toBe(EPOCH + 10 * HOUR);
    expect(roundTimes(changed, 11)).toMatchObject({
      opensAt: EPOCH + 10 * HOUR,
      closesAt: EPOCH + 34 * HOUR,
    });
    expect(roundTimes(changed, 12).opensAt).toBe(EPOCH + 34 * HOUR);
    expect(roundAt(changed, EPOCH + 10 * HOUR - 1)).toBe(10);
    expect(roundAt(changed, EPOCH + 33 * HOUR)).toBe(11);
    expect(roundAt(changed, EPOCH + 34 * HOUR)).toBe(12);
    // 앞 구간의 시각은 그대로다
    expect(roundTimes(changed, 3)).toEqual(roundTimes(hourly, 3));
  });

  it("일정표 규칙: 첫 줄은 1회차, 회차는 10분 이상, 마감 여유는 길이보다 작게", () => {
    expect(checkSchedule(hourly)).toBeNull();
    expect(checkSchedule({ epoch: EPOCH, entries: [] })).not.toBeNull();
    expect(
      checkSchedule({
        epoch: EPOCH,
        entries: [{ ...(hourly.entries[0] as ScheduleEntry), fromRound: 2 }],
      }),
    ).not.toBeNull();
    expect(
      checkSchedule({
        epoch: EPOCH,
        entries: [{ ...(hourly.entries[0] as ScheduleEntry), length: 300 }],
      }),
    ).not.toBeNull();
    expect(
      checkSchedule({
        epoch: EPOCH,
        entries: [
          { ...(hourly.entries[0] as ScheduleEntry), closeMargin: HOUR },
        ],
      }),
    ).not.toBeNull();
  });
});

describe("일정 변경은 24시간 뒤부터", () => {
  const change = (fromRound: number) => ({
    fromRound,
    length: 2 * HOUR,
    closeMargin: 60,
    powTarget: 2 ** 26,
    registerPowTarget: 2 ** 20,
  });

  it("1회차 마감에 정하면 25회차(마감 + 24시간에 열림)부터 바꿀 수 있다", () => {
    // 1회차 마감 = EPOCH + 1h, 25회차가 열리는 시각 = EPOCH + 24h → 23시간 뒤라 이르다
    expect(checkScheduleChange(hourly, change(25), 1)).not.toBeNull();
    // 26회차는 EPOCH + 25h에 열린다 = 마감 + 24h
    expect(
      roundTimes(hourly, 26).opensAt - roundTimes(hourly, 1).closesAt,
    ).toBe(SCHEDULE_NOTICE);
    expect(checkScheduleChange(hourly, change(26), 1)).toBeNull();
  });

  it("마지막 줄보다 앞 회차는 바꿀 수 없다", () => {
    const changed = withChange(hourly, change(100));
    expect(checkScheduleChange(changed, change(90), 1)).not.toBeNull();
  });
});

describe("매시 정각 추첨 · 55분 마감", () => {
  // EPOCH는 15:00 KST. 15:20에 띄우면 1회차 마감은 15:55, 추첨은 16:00
  it("띄운 뒤 다음 x:55가 1회차 마감이다", () => {
    const epoch = alignedEpoch(EPOCH + 20 * 60, HOUR);
    expect(epoch).toBe(EPOCH - 5 * 60);
    expect(isAlignedEpoch(epoch, HOUR)).toBe(true);
    expect(isAlignedEpoch(EPOCH, HOUR)).toBe(false);
  });

  it("x:55 정각에 띄우면 다음 시간 x:55가 마감이다", () => {
    expect(alignedEpoch(EPOCH + 55 * 60, HOUR)).toBe(EPOCH + 55 * 60);
  });

  it("10분 회차는 x:05 마감, x:10 추첨", () => {
    const epoch = alignedEpoch(EPOCH + 60, 600);
    expect(epoch + 600).toBe(EPOCH + 5 * 60);
    expect(alignedEpoch(EPOCH + 6 * 60, 600) + 600).toBe(EPOCH + 15 * 60);
  });

  it("마감 문구는 서버 시각(한국 시각)을 적는다", () => {
    expect(closedMessage(EPOCH + 55 * 60 + 2)).toBe(
      "마감됐어요(서버 시각 15:55:02)",
    );
  });
});
