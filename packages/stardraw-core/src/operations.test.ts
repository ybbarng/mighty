import { beforeAll, describe, expect, it } from "vitest";
import { equalBytes, toHex } from "./bytes";
import { generateSigner, type Signer } from "./keys";
import {
  type AffiliationFields,
  decodeOperation,
  directorFingerprint,
  directorHistory,
  directorKeyConfig,
  encodeOperation,
  newOpsState,
  OP_VERSION,
  type OpBody,
  type Operation,
  operationsView,
  opId,
  parseDirectorKeys,
  scheduleFromRecords,
  sealDesignations,
  selectOperations,
  signAsDirector,
  signAsSeal,
} from "./operations";
import {
  decodeRecord,
  encodeRecord,
  genesisHash,
  type RoundRecord,
  recordHash,
} from "./record";
import type { KeyRegistration } from "./registration";
import { closeRound } from "./round";
import { roundTimes, type Schedule, type ScheduleEntry } from "./schedule";
import type { SoftPasskey } from "./signature";
import { HOURLY, registerKeys, signers, TEST_POW } from "./testing";
import { verifyLedger } from "./verify";

/**
 * 운영 기록(docs/36 11-12). 시험 장부는 1시간 회차의 빈 무효 회차로 빠르게 잇는다(drand·작업 증명 없음).
 * 1시간 회차라 회차 k 기록의 가장 이른 효력 회차는 k + 25다(마감 + 24시간 뒤에 열리는 회차)
 */

