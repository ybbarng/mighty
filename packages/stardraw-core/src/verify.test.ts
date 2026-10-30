import { describe, expect, it } from "vitest";
import { toHex } from "./bytes";
import {
  type DrandBeacon,
  drandRandomness,
  drandRoundForClose,
  drandTime,
} from "./drand";
import { drawNumbers, drawSeed } from "./draw";
import type { Signer } from "./keys";
import { makeNickname, type Nickname } from "./nickname";
import { checkPow } from "./pow";
import {
  decodeRecord,
  encodeRecord,
  genesisHash,
  type RoundRecord,
  recordHash,
} from "./record";
import {
  type KeyRegistration,
  makeRegistration,
  registrationContent,
  sortRegistrations,
} from "./registration";
import { closeRound, isVoidRound } from "./round";
import {
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  withChange,
} from "./schedule";
import {
  EASY_TARGET,
  fakePasskey,
  fakeSignature,
  HOURLY,
  registerPasskey,
  registerRaw,
  signers,
  TEST_POW,
  ticketFor,
} from "./testing";
import {
  signTicket,
  type Ticket,
  ticketContent,
  ticketId,
  unsignedTicket,
} from "./ticket";
import {
  proveMembership,
  type VerifyOptions,
  verifyLedger,
  verifyMembership,
} from "./verify";

/** 시험은 가짜 drand 서명을 쓰므로 서명 확인을 바꿔 끼운다 */
const OPTIONS: VerifyOptions = {
  beaconVerifier: () => true,
  powParams: TEST_POW,
};

function beaconFor(schedule: Schedule, round: number): DrandBeacon {
  const { closesAt } = roundTimes(schedule, round);
  return {
    round: drandRoundForClose(closesAt),
    signature: fakeSignature(round),
  };
}

function drawFor(schedule: Schedule, round: number) {
  return drawNumbers(
    drawSeed(round, drandRandomness(beaconFor(schedule, round))),
  );
}

/** 마감 1분 뒤 루트를 로그에 올린 정상 회차 */
function loggedAt(schedule: Schedule, round: number): number {
  return roundTimes(schedule, round).closesAt + 60;
}

interface Ledger {
  schedule: Schedule;
  records: RoundRecord[];
  tickets: Ticket[][];
  registrations: KeyRegistration[][];
  people: Signer[];
}

/**
 * 3회차 장부. 회차마다 4명이 낸다: 1등(당첨 번호 그대로), 2등(5개 + 보너스), 5등, 낙첨.
 * 당첨 번호는 가짜 drand 서명에서 정해지므로 먼저 계산해 번호를 고른다.
 */
async function buildLedger(
  rounds = 3,
  schedule: Schedule = HOURLY,
): Promise<Ledger> {
  const people = await signers(4);
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  const registrations: KeyRegistration[][] = [];
  let prev = genesisHash(schedule);
  for (let round = 1; round <= rounds; round++) {
    const draw = drawFor(schedule, round);
    const miss = Array.from({ length: 45 }, (_, i) => i + 1).filter(
      (n) => !draw.numbers.includes(n) && n !== draw.bonus,
    );
    const picks = [
      draw.numbers,
      [...draw.numbers.slice(0, 5), draw.bonus],
      [...draw.numbers.slice(0, 3), ...miss.slice(0, 3)],
      miss.slice(0, 6),
    ];
    const roundTickets = await Promise.all(
      picks.map((p, i) => ticketFor(people[i] as Signer, round, p, prev)),
    );
    // 4명 모두 1회차에 열쇠를 등록한다
    const roundRegs = round === 1 ? await registerRaw(people, prev) : [];
    const record = closeRound({
      schedule,
      round,
      prev,
      tickets: roundTickets,
      registrations: roundRegs,
      rootLoggedAt: loggedAt(schedule, round),
      beacon: beaconFor(schedule, round),
    });
    records.push(record);
    tickets.push(sortedLike(record, roundTickets));
    registrations.push(sortRegistrations(roundRegs));
    prev = recordHash(record);
  }
  return { schedule, records, tickets, registrations, people };
}

