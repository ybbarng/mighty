import { beforeAll, describe, expect, it } from "vitest";
import { toHex } from "./bytes";
import { generateSigner, type Signer } from "./keys";
import {
  type AffiliationFields,
  OP_VERSION,
  type OpBody,
  type Operation,
  operationsView,
  opId,
  signAsDirector,
  signAsSeal,
} from "./operations";
import {
  blindStampRequest,
  newIssuerKey,
  newQualSeed,
  type QualHolding,
  qualKeyFromSeed,
  STAMP_SCHEME_BLS,
  signBlinded,
  unblindStamp,
} from "./qualification";
import { genesisHash, type RoundRecord, recordHash } from "./record";
import { type KeyRegistration, sortRegistrations } from "./registration";
import { closeRound } from "./round";
import { roundTimes, type Schedule } from "./schedule";
import type { SoftPasskey } from "./signature";
import {
  EASY_TARGET,
  HOURLY,
  registerKeys,
  signers,
  TEST_POW,
} from "./testing";
import { makeTicket, type Ticket, ticketId } from "./ticket";
import { verifyLedger } from "./verify";

/**
 * 상품 자격 장부 흐름(docs/36 11-13): 국장 지정 → 소속 추가 → 자격 기간 열기 → 블라인드 발급 → v2 응모 →
 * 상품 대상 판정. 시험 장부는 1시간 회차의 무효 회차(drand 없음)로 빠르게 잇는다. 무효 회차도 응모권과
 * 상품 대상 판정은 그대로 계산된다(당첨자만 없다)
 */