const TEST_FIELDS: AffiliationFields = {
  name: "시험 성단",
  badge: 2,
  method: "초대 코드",
  issuerKey: new Uint8Array(),
  issued: 0,
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

class Chain {
  records: RoundRecord[] = [];
  regs: KeyRegistration[][] = [];
  constructor(readonly genesis: Schedule = HOURLY) {}

  head(): Uint8Array {
    const last = this.records.at(-1);
    return last ? recordHash(last) : genesisHash(this.genesis);
  }

  get next(): number {
    return this.records.length + 1;
  }

  /** 다음 회차를 운영 기록·등록과 함께 닫는다(일정표는 지금까지 검사한 것) */
  async close(
    operations: Operation[] = [],
    registrations: KeyRegistration[] = [],
    scheduleChanges: ScheduleEntry[] = [],
  ): Promise<void> {
    const schedule = (await this.report()).schedule;
    this.records.push(
      closeRound({
        schedule,
        round: this.next,
        prev: this.head(),
        tickets: [],
        registrations,
        rootLoggedAt: 0,
        beacon: null,
        operations,
        scheduleChanges,
      }),
    );
    this.regs.push(registrations);
  }

  /** 빈 회차를 round 앞까지 닫는다(다음 기록이 round가 되게) */
  async until(round: number): Promise<void> {
    while (this.next < round) await this.close();
  }

  report() {
    return verifyLedger(
      this.genesis,
      this.records,
      this.records.map(() => []),
      this.regs,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
  }

  async problems(): Promise<string[]> {
    return (await this.report()).problems.map(
      (p) => `${p.round}: ${p.message}`,
    );
  }

  body(b: DistributiveOmit<OpBody, "v" | "after">): OpBody {
    return { v: OP_VERSION, after: this.head(), ...b } as OpBody;
  }
}

let seal: Signer;
let director: SoftPasskey;
let stranger: SoftPasskey;
beforeAll(async () => {
  seal = await generateSigner();
  [director, stranger] = (await signers(2)) as [SoftPasskey, SoftPasskey];
});

const designate = (c: Chain, who: SoftPasskey, effectiveRound = c.next + 25) =>
  signAsSeal(
    c.body({
      kind: "director-add",
      effectiveRound,
      credentialId: who.credentialId,
      pub: who.publicKey,
    }),
    seal,
  );

/** 1회차에 국장 지정 → 26회차부터 국장 */
async function withDirector(): Promise<Chain> {
  const c = new Chain();
  await c.close([await designate(c, director)]);
  await c.until(26);
  return c;
}

const addAffiliation = (
  c: Chain,
  signer: SoftPasskey,
  effectiveRound = c.next + 25,
) =>
  signAsDirector(
    c.body({ kind: "affiliation-add", effectiveRound, fields: TEST_FIELDS }),
    signer,
  );

describe("운영 기록 바이트", () => {
  it("운영 기록과 v2 기록은 바이트로 오가고, 운영 기록이 없는 기록은 지금처럼 v1이다", async () => {
    const c = new Chain();
    await c.close();
    expect(c.records[0]?.v).toBe(1);
    expect(c.records[0]?.operations).toBeUndefined();
    const op = await designate(c, director);
    expect(decodeOperation(encodeOperation(op))).toEqual(op);
    await c.close([op]);
    const record = c.records[1] as RoundRecord;
    expect(record.v).toBe(2);
    expect(decodeRecord(encodeRecord(record))).toEqual(record);
    // v2인데 운영 기록이 없으면 쓰지도 읽지도 않는다
    expect(() => encodeRecord({ ...record, operations: [] })).toThrow();
    const { operations: _ops, ...rest } = record;
    const v1 = encodeRecord({ ...rest, v: 1 });
    const empty = new Uint8Array([...v1, 0, 0]);
    empty[0] = 2;
    expect(() => decodeRecord(empty)).toThrow(/운영 기록이 하나 이상/);
  });

  it("국장 열쇠 지문과 설정 값", () => {
    const fp = directorFingerprint(director.publicKey);
    expect(fp).toMatch(
      /^국장-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    expect(directorFingerprint(stranger.publicKey)).not.toBe(fp);
    const text = directorKeyConfig(director.credentialId, director.publicKey);
    const [parsed] = parseDirectorKeys(` ${text} ,`);
    expect(equalBytes(parsed?.pub as Uint8Array, director.publicKey)).toBe(
      true,
    );
    expect(() => parseDirectorKeys("abc")).toThrow(/모양이 아니다/);
  });
});

describe("국장이 일하는 길", () => {
  it("관인 지정 → 24시간 뒤 국장 → 소속 추가 → 24시간 뒤 적용, 장부 검사를 통과하고 내력에 남는다", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    await c.close([op]);
    let view = operationsView(
      (await c.report()).operations,
      c.records.length,
      c.head(),
    );
    expect(view.affiliations).toEqual([]);
    expect(view.operations.at(-1)).toMatchObject({
      status: "pending",
      round: 26,
      effectiveRound: 51,
    });
    await c.until(52);
    const report = await c.report();
    expect(report.problems).toEqual([]);
    view = operationsView(report.operations, c.records.length, c.head());
    expect(view.sealKey).not.toBeNull();
    expect(view.affiliations).toMatchObject([
      {
        id: toHex(opId(op)),
        name: "시험 성단",
        badgeName: "성단",
        method: "초대 코드",
        issued: 0,
        from: 51,
        until: null,
      },
    ]);
    expect(view.directors).toMatchObject([
      { fingerprint: directorFingerprint(director.publicKey), from: 26 },
    ]);
    expect(directorHistory(report.operations)).toMatchObject([
      {
        round: 1,
        action: "지정",
        signedBy: "관인",
        effectiveRound: 26,
        status: "applied",
      },
    ]);
  });

  it("국장이 예고 중인 기록을 취소하면 효력이 생기지 않는다", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    await c.close([op]);
    await c.close([
      await signAsDirector(
        c.body({ kind: "cancel", effectiveRound: 0, target: opId(op) }),
        director,
      ),
    ]);
    await c.until(52);
    const report = await c.report();
    expect(report.problems).toEqual([]);
    const view = operationsView(report.operations, c.records.length, c.head());
    expect(view.affiliations).toEqual([]);
    expect(view.operations.find((o) => o.id === toHex(opId(op)))).toMatchObject(
      { status: "cancelled", cancelledIn: 27 },
    );
  });

  it("정식 시작 예약(일정 바꾸기)은 예고 중 하나만, 취소하면 일정표에서 빠진다", async () => {
    const c = await withDirector();
    const from = c.next + 30;
    const entry: ScheduleEntry = {
      ...(HOURLY.entries[0] as ScheduleEntry),
      fromRound: from,
      length: 7200,
    };
    const schedOp = await signAsDirector(
      c.body({ kind: "schedule", effectiveRound: from, entry }),
      director,
    );
    await c.close([schedOp]);
    expect((await c.report()).schedule.entries).toHaveLength(2);
    expect(scheduleFromRecords(HOURLY, c.records)).toEqual(
      (await c.report()).schedule,
    );
    // 예고 중에는 다른 일정 바꾸기(운영 기록·옛 칸 모두)를 받지 않는다
    const second = await signAsDirector(
      c.body({
        kind: "schedule",
        effectiveRound: from + 5,
        entry: { ...entry, fromRound: from + 5 },
      }),
      director,
    );
    await c.close([second], [], [{ ...entry, fromRound: from + 6 }]);
    const problems = (await c.problems()).join("\n");
    expect(problems).toMatch(/이미 예고 중인 일정 바꾸기가 있다/);
    expect(problems).toMatch(/일정 변경: 일정 바꾸기 예고 중에는/);
    c.records.pop();
    c.regs.pop();
    await c.close([
      await signAsDirector(
        c.body({ kind: "cancel", effectiveRound: 0, target: opId(schedOp) }),
        director,
      ),
    ]);
    const report = await c.report();
    expect(report.problems).toEqual([]);
    expect(report.schedule.entries).toHaveLength(1);
    expect(scheduleFromRecords(HOURLY, c.records)).toEqual(report.schedule);
    expect(
      roundTimes(report.schedule, from + 1).closesAt -
        roundTimes(report.schedule, from).closesAt,
    ).toBe(3600);
  });
});

describe("공격: 모두 거절된다", () => {
  it("국장 패스키 없이(지정 효력 전에) 서명", async () => {
    const c = new Chain();
    await c.close([await designate(c, director)]);
    await c.until(25);
    await c.close([await addAffiliation(c, director)]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/^25: 운영 기록 .*국장 열쇠가 아니다/),
    ]);
  });

  it("다른(지정되지 않은) 패스키로 서명", async () => {
    const c = await withDirector();
    await c.close([await addAffiliation(c, stranger)]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/국장 열쇠가 아니다/),
    ]);
  });

  it("예전 서명 재사용: 26회차 자리에서 한 서명을 27회차 기록에 넣는다", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    await c.close();
    await c.close([op]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/^27: .*다른 자리.*재사용/),
    ]);
  });

  it("같은 운영 기록을 다시 싣기", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    await c.close([op]);
    // 같은 본문을 다음 자리에서 다시 서명해도 after가 달라 다른 id다. 같은 바이트를 그대로 다시 넣으면 걸린다
    await c.close([op]);
    expect((await c.problems()).join()).toMatch(/이미 실린 운영 기록/);
  });

  it("서명 뒤 내용 바꾸기", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    const tampered = {
      ...op,
      fields: { ...TEST_FIELDS, name: "가짜 성단" },
    } as Operation;
    await c.close([tampered]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/서명이 맞지 않는다/),
    ]);
  });

  it("예고 없이 바로 적용(효력 회차를 다음 회차로)", async () => {
    const c = await withDirector();
    await c.close([await addAffiliation(c, director, c.next + 1)]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/24시간 예고가 모자란다\(효력은 51회차부터/),
    ]);
  });

  it("이미 적용된 기록 취소", async () => {
    const c = await withDirector();
    const op = await addAffiliation(c, director);
    await c.close([op]);
    await c.until(51);
    await c.close([
      await signAsDirector(
        c.body({ kind: "cancel", effectiveRound: 0, target: opId(op) }),
        director,
      ),
    ]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/^51: .*이미 효력이 생긴/),
    ]);
  });

  it("관인이 소속을 추가하거나, 관인 열쇠를 바꿔치기", async () => {
    const c = await withDirector();
    const other = await generateSigner();
    await c.close([
      await signAsSeal(
        c.body({
          kind: "affiliation-add",
          effectiveRound: c.next + 25,
          fields: TEST_FIELDS,
        }),
        seal,
      ),
    ]);
    await c.close([
      await signAsSeal(
        c.body({
          kind: "director-add",
          effectiveRound: c.next + 25,
          credentialId: stranger.credentialId,
          pub: stranger.publicKey,
        }),
        other,
      ),
    ]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/관인은 이 운영 기록에 서명할 수 없다/),
      expect.stringMatching(/관인 열쇠가 장부에 처음 실린 관인과 다르다/),
    ]);
  });

  it("국장 열쇠와 우주인 열쇠를 섞기: 등록된 우주인을 국장으로, 국장 열쇠를 우주인으로", async () => {
    const c = new Chain();
    const [entrantReg] = await registerKeys([stranger], c.head());
    await c.close([], [entrantReg as KeyRegistration]);
    await c.close([await designate(c, stranger), await designate(c, director)]);
    const [directorReg] = await registerKeys([director], c.head());
    await c.close([], [directorReg as KeyRegistration]);
    expect(await c.problems()).toEqual([
      expect.stringMatching(/^2: .*우주인으로 등록된 열쇠·패스키는 국장으로/),
      expect.stringMatching(
        /^3: 등록 .*국장으로 지정된 열쇠·패스키는 우주인으로/,
      ),
    ]);
  });
});