/** 장부의 응모권 목록은 id 순서다 */
function sortedLike(_record: RoundRecord, list: Ticket[]): Ticket[] {
  return [...list].sort((a, b) =>
    toHex(ticketId(a)) < toHex(ticketId(b)) ? -1 : 1,
  );
}

function messages(report: {
  problems: { round: number; message: string }[];
}): string[] {
  return report.problems.map((p) => `${p.round}: ${p.message}`);
}

describe("회차 기록(바이너리)", () => {
  it("바꿨다 되돌리면 같은 기록이고, 한 바이트만 달라도 기록 해시가 다르다", async () => {
    const { records } = await buildLedger(1);
    const record = records[0] as RoundRecord;
    expect(decodeRecord(encodeRecord(record))).toEqual(record);
    expect(toHex(recordHash({ ...record, count: record.count + 1 }))).not.toBe(
      toHex(recordHash(record)),
    );
  });

  it("처음 일정표가 다르면 genesis 해시가 다르다(처음 일정표도 체인에 묶인다)", () => {
    const other = { ...HOURLY, epoch: HOURLY.epoch + 1 };
    expect(toHex(genesisHash(other))).not.toBe(toHex(genesisHash(HOURLY)));
  });
});

describe("회차 닫기", () => {
  it("1등·2등·5등·낙첨을 규칙대로 나눈다", async () => {
    const { records, tickets } = await buildLedger(1);
    const record = records[0] as RoundRecord;
    const byNumbers = new Map(
      (tickets[0] as Ticket[]).map((t) => [
        t.numbers.join(),
        toHex(ticketId(t)),
      ]),
    );
    const draw = drawFor(HOURLY, 1);
    expect(record.numbers).toEqual(draw.numbers);
    expect(record.winners[1].map(toHex)).toEqual([
      byNumbers.get(draw.numbers.join()),
    ]);
    expect(record.winners[2]).toHaveLength(1);
    expect(record.winners[3]).toHaveLength(0);
    expect(record.winners[4]).toHaveLength(0);
    expect(record.winners[5]).toHaveLength(1);
    expect(record.count).toBe(4);
  });

  it("무효 규칙: 루트를 못 올렸거나, 마감 전이거나, drand 뒤에 올렸으면 무효", () => {
    const { closesAt } = roundTimes(HOURLY, 1);
    const drandAt = drandTime(drandRoundForClose(closesAt));
    expect(isVoidRound(closesAt, 0)).toBe(true);
    expect(isVoidRound(closesAt, closesAt - 1)).toBe(true);
    expect(isVoidRound(closesAt, closesAt)).toBe(false);
    expect(isVoidRound(closesAt, drandAt - 1)).toBe(false);
    expect(isVoidRound(closesAt, drandAt)).toBe(true);
  });

  it("무효 회차는 drand 값 없이 닫히고 당첨이 없다", async () => {
    const [person] = await signers(1);
    const prev = genesisHash(HOURLY);
    const t = await ticketFor(person as Signer, 1, [1, 2, 3, 4, 5, 6], prev);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [t],
      rootLoggedAt: 0,
      beacon: null,
    });
    expect(record.void).toBe(true);
    expect(record.numbers).toEqual([]);
    expect(record.winners[1]).toEqual([]);
  });

  it("정해진 drand 회차가 아닌 값으로는 닫지 않는다", () => {
    const beacon = beaconFor(HOURLY, 1);
    expect(() =>
      closeRound({
        schedule: HOURLY,
        round: 1,
        prev: genesisHash(HOURLY),
        tickets: [],
        rootLoggedAt: loggedAt(HOURLY, 1),
        beacon: { ...beacon, round: beacon.round + 1 },
      }),
    ).toThrow("drand");
  });
});

