import {
  anchorPath,
  displayRound,
  ledgerId,
  parseAnchorFile,
  roundTimes,
  type Schedule,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubAnchor } from "./outside";
import { parseScheduleLiveArgs, scheduleLive } from "./schedule-live";
import {
  FakeGitHub,
  makeRig,
  type Rig,
  readLedger,
  SCHEDULE,
  TEST_POW,
} from "./testing";

let rig: Rig | undefined;
afterEach(() => {
  rig?.close();
  rig = undefined;
});

/** 서버 장부처럼 시험 단계로 시작(시험에서는 1시간 회차로 회차 수를 줄인다) */
const TRIAL: Schedule = {
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
};
const opensAt = (round: number) => roundTimes(TRIAL, round).opensAt;

describe("시험 → 정식: 이어지는 장부", () => {
  it("정식 예약은 다음 기록에 실리고, 그 회차부터 단계·앵커 브랜치·보이는 번호가 바뀌며 사슬은 검사를 통과한다", async () => {
    const gh = new FakeGitHub();
    rig = await makeRig({
      schedule: TRIAL,
      anchor: new GitHubAnchor(
        "ybbarng/stardraw-ledger",
        "test-token",
        gh.fetch,
      ),
    });
    await rig.finish(1);
    // 2회차 기록에 실린다: 2회차 마감 + 24시간 = 27회차가 열리는 시각
    expect(() => scheduleLive(rig?.store as never, opensAt(26))).toThrow(
      /24시간 뒤에 시작하는 회차부터\(2회차 기록에 실린다\)/,
    );
    expect(scheduleLive(rig.store, opensAt(27))).toMatchObject({
      change: { fromRound: 27, length: 3600, phase: "live" },
      decidedIn: 2,
    });
    expect(() => scheduleLive(rig?.store as never, opensAt(28))).toThrow(
      /이미 예약한/,
    );
    expect(rig.engine.state().mode).toBe("trial");

    for (let round = 2; round <= 27; round++) await rig.finish(round);
    expect(rig.store.pendingChange()).toBeNull();
    expect(rig.store.record(2)?.scheduleChanges[0]?.phase).toBe("live");
    expect(rig.engine.state().liveFrom).toBe(27);
    await rig.at(opensAt(28) + 10);
    expect(rig.engine.state().mode).toBe("live");
    expect(() => scheduleLive(rig?.store as never, opensAt(60))).toThrow(
      /이미 27회차부터 정식 단계다/,
    );

    const ledger = readLedger(rig.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    expect(displayRound(report.schedule, 26).label).toBe("시험 26회");
    expect(displayRound(report.schedule, 27).label).toBe("정식 1회");

    // 앵커: 처음 일정표는 main, 시험 회차는 trial, 정식 회차는 main
    await rig.engine.anchorIdle();
    const id = ledgerId(rig.engine.genesis);
    expect(gh.text("main", "genesis.txt")).toContain(`ledger ${id}`);
    expect(gh.text("trial", anchorPath(id, 26))).toBeDefined();
    expect(gh.text("main", anchorPath(id, 26))).toBeUndefined();
    expect(
      parseAnchorFile(gh.text("main", anchorPath(id, 27)) ?? "")?.round,
    ).toBe(27);
  });

  it("정각 추첨에 맞지 않는 시각, 회차 경계가 아닌 시각은 거절한다", async () => {
    rig = await makeRig({ schedule: TRIAL });
    expect(() => scheduleLive(rig?.store as never, opensAt(30) + 600)).toThrow(
      /x:55/,
    );
    expect(() =>
      scheduleLive(rig?.store as never, opensAt(30) + 3600 * 0.5 + 300),
    ).toThrow();
    expect(rig.store.pendingChange()).toBeNull();
  });

  it("예약한 뒤 기록이 늦게 닫혀 24시간 규칙에 늦으면 싣지 않고 지운다", async () => {
    rig = await makeRig({ schedule: TRIAL });
    await rig.finish(1);
    rig.store.setPendingChange({
      ...(TRIAL.entries[0] as Schedule["entries"][0]),
      fromRound: 10,
      phase: "live",
    });
    await rig.finish(2);
    expect(rig.store.record(2)?.scheduleChanges).toEqual([]);
    expect(rig.store.pendingChange()).toBeNull();
    expect(rig.logs.join("\n")).toMatch(/싣지 못해 지웠다/);
  });

  it("명령 인자: --from은 ISO 시각(초 단위)", () => {
    expect(
      parseScheduleLiveArgs(["--from", "2026-11-02T08:55:00+09:00"]),
    ).toEqual({ from: Date.parse("2026-11-02T08:55:00+09:00") / 1000 });
    expect(() => parseScheduleLiveArgs([])).toThrow(/--from/);
  });
});
