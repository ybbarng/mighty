import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import {
  encodeRegistration,
  encodeTicket,
  genesisHash,
  makeRegistration,
  makeTicket,
  type Schedule,
  toHex,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { defaultSchedule } from "./config";
import { EntryError } from "./engine";
import { parseStartLiveArgs, startLive } from "./live";
import {
  EASY,
  EPOCH,
  enter,
  makeRig,
  type Player,
  player,
  type Rig,
  readLedger,
  TEST_POW,
} from "./testing";

/**
 * 시험 운영 → 정식 시작(docs/36 11-6). 시험 장부는 꼬리표가 달라 섞이지 않고,
 * 정식 장부에는 시험 장부의 패스키 등록만 옮겨 온다.
 */

/** 시험 운영 일정표(10분 회차, 시험 표시). 시험은 쉬운 작업 증명으로 */
const TRIAL: Schedule = {
  ...defaultSchedule(EPOCH, "trial"),
  entries: [
    {
      fromRound: 1,
      length: 600,
      closeMargin: 60,
      powTarget: EASY,
      registerPowTarget: EASY,
    },
  ],
};
/** 같은 일정표에서 시험 표시만 뺀 것 */
const { ledger: _trial, ...SAME_BUT_LIVE } = TRIAL;

const rigs: Rig[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const r of rigs.splice(0)) r.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** 패스키처럼 등록하는 사람(등록에 패스키 번호가 들어간다. 서명은 시험이라 원시 열쇠) */
async function enterAsPasskey(rig: Rig, p: Player, numbers: number[]) {
  const round = rig.engine.state().round;
  const challenge = rig.engine.head();
  const registration = await makeRegistration(
    p.signer,
    "passkey",
    crypto.getRandomValues(new Uint8Array(16)),
    challenge,
    EASY,
    { params: TEST_POW },
  );
  const ticket = await makeTicket(p.signer, round, numbers, challenge, EASY, {
    params: TEST_POW,
  });
  if (!registration || !ticket) throw new Error("응모권을 만들지 못했다");
  await rig.engine.submit({
    ticket: encodeTicket(ticket),
    registration: encodeRegistration(registration),
    ip: "203.0.113.1",
  });
  p.registered = true;
}

async function trialWithEntries() {
  const trial = await makeRig({ schedule: TRIAL });
  rigs.push(trial);
  const [pk, raw] = await Promise.all([player(), player()]);
  await trial.at(EPOCH + 10);
  await enterAsPasskey(trial, pk, [1, 2, 3, 4, 5, 6]);
  await enter(trial, raw, [7, 8, 9, 10, 11, 12]);
  await trial.finish(1);
  const exportPath = join(trial.dir, "trial-backup.sqlite");
  await backup(trial.store.db, exportPath);
  return { trial, pk, raw, exportPath };
}

describe("시험 운영", () => {
  it("시험 장부는 상태·genesis에 시험 표시가 있고, 회차는 10분이다", async () => {
    const { trial } = await trialWithEntries();
    expect(trial.engine.state().mode).toBe("trial");
    expect(readLedger(trial.dir).genesis.ledger).toBe("trial");
    expect(trial.engine.schedule().entries[0]?.length).toBe(600);
    expect(TRIAL.ledger).toBe("trial");
    expect(toHex(genesisHash(TRIAL))).not.toBe(
      toHex(genesisHash(SAME_BUT_LIVE)),
    );
  });
});

describe("정식 시작(start-live)", () => {
  it("시험 장부의 패스키 등록만 옮겨, 그 열쇠는 정식 1회차에 등록 없이 응모하고 장부 검사를 통과한다", async () => {
    const { pk, raw, exportPath } = await trialWithEntries();
    const liveDir = mkdtempSync(join(tmpdir(), "stardraw-live-"));
    dirs.push(liveDir);
    const liveEpoch = EPOCH + 7 * 86400;
    const result = startLive({
      dataDir: liveDir,
      ledgerDir: join(liveDir, "ledger"),
      epoch: liveEpoch,
      trialExport: exportPath,
      now: EPOCH + 3600,
    });
    expect(result).toMatchObject({ carried: 1, skipped: 1 });
    expect(result.schedule.ledger).toBeUndefined();
    expect(result.schedule.entries[0]?.length).toBe(3600);

    // 그 폴더로 띄우면 정식 장부다(시험 서버는 작업 증명 메모리만 가볍게 돈다)
    const live = await makeRig({ dir: liveDir, at: liveEpoch + 10 });
    rigs.push(live);
    expect(live.engine.state()).toMatchObject({
      mode: "live",
      round: 1,
      records: 0,
    });
    expect(live.engine.isRegistered(pk.signer.publicKey)).toBe(true);
    expect(live.engine.isRegistered(raw.signer.publicKey)).toBe(false);

    // 옮긴 열쇠는 등록 없이 정식 1회차에 응모한다
    const entry = live.engine.schedule().entries[0];
    const ticket = await makeTicket(
      pk.signer,
      1,
      [1, 2, 3, 4, 5, 6],
      live.engine.head(),
      entry?.powTarget ?? 0,
      {
        params: TEST_POW,
      },
    );
    if (!ticket) throw new Error("응모권을 만들지 못했다");
    await live.engine.submit({
      ticket: encodeTicket(ticket),
      ip: "198.51.100.1",
    });
    await live.finish(1);

    // 옮긴 등록은 genesis.json에 공개되고, 장부 검사가 처음부터 받아들인다
    const ledger = readLedger(liveDir);
    expect(ledger.carried).toHaveLength(1);
    expect(ledger.records.map((r) => [r.count, r.registrationCount])).toEqual([
      [1, 0],
    ]);
    const options = {
      beaconVerifier: () => true,
      powParams: TEST_POW,
      powSample: Number.POSITIVE_INFINITY,
    };
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      {
        ...options,
        carried: ledger.carried,
      },
    );
    expect(report.problems).toEqual([]);
    expect(report.keys).toHaveLength(1);
    // 목록을 빼면 드러나고, 그 열쇠의 응모권은 등록되지 않은 열쇠가 된다
    const missing = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      options,
    );
    expect(missing.problems.map((p) => p.message).join("\n")).toMatch(
      /옮긴 등록[\s\S]*등록되지 않은 열쇠/,
    );
  });

  it("시험 장부가 아닌 백업, 이미 장부가 있는 폴더, 지난 시각은 거절한다", async () => {
    const { exportPath } = await trialWithEntries();
    const liveDir = mkdtempSync(join(tmpdir(), "stardraw-live-"));
    dirs.push(liveDir);
    const base = {
      dataDir: liveDir,
      ledgerDir: join(liveDir, "ledger"),
      trialExport: exportPath,
      now: EPOCH + 3600,
    };
    expect(() => startLive({ ...base, epoch: EPOCH })).toThrow("지금보다 뒤");
    // 정각(x:00) 시작은 마감이 정각이 되어 받지 않는다. x:55 시작이어야 정각 추첨
    expect(() => startLive({ ...base, epoch: EPOCH + 86400 + 300 })).toThrow(
      "배수 시각",
    );
    startLive({ ...base, epoch: EPOCH + 86400 });
    expect(() => startLive({ ...base, epoch: EPOCH + 2 * 86400 })).toThrow(
      "이미 장부",
    );

    // 정식 장부 백업을 시험 장부로 착각하지 않는다
    const live = await makeRig({ dir: liveDir, at: EPOCH + 86400 });
    rigs.push(live);
    const liveExport = join(liveDir, "live-backup.sqlite");
    await backup(live.store.db, liveExport);
    const other = mkdtempSync(join(tmpdir(), "stardraw-live-"));
    dirs.push(other);
    expect(() =>
      startLive({
        ...base,
        dataDir: other,
        ledgerDir: join(other, "ledger"),
        trialExport: liveExport,
        epoch: EPOCH + 86400,
      }),
    ).toThrow("시험 장부 백업이 아니다");
  });

  it("명령 인자를 읽는다", () => {
    expect(
      parseStartLiveArgs([
        "--epoch",
        "2026-11-02T08:55:00+09:00",
        "--carry-registrations",
        "/data/b.sqlite",
      ]),
    ).toEqual({
      epoch: Date.parse("2026-11-01T23:55:00Z") / 1000,
      trialExport: "/data/b.sqlite",
    });
    expect(() => parseStartLiveArgs(["--epoch", "어제"])).toThrow();
  });

  it("옮기지 않은 열쇠(시험 장부의 원시 열쇠)는 정식 장부에서 다시 등록해야 한다", async () => {
    const { raw, exportPath } = await trialWithEntries();
    const liveDir = mkdtempSync(join(tmpdir(), "stardraw-live-"));
    dirs.push(liveDir);
    const liveEpoch = EPOCH + 86400;
    startLive({
      dataDir: liveDir,
      ledgerDir: join(liveDir, "ledger"),
      epoch: liveEpoch,
      trialExport: exportPath,
      now: EPOCH,
    });
    const live = await makeRig({ dir: liveDir, at: liveEpoch + 10 });
    rigs.push(live);
    const ticket = await makeTicket(
      raw.signer,
      1,
      [1, 2, 3, 4, 5, 6],
      live.engine.head(),
      EASY,
      { params: TEST_POW },
    );
    if (!ticket) throw new Error("응모권을 만들지 못했다");
    const err = await live.engine
      .submit({ ticket: encodeTicket(ticket), ip: "1.2.3.4" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntryError);
    expect((err as Error).message).toContain("등록되지 않은");
  });
});