const FIELDS: AffiliationFields = {
  name: "벌집 성단",
  badge: 2,
  method: "기관 계정",
  issuerKey: new Uint8Array(),
  issued: 0,
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

class Chain {
  records: RoundRecord[] = [];
  regs: KeyRegistration[][] = [];
  tickets: Ticket[][] = [];
  constructor(readonly genesis: Schedule = HOURLY) {}

  head(): Uint8Array {
    const last = this.records.at(-1);
    return last ? recordHash(last) : genesisHash(this.genesis);
  }

  get next(): number {
    return this.records.length + 1;
  }

  async close(
    operations: Operation[] = [],
    tickets: Ticket[] = [],
    registrations: KeyRegistration[] = [],
  ): Promise<void> {
    const schedule = (await this.report()).schedule;
    this.records.push(
      closeRound({
        schedule,
        round: this.next,
        prev: this.head(),
        tickets,
        registrations,
        rootLoggedAt: 0,
        beacon: null,
        operations,
      }),
    );
    this.regs.push(sortRegistrations(registrations));
    this.tickets.push(
      [...tickets].sort((a, b) => cmp(ticketId(a), ticketId(b))),
    );
  }

  async until(round: number): Promise<void> {
    while (this.next < round) await this.close();
  }

  report() {
    return verifyLedger(this.genesis, this.records, this.tickets, this.regs, {
      beaconVerifier: () => true,
      powParams: TEST_POW,
      powSample: Number.POSITIVE_INFINITY,
    });
  }

  async problems(): Promise<string[]> {
    return (await this.report()).problems.map(
      (p) => `${p.round}: ${p.message}`,
    );
  }

  body(b: DistributiveOmit<OpBody, "v" | "after">): OpBody {
    return { v: OP_VERSION, after: this.head(), ...b } as OpBody;
  }

  closesAt(round: number): number {
    return roundTimes(this.genesis, round).closesAt;
  }
}

function cmp(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

let seal: Signer;
let director: SoftPasskey;
let entrants: SoftPasskey[];
beforeAll(async () => {
  seal = await generateSigner();
  const all = await signers(5);
  director = all[0] as SoftPasskey;
  entrants = all.slice(1);
});

/** 서버가 하는 발급(가린 값에 찍기)을 그대로 흉내 낸다 */
function issue(secretKey: Uint8Array, periodId: Uint8Array): QualHolding {
  const seed = newQualSeed();
  const request = blindStampRequest(periodId, qualKeyFromSeed(seed).publicKey);
  return {
    periodId,
    seed,
    stamp: unblindStamp(
      signBlinded(secretKey, request.blinded),
      request.factor,
    ),
  };
}

async function ticket(
  c: Chain,
  who: SoftPasskey,
  numbers: number[],
  qual: QualHolding | null,
): Promise<Ticket> {
  const t = await makeTicket(
    who,
    c.next,
    numbers,
    c.head(),
    EASY_TARGET,
    { params: TEST_POW },
    qual,
  );
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

/**
 * 1회차: 국장 지정(5회차부터)과 응모자 등록 → 5회차: 소속 추가(9회차부터) → 9회차: 자격 기간 열기(13회차부터).
 * 13회차부터 도장을 받고 응모권에 붙인다
 */
async function withPeriod() {
  const c = new Chain();
  const regs = await registerKeys(entrants, c.head());
  await c.close(
    [
      await signAsSeal(
        c.body({
          kind: "director-add",
          effectiveRound: 5,
          credentialId: director.credentialId,
          pub: director.publicKey,
        }),
        seal,
      ),
    ],
    [],
    regs,
  );
  await c.until(5);
  const add = await signAsDirector(
    c.body({ kind: "affiliation-add", effectiveRound: 9, fields: FIELDS }),
    director,
  );
  await c.close([add]);
  await c.until(9);
  const issuer = newIssuerKey();
  const period = await signAsDirector(
    c.body({
      kind: "qual-period",
      effectiveRound: 13,
      affiliation: opId(add),
      number: 1,
      startsAt: c.closesAt(1),
      endsAt: c.closesAt(1) + 365 * 24 * 3600,
      scheme: STAMP_SCHEME_BLS,
      issuerKey: issuer.publicKey,
    }),
    director,
  );
  await c.close([period]);
  await c.until(13);
  return { c, issuer, periodId: opId(period), affiliationId: opId(add) };
}

const issued = (c: Chain, periodId: Uint8Array, n: number) =>
  signAsSeal(
    c.body({
      kind: "qual-issued",
      effectiveRound: 0,
      period: periodId,
      issued: n,
    }),
    seal,
  );

describe("자격 기간 열기와 발급 수(운영 기록 kind 8·9)", () => {
  it("국장이 연 기간은 3회차 예고 뒤 효력이 생기고, 관인이 발급 수를 싣는다", async () => {
    const { c, periodId } = await withPeriod();
    await c.close([await issued(c, periodId, 2)]);
    expect(await c.problems()).toEqual([]);
    const report = await c.report();
    const view = operationsView(report.operations, c.records.length, c.head());
    expect(view.periods).toHaveLength(1);
    expect(view.periods[0]).toMatchObject({
      affiliationName: "벌집 성단",
      number: 1,
      from: 13,
      issued: 2,
    });
  });

  it("발급 수는 국장이 실을 수 없고, 줄일 수 없다", async () => {
    const { c, periodId } = await withPeriod();
    await c.close([await issued(c, periodId, 3)]);
    const byDirector = await signAsDirector(
      c.body({
        kind: "qual-issued",
        effectiveRound: 0,
        period: periodId,
        issued: 5,
      }),
      director,
    );
    await c.close([byDirector]);
    await c.close([await issued(c, periodId, 2)]);
    const problems = await c.problems();
    expect(problems.some((p) => p.includes("발급 수는 관인만"))).toBe(true);
    expect(problems.some((p) => p.includes("발급 수는 늘기만"))).toBe(true);
  });

  it("같은 소속의 기간은 겹치지 않고, 도장 열쇠는 다시 쓰지 않는다", async () => {
    const { c, issuer, affiliationId } = await withPeriod();
    const overlap = await signAsDirector(
      c.body({
        kind: "qual-period",
        effectiveRound: c.next + 4,
        affiliation: affiliationId,
        number: 2,
        startsAt: c.closesAt(1) + 100,
        endsAt: c.closesAt(1) + 400 * 24 * 3600,
        scheme: STAMP_SCHEME_BLS,
        issuerKey: newIssuerKey().publicKey,
      }),
      director,
    );
    await c.close([overlap]);
    const reused = await signAsDirector(
      c.body({
        kind: "qual-period",
        effectiveRound: c.next + 4,
        affiliation: affiliationId,
        number: 3,
        startsAt: c.closesAt(1) + 365 * 24 * 3600,
        endsAt: c.closesAt(1) + 700 * 24 * 3600,
        scheme: STAMP_SCHEME_BLS,
        issuerKey: issuer.publicKey,
      }),
      director,
    );
    await c.close([reused]);
    const problems = await c.problems();
    expect(problems.some((p) => p.includes("다른 기간과 겹친다"))).toBe(true);
    expect(problems.some((p) => p.includes("다른 기간에 쓴 도장 열쇠"))).toBe(
      true,
    );
  });

  it("소속의 자격 열쇠·발급 수 칸은 비워 둔다", async () => {
    const { c } = await withPeriod();
    const filled = await signAsDirector(
      c.body({
        kind: "affiliation-add",
        effectiveRound: c.next + 4,
        fields: {
          ...FIELDS,
          name: "다른 성단",
          issuerKey: new Uint8Array(65).fill(4),
        },
      }),
      director,
    );
    await c.close([filled]);
    expect(
      (await c.problems()).some((p) => p.includes("자격 열쇠 칸은 비워")),
    ).toBe(true);
  });
});

describe("상품 대상 판정", () => {
  it("증서를 붙인 응모권은 상품 대상, 붙이지 않은 응모권은 아니다", async () => {
    const { c, issuer, periodId } = await withPeriod();
    const [a, b, plain] = entrants as [SoftPasskey, SoftPasskey, SoftPasskey];
    const qa = issue(issuer.secretKey, periodId);
    const qb = issue(issuer.secretKey, periodId);
    const tickets = [
      await ticket(c, a, [1, 2, 3, 4, 5, 6], qa),
      await ticket(c, b, [7, 8, 9, 10, 11, 12], qb),
      await ticket(c, plain, [13, 14, 15, 16, 17, 18], null),
    ];
    await c.close([await issued(c, periodId, 2)], tickets);
    expect(await c.problems()).toEqual([]);
    const report = await c.report();
    const round13 = report.qualification.rounds.filter((r) => r.round === 13);
    expect(round13).toHaveLength(1);
    expect(round13[0]?.affiliationName).toBe("벌집 성단");
    expect(round13[0]?.eligible.map(toHex).sort()).toEqual(
      [ticketId(tickets[0] as Ticket), ticketId(tickets[1] as Ticket)]
        .map(toHex)
        .sort(),
    );
    expect(round13[0]?.excluded).toBe(0);
    expect(report.qualification.used[toHex(periodId)]).toBe(2);
  });

  it("같은 회차에 같은 자격이 두 장이면 둘 다 상품 대상에서 빠진다(응모권 자체는 유효)", async () => {
    const { c, issuer, periodId } = await withPeriod();
    const [a, b] = entrants as [SoftPasskey, SoftPasskey];
    const shared = issue(issuer.secretKey, periodId);
    await c.close(
      [await issued(c, periodId, 1)],
      [
        await ticket(c, a, [1, 2, 3, 4, 5, 6], shared),
        await ticket(c, b, [7, 8, 9, 10, 11, 12], shared),
      ],
    );
    expect(await c.problems()).toEqual([]);
    const result = (await c.report()).qualification.rounds.find(
      (r) => r.round === 13,
    );
    expect(result?.eligible).toEqual([]);
    expect(result?.excluded).toBe(2);
  });

  it("쓰인 자격이 공개한 발급 수보다 많으면 검사가 실패한다(몰래 더 찍은 도장)", async () => {
    const { c, issuer, periodId } = await withPeriod();
    const [a, b] = entrants as [SoftPasskey, SoftPasskey];
    await c.close(
      [await issued(c, periodId, 1)],
      [
        await ticket(
          c,
          a,
          [1, 2, 3, 4, 5, 6],
          issue(issuer.secretKey, periodId),
        ),
        await ticket(
          c,
          b,
          [7, 8, 9, 10, 11, 12],
          issue(issuer.secretKey, periodId),
        ),
      ],
    );
    expect(
      (await c.problems()).some((p) => p.includes("발급 수 1개보다 많다")),
    ).toBe(true);
  });

  it("기간 열쇠로 찍지 않은 도장, 효력 전 기간의 증서는 검사가 잡는다", async () => {
    const { c, periodId } = await withPeriod();
    const [a] = entrants as [SoftPasskey];
    const forged = issue(newIssuerKey().secretKey, periodId);
    await c.close(
      [await issued(c, periodId, 1)],
      [await ticket(c, a, [1, 2, 3, 4, 5, 6], forged)],
    );
    expect(
      (await c.problems()).some((p) =>
        p.includes("도장이 기간 열쇠로 확인되지 않는다"),
      ),
    ).toBe(true);
  });

  it("기간이 효력을 얻기 전 회차에 붙인 증서는 거절한다", async () => {
    const { c, issuer, periodId } = await withPeriod();
    // 12회차 기록 자리에 끼워 넣는 것처럼, 효력 전 회차 번호로 판정해 본다
    const early = new Chain();
    early.records = c.records.slice(0, 11);
    early.regs = c.regs.slice(0, 11);
    early.tickets = c.tickets.slice(0, 11);
    const [a] = entrants as [SoftPasskey];
    await early.close(
      [],
      [
        await ticket(
          early,
          a,
          [1, 2, 3, 4, 5, 6],
          issue(issuer.secretKey, periodId),
        ),
      ],
    );
    expect(
      (await early.problems()).some((p) =>
        p.includes("쓸 수 있는 자격 기간이 아니다"),
      ),
    ).toBe(true);
  });
});