describe("장부 검사", () => {
  it("정상 장부는 문제가 없고, 마지막 기록 해시를 돌려준다", async () => {
    const ledger = await buildLedger();
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toEqual([]);
    expect(toHex(report.head)).toBe(
      toHex(recordHash(ledger.records.at(-1) as RoundRecord)),
    );
    // 루트 로그 시각은 확인 수단을 넣지 않으면 건너뛰었다고 알린다
    expect(report.skipped.filter((s) => s.includes("로그"))).toHaveLength(3);
  });

  it("결과 뒤 응모권을 빼면 응모 수와 머클 루트가 맞지 않는다", async () => {
    const ledger = await buildLedger();
    const tickets = ledger.tickets.map((list, i) =>
      i === 1 ? list.slice(1) : list,
    );
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^2: 응모 수/),
        expect.stringMatching(/^2: .*머클 루트/),
      ]),
    );
  });

  it("결과 뒤 당첨 응모권을 끼워 넣으면 머클 루트가 맞지 않는다", async () => {
    const ledger = await buildLedger();
    const [late] = await signers(1);
    const draw = drawFor(ledger.schedule, 2);
    const extra = await ticketFor(
      late as Signer,
      2,
      draw.numbers,
      ledger.records[1]?.prev as Uint8Array,
    );
    const tickets = ledger.tickets.map((list, i) =>
      i === 1
        ? sortedLike(ledger.records[1] as RoundRecord, [...list, extra])
        : list,
    );
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^2: .*머클 루트/)]),
    );
  });

  it("지난 회차 번호를 고치면 규칙 위반이고, 다음 회차와 이어지지 않는다", async () => {
    const ledger = await buildLedger();
    const records = ledger.records.map((r, i) =>
      i === 0 ? { ...r, numbers: [1, 2, 3, 4, 5, 6] } : r,
    );
    const report = await verifyLedger(
      ledger.schedule,
      records,
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^1: 당첨 번호가 규칙대로가 아니다/),
        expect.stringMatching(/^2: 앞 기록 해시/),
      ]),
    );
  });

  it("당첨자 목록에서 1등을 빼면 드러난다", async () => {
    const ledger = await buildLedger(1);
    const record = ledger.records[0] as RoundRecord;
    const records = [{ ...record, winners: { ...record.winners, 1: [] } }];
    const report = await verifyLedger(
      ledger.schedule,
      records,
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toContain(
      "1: 1등 당첨자 목록이 규칙대로가 아니다",
    );
  });

  it("같은 열쇠가 한 회차에 두 장 내면 드러난다", async () => {
    const [person] = await signers(1);
    const prev = genesisHash(HOURLY);
    const regs = await registerRaw([person as Signer], prev);
    const a = await ticketFor(person as Signer, 1, [1, 2, 3, 4, 5, 6], prev);
    const b = await ticketFor(person as Signer, 1, [7, 8, 9, 10, 11, 12], prev);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [a, b],
      registrations: regs,
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(
      HOURLY,
      [record],
      [sortedLike(record, [a, b])],
      [regs],
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/같은 열쇠가 이 회차에 두 장/),
      ]),
    );
  });

  it("작업 증명이 틀린 응모권은 서명이 맞아도 드러난다(전부 검사)", async () => {
    const [person] = await signers(1);
    const prev = genesisHash(HOURLY);
    const regs = await registerRaw([person as Signer], prev);
    const unsigned = unsignedTicket(person as Signer, 1, [1, 2, 3, 4, 5, 6]);
    let nonce = 0;
    while (
      await checkPow(
        prev,
        ticketContent(unsigned),
        nonce,
        EASY_TARGET,
        TEST_POW,
      )
    )
      nonce++;
    const bad = await signTicket(person as Signer, unsigned, nonce);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [bad],
      registrations: regs,
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(HOURLY, [record], [[bad]], [regs], {
      ...OPTIONS,
      powSample: Infinity,
    });
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/작업 증명이 맞지 않는다/),
      ]),
    );
  });

  it("작업 증명 표본: 내 것·당첨은 늘 검사하고 나머지는 표본 밖이면 건너뛴다", async () => {
    const ledger = await buildLedger(1);
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { ...OPTIONS, powSample: 0 },
    );
    // 당첨 3장(1·2·5등)만 검사, 낙첨 1장은 건너뜀
    expect(report.powChecked).toBe(3);
    expect(report.skipped).toContain("1회차: 작업 증명 1장(표본 밖)");
    // 내 응모권으로 넣으면 낙첨 응모권도 검사한다
    const withMine = await verifyLedger(
      ledger.schedule,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      {
        ...OPTIONS,
        powSample: 0,
        mine: (ledger.tickets[0] as Ticket[]).map(ticketId),
      },
    );
    expect(withMine.powChecked).toBe(4);
  });

  it("drand 서명이 틀리면 드러난다", async () => {
    const ledger = await buildLedger(1);
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { ...OPTIONS, beaconVerifier: () => false },
    );
    expect(messages(report)).toContain("1: drand 서명이 맞지 않는다");
  });

  it("루트를 drand 뒤에 올렸는데 추첨했으면 드러난다", async () => {
    const ledger = await buildLedger(1);
    const record = ledger.records[0] as RoundRecord;
    const late = { ...record, rootLoggedAt: drandTime(record.drandRound) };
    const report = await verifyLedger(
      ledger.schedule,
      [late],
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toContain(
      "1: 루트 기록 시각으로는 무효 회차인데 추첨했다",
    );
  });

  it("기록이 빠지거나 순서가 바뀌면 이어지지 않는다", async () => {
    const ledger = await buildLedger();
    const report = await verifyLedger(
      ledger.schedule,
      [ledger.records[0], ledger.records[2]] as RoundRecord[],
      [ledger.tickets[0], ledger.tickets[2]] as Ticket[][],
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        "2: 회차 번호가 2여야 하는데 3다",
        "2: 앞 기록 해시와 이어지지 않는다(장부가 바뀌었다)",
      ]),
    );
  });
});

