import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  type AffiliationFields,
  blindStampRequest,
  checkStartMessage,
  decodeConfirmRequest,
  directorRequester,
  encodeInvite,
  encodeOperation,
  encodeSignatureData,
  fromBase64Url,
  generateSasKey,
  generateSigner,
  issuerKeyRequestMessage,
  newInviteToken,
  newQualSeed,
  OP_VERSION,
  type OpBody,
  type Operation,
  opId,
  type QualHolding,
  qualKeyFromSeed,
  qualLoginNonce,
  type Schedule,
  type SoftPasskey,
  STAMP_SCHEME_BLS,
  signAsDirector,
  signInvite,
  softPasskeySigner,
  ticketId,
  toBase64Url,
  toHex,
  unblindStamp,
  verifyLedger,
  verifyStamp,
} from "@mighty/stardraw-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseQualAffiliations } from "./config";
import { QUAL_WIN_WINDOW, type QualificationOptions } from "./engine";
import { GoogleTokenError } from "./google";
import { createHttpServer } from "./http";
import {
  drawOf,
  EPOCH,
  enter,
  makeRig,
  player,
  type Rig,
  readLedger,
  SCHEDULE,
  TEST_POW,
} from "./testing";

/**
 * 상품 자격 발급(docs/36 11-13). 설정의 국장 열쇠는 1회차 기록에 실려 5회차부터, 국장이 5회차에 소속을 더하면
 * 9회차부터, 9회차에 자격 기간을 열면 13회차부터 도장을 받고 응모권에 붙인다(3회차 예고).
 * 구글 로그인은 흉내(토큰 "google:<이메일>:<hd>:<nonce>")로 바꿔 끼운다. 실제 토큰 확인은 google.test.ts가 본다
 */

const TRIAL: Schedule = {
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
};

const FIELDS: AffiliationFields = {
  name: "벌집 성단",
  badge: 2,
  method: "기관 계정",
  issuerKey: new Uint8Array(),
  issued: 0,
};

