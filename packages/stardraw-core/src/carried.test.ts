import { describe, expect, it } from "vitest";

import { toHex } from "./bytes";
import { drandRoundForClose } from "./drand";
import { genesisHash, type RoundRecord } from "./record";
import type { KeyRegistration } from "./registration";
import { carryRegistrations, closeRound } from "./round";
import { checkSchedule, roundTimes, type Schedule } from "./schedule";
import {
  fakePasskey,
  fakeSignature,
  HOURLY,
  registerPasskey,
  TEST_POW,
  ticketFor,
} from "./testing";
import { verifyLedger } from "./verify";

/**
 * 시험 장부 → 정식 장부(docs/36 11-6): 시험 장부는 genesis 꼬리표가 달라 섞이지 않고,
 * 정식 장부는 시험 장부의 패스키 등록만 처음 일정표에 묶어 옮겨 온다(작업 증명 면제).
 */

const TRIAL: Schedule = { ...HOURLY, ledger: "trial" };

async function trialPasskeys(n: number) {
  const keys = await Promise.all(
    Array.from({ length: n }, () => fakePasskey()),
  );
  // 시험 장부 1회차 문제 값으로 등록(정식 장부에서는 이 작업 증명이 맞지 않는다)
  const regs = await Promise.all(
    keys.map((k) => registerPasskey(k, genesisHash(TRIAL))),
  );
  return { keys, regs };
}

/** 정식 장부 1회차: 옮겨 온 열쇠가 등록 없이 응모한다 */
async function liveRound(
  live: Schedule,
  signer: Parameters<typeof ticketFor>[0],
  numbers: number[],
) {
  const ticket = await ticketFor(signer, 1, numbers, genesisHash(live));
  const { closesAt } = roundTimes(live, 1);
  const record = closeRound({
    schedule: live,
    round: 1,
    prev: genesisHash(live),
    tickets: [ticket],
    registrations: [],
    rootLoggedAt: closesAt + 60,
    beacon: {
      round: drandRoundForClose(closesAt),
      signature: fakeSignature(1),
    },
  });
  return { ticket, record };
}

const verify = (
  live: Schedule,
  record: RoundRecord,
  ticket: Awaited<ReturnType<typeof liveRound>>["ticket"],
  carried?: readonly KeyRegistration[],
) =>
  verifyLedger(live, [record], [[ticket]], [[]], {
    beaconVerifier: () => true,
    powParams: TEST_POW,
    powSample: Number.POSITIVE_INFINITY,
    ...(carried ? { carried } : {}),
  });

describe("시험 장부와 정식 장부", () => {
  it("시험 장부는 같은 일정표여도 genesis 해시가 달라 사슬이 처음부터 갈린다", () => {
    expect(toHex(genesisHash(TRIAL))).not.toBe(toHex(genesisHash(HOURLY)));
    expect(checkSchedule(TRIAL)).toBeNull();
    expect(
      checkSchedule({ ...HOURLY, ledger: "live" as "trial" }),
    ).not.toBeNull();
  });

  it("옮긴 등록은 genesis 해시에 묶이고, 등록 없이 응모해도 검사를 통과한다(작업 증명 면제)", async () => {
    const { keys, regs } = await trialPasskeys(3);
    const { registrations, carried } = carryRegistrations(regs);
    const live: Schedule = { ...HOURLY, carried };
    expect(checkSchedule(live)).toBeNull();
    expect(toHex(genesisHash(live))).not.toBe(toHex(genesisHash(HOURLY)));
    const { ticket, record } = await liveRound(
      live,
      (keys[1] as (typeof keys)[0]).signer,
      [1, 2, 3, 4, 5, 6],
    );
    const report = await verify(live, record, ticket, registrations);
    expect(report.problems).toEqual([]);
    expect(report.keys).toHaveLength(3);
  });

  it("옮긴 목록을 빼거나 바꾸면 드러난다", async () => {
    const { keys, regs } = await trialPasskeys(3);
    const { registrations, carried } = carryRegistrations(regs);
    const live: Schedule = { ...HOURLY, carried };
    const { ticket, record } = await liveRound(
      live,
      (keys[0] as (typeof keys)[0]).signer,
      [1, 2, 3, 4, 5, 6],
    );

    // 목록을 안 주면 루트가 맞지 않고, 그 열쇠의 응모권은 등록되지 않은 열쇠다
    const none = (await verify(live, record, ticket)).problems.map(
      (p) => p.message,
    );
    expect(none.some((m) => m.includes("옮긴 등록"))).toBe(true);
    expect(none.some((m) => m.includes("등록되지 않은 열쇠"))).toBe(true);

    // 하나를 빼면 수·루트가 다르다
    const fewer = (await verify(live, record, ticket, registrations.slice(1)))
      .problems;
    expect(fewer.some((p) => p.message.includes("옮긴 등록"))).toBe(true);

    // genesis에 없는 등록을 끼워 넣으면 루트가 다르다
    const extra = await trialPasskeys(1);
    const more = carryRegistrations([
      ...registrations,
      ...extra.regs,
    ]).registrations;
    const added = (await verify(live, record, ticket, more)).problems;
    expect(added.some((p) => p.message.includes("머클 루트"))).toBe(true);

    // genesis에 옮긴 등록이 없는데 목록을 주면 드러난다
    const plain = await liveRound(
      HOURLY,
      (keys[0] as (typeof keys)[0]).signer,
      [1, 2, 3, 4, 5, 6],
    );
    const stray = (
      await verify(HOURLY, plain.record, plain.ticket, registrations)
    ).problems;
    expect(
      stray.some((p) => p.message.includes("처음 일정표에 옮긴 등록이 없다")),
    ).toBe(true);
  });

  it("시험 장부에는 등록을 옮겨 올 수 없다", async () => {
    const { regs } = await trialPasskeys(1);
    expect(
      checkSchedule({ ...TRIAL, carried: carryRegistrations(regs).carried }),
    ).not.toBeNull();
  });
});