describe("일정 변경", () => {
  const twoHours = (fromRound: number): ScheduleEntry => ({
    fromRound,
    length: 7200,
    closeMargin: 60,
    powTarget: EASY_TARGET,
    registerPowTarget: EASY_TARGET,
  });

  it("24시간 뒤 회차부터의 변경은 반영되고, 그보다 이른 변경은 드러난다", async () => {
    const ledger = await buildLedger(1);
    const record = ledger.records[0] as RoundRecord;
    const ok = await verifyLedger(
      ledger.schedule,
      [{ ...record, scheduleChanges: [twoHours(26)] }],
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(ok)).toEqual([]);
    expect(ok.schedule).toEqual(withChange(HOURLY, twoHours(26)));
    const early = await verifyLedger(
      ledger.schedule,
      [{ ...record, scheduleChanges: [twoHours(10)] }],
      ledger.tickets,
      ledger.registrations,
      OPTIONS,
    );
    expect(messages(early)).toContain(
      "1: 일정 변경: 일정 변경은 24시간 뒤에 시작하는 회차부터",
    );
  });
});

describe("시험 → 정식 이어지는 장부", () => {
  // 응모 없는 회차를 이어 붙인다: 1회차 기록에 26회차부터 정식 단계 한 줄
  const trial: Schedule = {
    epoch: HOURLY.epoch,
    entries: [{ ...(HOURLY.entries[0] as ScheduleEntry), phase: "trial" }],
  };
  const liveFrom26: ScheduleEntry = {
    ...(HOURLY.entries[0] as ScheduleEntry),
    fromRound: 26,
    phase: "live",
  };
  function chain(rounds: number, change: ScheduleEntry): RoundRecord[] {
    let schedule = trial;
    let prev = genesisHash(trial);
    const records: RoundRecord[] = [];
    for (let round = 1; round <= rounds; round++) {
      const { closesAt } = roundTimes(schedule, round);
      const record = closeRound({
        schedule,
        round,
        prev,
        tickets: [],
        rootLoggedAt: closesAt + 10,
        beacon: beaconFor(schedule, round),
        ...(round === 1 ? { scheduleChanges: [change] } : {}),
      });
      if (round === 1) schedule = withChange(schedule, change);
      records.push(record);
      prev = recordHash(record);
    }
    return records;
  }

  it("한 사슬로 정식 단계에 들어가고 검사를 통과한다", async () => {
    const records = chain(27, liveFrom26);
    const report = await verifyLedger(
      trial,
      records,
      records.map(() => []),
      records.map(() => []),
      OPTIONS,
    );
    expect(messages(report)).toEqual([]);
    expect(report.schedule.entries.map((e) => e.phase)).toEqual([
      "trial",
      "live",
    ]);
    // 기록 바이트에도 단계가 실린다
    const first = records[0] as RoundRecord;
    expect(decodeRecord(encodeRecord(first))).toEqual(first);
    expect(decodeRecord(encodeRecord(first)).scheduleChanges[0]?.phase).toBe(
      "live",
    );
  });

  it("24시간보다 이른 정식 예약은 드러난다", async () => {
    const records = chain(1, { ...liveFrom26, fromRound: 20 });
    const report = await verifyLedger(trial, records, [[]], [[]], OPTIONS);
    expect(messages(report)).toEqual([
      "1: 일정 변경: 일정 변경은 24시간 뒤에 시작하는 회차부터",
    ]);
  });
});