const QUALIFICATION: QualificationOptions = {
  affiliations: new Map([
    ["벌집 성단", { kind: "google", domain: "example.com" }],
  ]),
  verifyGoogle: async (token) => {
    const [kind, email, hd, nonce] = token.split(":");
    if (kind !== "google" || !email)
      throw new GoogleTokenError("구글 서명이 맞지 않습니다");
    return { email, emailVerified: true, hd: hd || null, nonce: nonce ?? null };
  },
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

let rig: Rig | undefined;
let director: SoftPasskey;
beforeAll(async () => {
  director = softPasskeySigner(await generateSigner());
});
afterEach(() => {
  rig?.close();
  rig = undefined;
});

const body = (r: Rig, b: DistributiveOmit<OpBody, "v" | "after">): OpBody =>
  ({ v: OP_VERSION, after: r.engine.head(), ...b }) as OpBody;
const submit = (r: Rig, op: Operation) =>
  r.engine.submitDirectorOp(encodeOperation(op), "203.0.113.9");

async function finishThrough(r: Rig, round: number): Promise<void> {
  for (let k = r.store.recordCount() + 1; k <= round; k++) await r.finish(k);
}

/** 13회차가 열린 상태: 벌집 성단 1기(1년)가 효력이 생겼다 */
async function qualRig(): Promise<{ r: Rig; periodId: string }> {
  rig = await makeRig({
    schedule: TRIAL,
    directorKeys: [
      { credentialId: director.credentialId, pub: director.publicKey },
    ],
    qualification: QUALIFICATION,
  });
  const r = rig;
  await finishThrough(r, 4);
  const add = await signAsDirector(
    body(r, { kind: "affiliation-add", effectiveRound: 9, fields: FIELDS }),
    director,
  );
  await submit(r, add);
  await finishThrough(r, 8);
  const { issuerKey } = await r.engine.createIssuerKey("203.0.113.9", {
    pub: director.publicKey,
    signature: await director.sign(issuerKeyRequestMessage(r.engine.head())),
  });
  const period = await signAsDirector(
    body(r, {
      kind: "qual-period",
      effectiveRound: 13,
      affiliation: opId(add),
      number: 1,
      startsAt: EPOCH,
      endsAt: EPOCH + 365 * 24 * 3600,
      scheme: STAMP_SCHEME_BLS,
      issuerKey: fromBase64Url(issuerKey),
    }),
    director,
  );
  await submit(r, period);
  await finishThrough(r, 12);
  return { r, periodId: toHex(opId(period)) };
}

/** 기기가 하는 받기: 자격 열쇠를 만들고 가려 보내고, 받은 도장을 벗긴다 */
async function receive(
  r: Rig,
  periodId: string,
  token: string,
): Promise<QualHolding> {
  const seed = newQualSeed();
  const id = Uint8Array.from(Buffer.from(periodId, "hex"));
  const request = blindStampRequest(id, qualKeyFromSeed(seed).publicKey);
  const { blindStamp } = await r.engine.issueStamp({
    periodId,
    idToken: `${token}:${qualLoginNonce(request.blinded)}`,
    blinded: request.blinded,
    ip: "203.0.113.7",
  });
  return {
    periodId: id,
    seed,
    stamp: unblindStamp(blindStamp, request.factor),
  };
}

describe("상품 자격 받기(기관 계정 → 블라인드 도장)", () => {
  it("효력이 생긴 기간을 알리고, 기관 계정이면 도장을 찍어 준다. 벗긴 도장은 장부의 기간 열쇠로 확인된다", async () => {
    const { r, periodId } = await qualRig();
    const info = await r.engine.qualInfo();
    expect(info.periods).toEqual([
      expect.objectContaining({
        id: periodId,
        affiliationName: "벌집 성단",
        method: "기관 계정",
        open: true,
        verify: "google",
      }),
    ]);
    const holding = await receive(
      r,
      periodId,
      "google:Alice@Example.com:example.com",
    );
    const period = info.periods[0];
    if (!period) throw new Error("기간이 없다");
    expect(
      verifyStamp(
        fromBase64Url(period.issuerKey),
        holding.periodId,
        qualKeyFromSeed(holding.seed).publicKey,
        holding.stamp,
      ),
    ).toBe(true);
    // 서버는 계정의 HMAC과 기간만 남긴다(이메일·시각 없음)
    const rows = r.store.db.prepare("SELECT * FROM qual_issued").all();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "account",
      "blinded",
      "period",
    ]);
    expect(JSON.stringify(rows)).not.toContain("alice");
  }, 30_000);

  it("다른 도메인·개인 계정은 거절하고, 한 계정은 한 기간에 한 번만 받는다(같은 가린 값을 다시 보내면 같은 도장)", async () => {
    const { r, periodId } = await qualRig();
    await expect(
      receive(r, periodId, "google:bob@other.org:other.org"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      receive(r, periodId, "google:bob@gmail.com:"),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(receive(r, periodId, "bad-token")).rejects.toMatchObject({
      status: 401,
    });
    await receive(r, periodId, "google:carol@example.com:example.com");
    await expect(
      receive(r, periodId, "google:CAROL@example.com:example.com"),
    ).rejects.toMatchObject({
      status: 409,
      message: "이번 기간 자격을 이미 받았습니다",
    });
    // 응답을 못 받은 경우: 같은 가린 값이면 다시 준다
    const id = Uint8Array.from(Buffer.from(periodId, "hex"));
    const request = blindStampRequest(
      id,
      qualKeyFromSeed(newQualSeed()).publicKey,
    );
    const send = () =>
      r.engine.issueStamp({
        periodId,
        idToken: `google:dave@example.com:example.com:${qualLoginNonce(request.blinded)}`,
        blinded: request.blinded,
        ip: "203.0.113.7",
      });
    const first = await send();
    const again = await send();
    expect(toHex(again.blindStamp)).toBe(toHex(first.blindStamp));
  }, 30_000);

  it("증서를 붙인 응모를 받고, 같은 자격의 두 번째 응모도 받는다. 기록에 발급 수가 실리고 장부 검사가 통과한다", async () => {
    const { r, periodId } = await qualRig();
    const shared = await receive(
      r,
      periodId,
      "google:erin@example.com:example.com",
    );
    const own = await receive(
      r,
      periodId,
      "google:finn@example.com:example.com",
    );
    const a = await player();
    const b = await player();
    const c = await player();
    const ta = await enter(r, a, [1, 2, 3, 4, 5, 6], "203.0.113.7", shared);
    await enter(r, b, [7, 8, 9, 10, 11, 12], "203.0.113.7", shared);
    const tc = await enter(r, c, [13, 14, 15, 16, 17, 18], "203.0.113.7", own);
    expect(ta.ticket.v).toBe(2);
    await r.finish(13);
    const ops = r.store.record(13)?.operations ?? [];
    expect(ops).toEqual([
      expect.objectContaining({
        kind: "qual-issued",
        issued: 2,
        signer: expect.objectContaining({ role: "seal" }),
      }),
    ]);
    const ledger = readLedger(r.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    const round13 = report.qualification.rounds.find((x) => x.round === 13);
    expect(round13?.excluded).toBe(2);
    expect(round13?.eligible.map(toHex)).toEqual([toHex(tc.receipt.ticketId)]);
    // 다음 기록에는 발급 수가 바뀌지 않았으니 싣지 않는다
    await r.finish(14);
    expect(r.store.record(14)?.operations).toBeUndefined();
  }, 60_000);

  it("기간 열쇠로 찍지 않은 도장의 증서는 응모를 거절한다", async () => {
    const { r, periodId } = await qualRig();
    const holding = await receive(
      r,
      periodId,
      "google:gina@example.com:example.com",
    );
    const forged = {
      ...holding,
      stamp: (await receive(r, periodId, "google:hank@example.com:example.com"))
        .stamp,
    };
    await expect(
      enter(r, await player(), [1, 2, 3, 4, 5, 6], "203.0.113.7", forged),
    ).rejects.toMatchObject({
      message: "소속 증서: 도장이 맞지 않습니다",
    });
  }, 30_000);

  it("HTTP: 기간 목록을 묻고, 가린 값을 보내 가린 도장을 받는다", async () => {
    const { r, periodId } = await qualRig();
    const server = createHttpServer(r.engine, r.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(r.dir, "ledger"),
      devOrigins: [],
      trustProxy: false,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}/stardraw-api`;
      const info = await (await fetch(`${base}/api/qual`)).json();
      expect(info.periods[0]).toMatchObject({ id: periodId, open: true });
      const id = Uint8Array.from(Buffer.from(periodId, "hex"));
      const request = blindStampRequest(
        id,
        qualKeyFromSeed(newQualSeed()).publicKey,
      );
      const res = await fetch(`${base}/api/qual/${periodId}/blind`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idToken: `google:ivy@example.com:example.com:${qualLoginNonce(request.blinded)}`,
          blinded: Buffer.from(request.blinded).toString("base64url"),
        }),
      });
      expect(res.status).toBe(200);
      const { blindStamp } = await res.json();
      expect(fromBase64Url(blindStamp)).toHaveLength(48);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(null)));
    }
  }, 30_000);
});

describe("소속 확인 방법 설정(STARDRAW_QUAL_AFFILIATIONS)", () => {
  it("소속 이름=google:도메인을 쉼표로 여럿 읽고, 모양이 틀리면 띄우지 않는다", () => {
    expect(
      parseQualAffiliations(
        "벌집 성단=google:Example.com, 다른 성단=google:example.org",
      ),
    ).toEqual(
      new Map([
        ["벌집 성단", { kind: "google", domain: "example.com" }],
        ["다른 성단", { kind: "google", domain: "example.org" }],
      ]),
    );
    expect(parseQualAffiliations("")).toEqual(new Map());
    expect(() => parseQualAffiliations("벌집 성단=invite:abc")).toThrow();
    expect(() => parseQualAffiliations("google:example.com")).toThrow();
  });
});

describe("소속 1·2등 알림(서버 감시가 국장에게)", () => {
  it("소속 표시가 유효한 1등만 상태의 qualWins에 회차·일련번호로 오르고, 창이 지나면 빠진다", async () => {
    const { r, periodId } = await qualRig();
    const own = await receive(
      r,
      periodId,
      "google:gina@example.com:example.com",
    );
    const winning = drawOf(13).numbers;
    const q = await enter(r, await player(), winning, "203.0.113.7", own);
    // 증서 없는 같은 번호 1등은 알리지 않는다
    await enter(r, await player(), winning, "203.0.113.7");
    expect(r.engine.state().qualWins).toEqual([]);
    await r.finish(13);
    expect(r.engine.state().qualWins).toEqual([
      { round: 13, rank: 1, ticket: toHex(q.receipt.ticketId).slice(0, 12) },
    ]);
    expect(r.engine.qualWins(r.engine.now() + QUAL_WIN_WINDOW + 3600)).toEqual(
      [],
    );
  }, 60_000);
});

describe("구글 로그인 nonce(2026-10-31 보안 검토 B7)", () => {
  it("다른 가린 값을 위해 받은 ID 토큰(새어 나간 토큰)으로는 도장을 받지 못한다", async () => {
    const { r, periodId } = await qualRig();
    const id = Uint8Array.from(Buffer.from(periodId, "hex"));
    const victim = blindStampRequest(
      id,
      qualKeyFromSeed(newQualSeed()).publicKey,
    );
    const thief = blindStampRequest(
      id,
      qualKeyFromSeed(newQualSeed()).publicKey,
    );
    const leaked = `google:judy@example.com:example.com:${qualLoginNonce(victim.blinded)}`;
    await expect(
      r.engine.issueStamp({
        periodId,
        idToken: leaked,
        blinded: thief.blinded,
        ip: "203.0.113.7",
      }),
    ).rejects.toMatchObject({ status: 401 });
    // nonce 없는 토큰도 받지 않는다
    await expect(
      r.engine.issueStamp({
        periodId,
        idToken: "google:judy@example.com:example.com",
        blinded: victim.blinded,
        ip: "203.0.113.7",
      }),
    ).rejects.toMatchObject({ status: 401 });
    // 주인은 그대로 받는다
    const ok = await r.engine.issueStamp({
      periodId,
      idToken: leaked,
      blinded: victim.blinded,
      ip: "203.0.113.7",
    });
    expect(ok.blindStamp).toHaveLength(48);
  }, 60_000);
});

describe("우주국장이 국장 패스키로 연 확인(2026-10-31 보안 검토 B3)", () => {
  it("국장 서명이면 요청자 칸에 받는 분이 적히고, 국장이 아닌 열쇠의 서명은 거절한다", async () => {
    const { r } = await qualRig();
    const winner = await player();
    const won = (await enter(r, winner, drawOf(13).numbers, "203.0.113.7"))
      .ticket;
    await r.finish(13);
    const token = newInviteToken();
    await r.relay.createInvite({
      invite: encodeInvite(await signInvite(winner.signer, won, token)),
    });
    const checker = await generateSasKey();
    const to = "홍길동";
    const msg = checkStartMessage(token, checker.publicKey, to);
    const base = { token, checkerKey: toBase64Url(checker.publicKey) };
    // 우주인 열쇠로 서명한 가짜 국장
    await expect(
      r.relay.start({
        ...base,
        director: {
          pub: toBase64Url(winner.signer.publicKey),
          signature: encodeSignatureData(await winner.signer.sign(msg)),
          to,
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    // 받는 분을 바꾼 서명
    await expect(
      r.relay.start({
        ...base,
        director: {
          pub: toBase64Url(director.publicKey),
          signature: encodeSignatureData(await director.sign(msg)),
          to: "말로리",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    const created = await r.relay.start({
      ...base,
      director: {
        pub: toBase64Url(director.publicKey),
        signature: encodeSignatureData(await director.sign(msg)),
        to,
      },
    });
    expect(decodeConfirmRequest(created.request).requester).toBe(
      directorRequester(to),
    );
    const open = r.relay.openFor([toBase64Url(ticketId(won))]);
    expect(open[0]?.director?.to).toBe(to);
  }, 60_000);
});

describe("새 도장 열쇠는 국장 서명으로만(2026-10-31 보안 검토 B9)", () => {
  it("국장이 아닌 열쇠의 서명이나 지난 장부 끝 해시에 한 서명은 거절한다", async () => {
    const { r } = await qualRig();
    const stranger = await player();
    await expect(
      r.engine.createIssuerKey("203.0.113.9", {
        pub: stranger.signer.publicKey,
        signature: await stranger.signer.sign(
          issuerKeyRequestMessage(r.engine.head()),
        ),
      }),
    ).rejects.toMatchObject({ status: 403 });
    const stale = await director.sign(issuerKeyRequestMessage(r.engine.head()));
    await r.finish(13);
    await expect(
      r.engine.createIssuerKey("203.0.113.9", {
        pub: director.publicKey,
        signature: stale,
      }),
    ).rejects.toMatchObject({ status: 403 });
  }, 60_000);
});
