import { describe, expect, it } from "vitest";
import {
  alignedEpoch,
  checkSchedule,
  checkScheduleChange,
  closedMessage,
  displayRound,
  isAlignedEpoch,
  liveStart,
  phaseOf,
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

describe("운영 단계(시험 → 정식, 이어지는 장부)", () => {
  const trial: Schedule = {
    epoch: EPOCH,
    entries: [{ ...(hourly.entries[0] as ScheduleEntry), phase: "trial" }],
  };
  const live = (fromRound: number): ScheduleEntry => ({
    ...(hourly.entries[0] as ScheduleEntry),
    fromRound,
    phase: "live",
  });

  it("정식 단계는 일정 바꾸기 한 줄이고 24시간 규칙을 그대로 따른다", () => {
    expect(checkScheduleChange(trial, live(26), 1)).toBeNull();
    expect(checkScheduleChange(trial, live(25), 1)).toBe(
      "일정 변경은 24시간 뒤에 시작하는 회차부터",
    );
  });

  it("정식 뒤로 시험은 없고, 단계는 모든 줄에 있거나 모두 없다", () => {
    const changed = withChange(trial, live(26));
    expect(
      checkScheduleChange(changed, { ...live(60), phase: "trial" }, 30),
    ).toMatch(/정식 단계 뒤로 시험 단계를 둘 수 없다/);
    const { phase: _, ...noPhase } = live(60);
    expect(checkScheduleChange(changed, noPhase, 30)).toMatch(
      /모든 줄에 있거나 모두 없어야/,
    );
    expect(checkScheduleChange(hourly, live(26), 1)).toMatch(
      /모든 줄에 있거나 모두 없어야/,
    );
    expect(
      checkSchedule({
        epoch: EPOCH,
        entries: [live(1), { ...live(5), phase: "trial" }],
      }),
    ).toMatch(/정식 단계 뒤로/);
  });

  it("보이는 번호: 정식 첫 회차가 정식 1회, 그 앞은 시험 n회, 단계가 없으면 그냥 n회", () => {
    const changed = withChange(trial, live(26));
    expect(phaseOf(changed, 25)).toBe("trial");
    expect(phaseOf(changed, 26)).toBe("live");
    expect(liveStart(changed)).toBe(26);
    expect(liveStart(trial)).toBeNull();
    expect(displayRound(changed, 1).label).toBe("시험 1회");
    expect(displayRound(changed, 25).label).toBe("시험 25회");
    expect(displayRound(changed, 26)).toEqual({
      phase: "live",
      number: 1,
      label: "정식 1회",
    });
    expect(displayRound(changed, 100).label).toBe("정식 75회");
    expect(displayRound(hourly, 7)).toEqual({
      phase: null,
      number: 7,
      label: "7회",
    });
  });
});