describe("내 응모권 포함 증명", () => {
  it("내 응모권이 그 회차 루트에 들어 있음을 증명하고, 남의 루트로는 통과하지 못한다", async () => {
    const ledger = await buildLedger(2);
    const mine = (ledger.tickets[0] as Ticket[])[2] as Ticket;
    const membership = proveMembership(
      ledger.tickets[0] as Ticket[],
      ticketId(mine),
    );
    expect(membership).not.toBeNull();
    expect(
      verifyMembership(
        ticketId(mine),
        membership as NonNullable<typeof membership>,
        (ledger.records[0] as RoundRecord).merkleRoot,
      ),
    ).toBe(true);
    expect(
      verifyMembership(
        ticketId(mine),
        membership as NonNullable<typeof membership>,
        (ledger.records[1] as RoundRecord).merkleRoot,
      ),
    ).toBe(false);
    expect(
      proveMembership(ledger.tickets[1] as Ticket[], ticketId(mine)),
    ).toBeNull();
  });
});

describe("열쇠 등록", () => {
  it("등록하지 않은 열쇠의 응모권은 드러난다", async () => {
    const [person] = await signers(1);
    const prev = genesisHash(HOURLY);
    const t = await ticketFor(person as Signer, 1, [1, 2, 3, 4, 5, 6], prev);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [t],
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(HOURLY, [record], [[t]], [[]], OPTIONS);
    expect(messages(report)).toEqual([
      expect.stringMatching(/^1: 응모권 .*: 등록되지 않은 열쇠$/),
    ]);
  });

  it("결과 뒤 등록을 빼면 등록 수·루트가 맞지 않고 그 열쇠의 응모권도 드러난다", async () => {
    const ledger = await buildLedger(1);
    const report = await verifyLedger(
      ledger.schedule,
      ledger.records,
      ledger.tickets,
      [(ledger.registrations[0] as KeyRegistration[]).slice(1)],
      OPTIONS,
    );
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        "1: 등록 수가 3인데 기록은 4",
        "1: 등록 목록으로 만든 머클 루트가 기록과 다르다",
        expect.stringMatching(/등록되지 않은 열쇠/),
      ]),
    );
  });

  it("같은 열쇠를 두 번 등록하거나, 같은 패스키 번호를 다른 열쇠로 등록하면 드러난다", async () => {
    const prev = genesisHash(HOURLY);
    const [person] = (await signers(1)) as [Signer];
    const [first] = await registerRaw([person], prev);
    const again = (await makeRegistration(
      person,
      "raw",
      new Uint8Array(),
      prev,
      EASY_TARGET,
      { params: TEST_POW, start: (first as KeyRegistration).nonce + 1 },
    )) as KeyRegistration;
    const a = await fakePasskey();
    const b = await fakePasskey();
    const regA = await registerPasskey(a, prev);
    const regB = await registerPasskey(
      { ...b, credentialId: a.credentialId },
      prev,
    );
    const regs = sortRegistrations([
      first as KeyRegistration,
      again,
      regA,
      regB,
    ]);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [],
      registrations: regs,
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(HOURLY, [record], [[]], [regs], OPTIONS);
    expect(messages(report)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/이미 등록된 열쇠$/),
        expect.stringMatching(/이미 등록된 패스키 번호$/),
      ]),
    );
    expect(report.keys).toHaveLength(2);
  });

  it("등록 작업 증명이 틀리면 드러난다", async () => {
    const prev = genesisHash(HOURLY);
    const [person] = (await signers(1)) as [Signer];
    const unsolved = {
      v: 1,
      kind: "raw" as const,
      credentialId: new Uint8Array(),
      pub: person.publicKey,
    };
    let nonce = 0;
    while (
      await checkPow(
        prev,
        registrationContent(unsolved),
        nonce,
        EASY_TARGET,
        TEST_POW,
      )
    )
      nonce++;
    const regs = [{ ...unsolved, nonce }];
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [],
      registrations: regs,
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(HOURLY, [record], [[]], [regs], OPTIONS);
    expect(messages(report)).toEqual([
      expect.stringMatching(/^1: 등록 .*: 작업 증명이 맞지 않는다$/),
    ]);
  });

  it("패스키로 등록하고 응모한 장부는 통과하고, 패스키 번호로 공개 열쇠를 찾을 수 있다", async () => {
    const prev = genesisHash(HOURLY);
    const passkey = await fakePasskey();
    const reg = await registerPasskey(passkey, prev);
    const t = await ticketFor(passkey.signer, 1, [1, 2, 3, 4, 5, 6], prev);
    const record = closeRound({
      schedule: HOURLY,
      round: 1,
      prev,
      tickets: [t],
      registrations: [reg],
      rootLoggedAt: loggedAt(HOURLY, 1),
      beacon: beaconFor(HOURLY, 1),
    });
    const report = await verifyLedger(
      HOURLY,
      [record],
      [[t]],
      [[reg]],
      OPTIONS,
    );
    expect(messages(report)).toEqual([]);
    const found = report.keys.find(
      (k) => toHex(k.credentialId) === toHex(passkey.credentialId),
    );
    expect(toHex(found?.pub as Uint8Array)).toBe(
      toHex(passkey.signer.publicKey),
    );
  });
});