describe("서버·연습 장부가 쓰는 고르기", () => {
  it("selectOperations는 검사기와 같은 규칙으로 맞는 것만 id 순으로 고른다", async () => {
    const c = await withDirector();
    const state = (await c.report()).operations;
    const good = await addAffiliation(c, director);
    const bad = await addAffiliation(c, stranger);
    const { accepted, rejected } = await selectOperations(
      state,
      c.next,
      c.head(),
      [bad, good, good],
      {
        isEntrant: () => false,
      },
    );
    expect(accepted).toEqual([good]);
    expect(rejected.map((r) => r.problem)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/국장 열쇠가 아니다/),
        "이미 받은 운영 기록이다",
      ]),
    );
  });

  it("sealDesignations: 설정에 있고 장부에 없는 열쇠는 지정, 설정에서 빠진 예고 중 관인 지정은 관인이 취소", async () => {
    const c = new Chain();
    const ctx = { isEntrant: () => false };
    const key = {
      credentialId: director.credentialId,
      pub: director.publicKey,
    };
    const first = sealDesignations(
      newOpsState(HOURLY),
      1,
      c.head(),
      [key],
      ctx,
    );
    expect(first.bodies).toMatchObject([
      { kind: "director-add", effectiveRound: 26 },
    ]);
    await c.close([await signAsSeal(first.bodies[0] as OpBody, seal)]);
    let state = (await c.report()).operations;
    expect(sealDesignations(state, 2, c.head(), [key], ctx).bodies).toEqual([]);
    const removed = sealDesignations(state, 2, c.head(), [], ctx);
    expect(removed.bodies).toMatchObject([
      { kind: "cancel", effectiveRound: 0 },
    ]);
    await c.close([await signAsSeal(removed.bodies[0] as OpBody, seal)]);
    state = (await c.report()).operations;
    expect(await c.problems()).toEqual([]);
    // 취소된 열쇠는 설정에 다시 넣어도 싣지 않는다
    expect(
      sealDesignations(state, 3, c.head(), [key], ctx).skipped,
    ).toMatchObject([{ reason: "지정이 취소된 적 있는 열쇠" }]);
  });
});