describe("별명 남기기", () => {
  /**
   * 회차마다 별명을 넣어 장부를 처음부터 다시 닫는다. 기록 해시가 바뀌면 다음 회차의
   * 작업 증명 문제 값도 바뀌므로, 2회차부터는 같은 사람·같은 번호로 응모권을 다시 만든다.
   */
  async function rechain(ledger: Ledger, nicknamesByRound: Nickname[][]) {
    let prev = genesisHash(ledger.schedule);
    const records: RoundRecord[] = [];
    const tickets: Ticket[][] = [];
    for (let i = 0; i < ledger.records.length; i++) {
      const round = i + 1;
      const old = ledger.tickets[i] as Ticket[];
      const list =
        i === 0
          ? old
          : await Promise.all(
              old.map((t) => {
                const who = ledger.people.find(
                  (p) => toHex(p.publicKey) === toHex(t.pub),
                ) as Signer;
                return ticketFor(who, round, t.numbers, prev);
              }),
            );
      const record = closeRound({
        schedule: ledger.schedule,
        round,
        prev,
        tickets: list,
        registrations: ledger.registrations[i] as KeyRegistration[],
        rootLoggedAt: loggedAt(ledger.schedule, round),
        beacon: beaconFor(ledger.schedule, round),
        nicknames: nicknamesByRound[i] ?? [],
      });
      records.push(record);
      tickets.push(sortedLike(record, list));
      prev = recordHash(record);
    }
    return { records, tickets };
  }

  async function check(ledger: Ledger, nicknamesByRound: Nickname[][]) {
    const { records, tickets } = await rechain(ledger, nicknamesByRound);
    return verifyLedger(
      ledger.schedule,
      records,
      tickets,
      ledger.registrations,
      OPTIONS,
    );
  }

  /** 1회차의 1등 응모권(사람 0)과 낙첨 응모권(사람 3) */
  function round1(ledger: Ledger) {
    const list = ledger.tickets[0] as Ticket[];
    const byPerson = (k: number) =>
      list.find(
        (t) => toHex(t.pub) === toHex((ledger.people[k] as Signer).publicKey),
      ) as Ticket;
    return { first: byPerson(0), loser: byPerson(3) };
  }

  it("지난 회차 1등이 자기 열쇠로 남긴 별명은 통과한다", async () => {
    const ledger = await buildLedger(2);
    const { first } = round1(ledger);
    const nick = await makeNickname(
      ledger.people[0] as Signer,
      first,
      "  철수 ",
    );
    expect(nick.nickname).toBe("철수");
    const { records } = await rechain(ledger, [[], [nick]]);
    expect(decodeRecord(encodeRecord(records[1] as RoundRecord))).toEqual(
      records[1],
    );
    const report = await check(ledger, [[], [nick]]);
    expect(messages(report)).toEqual([]);
    expect(report.nicknames.map((n) => n.nickname)).toEqual(["철수"]);
  });

  it("낙첨 응모권, 남의 열쇠 서명, 같은 회차 기록에 넣은 별명은 드러난다", async () => {
    const ledger = await buildLedger(2);
    const { first, loser } = round1(ledger);
    const loserNick = await makeNickname(
      ledger.people[3] as Signer,
      loser,
      "영희",
    );
    const stolen = await makeNickname(
      ledger.people[1] as Signer,
      first,
      "가로챔",
    );
    const sameRound = await makeNickname(
      ledger.people[0] as Signer,
      first,
      "철수",
    );
    const report = await check(ledger, [[sameRound], [loserNick]]);
    expect(messages(report)).toEqual([
      expect.stringMatching(/^1: 별명 .*: 지난 회차 당첨 응모권이 아니다$/),
      expect.stringMatching(/^2: 별명 .*: 지난 회차 당첨 응모권이 아니다$/),
    ]);
    const stolenReport = await check(ledger, [[], [stolen]]);
    expect(messages(stolenReport)).toEqual([
      expect.stringMatching(/^2: 별명 .*: 서명이 맞지 않는다$/),
    ]);
  });

  it("한 응모권에 별명은 한 번", async () => {
    const ledger = await buildLedger(3);
    const { first } = round1(ledger);
    const signer = ledger.people[0] as Signer;
    const report = await check(ledger, [
      [],
      [await makeNickname(signer, first, "철수")],
      [await makeNickname(signer, first, "다시 철수")],
    ]);
    expect(messages(report)).toEqual([
      expect.stringMatching(/^3: 별명 .*: 이미 별명을 남긴 응모권$/),
    ]);
  });

  it("별명은 NFC로 맞추고, 20자를 넘거나 보이지 않는 글자가 있으면 만들지 않는다", async () => {
    const ledger = await buildLedger(1);
    const { first } = round1(ledger);
    const signer = ledger.people[0] as Signer;
    // "철" 을 자모로 풀어 쓴(NFD) 글자도 NFC 한 글자로 맞춘다
    const nfd = "철수".normalize("NFD");
    expect(nfd).not.toBe("철수");
    expect((await makeNickname(signer, first, nfd)).nickname).toBe("철수");
    await expect(makeNickname(signer, first, "가".repeat(21))).rejects.toThrow(
      "별명은 1~20자",
    );
    await expect(makeNickname(signer, first, "철​수")).rejects.toThrow(
      "보이지 않는 글자",
    );
  });
});
