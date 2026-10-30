import { bls12_381 } from "@noble/curves/bls12-381.js";
import { describe, expect, it } from "vitest";
import { ByteReader, fromHex, sha256, toHex, utf8 } from "./bytes";
import {
  blindStampRequest,
  checkIssuerKey,
  encodeQualCert,
  matchPeriod,
  newIssuerKey,
  newQualSeed,
  parseRecoveryCode,
  type QualHolding,
  qualDisplayId,
  qualKeyFromSeed,
  qualSigMessage,
  qualSign,
  qualVerify,
  readQualCert,
  recoveryCode,
  signBlinded,
  stampMessage,
  unblindStamp,
  verifyStamp,
  verifyStamps,
} from "./qualification";
import { signers } from "./testing";
import {
  decodeTicket,
  encodeTicket,
  signTicket,
  type Ticket,
  ticketBody,
  ticketContent,
  ticketId,
  ticketQualMessage,
  unsignedTicket,
  verifyTicketSignature,
} from "./ticket";

/**
 * 상품 자격 증서(docs/36 11-13). 아래 고정 값은 파이썬(표준 라이브러리, P-256 곱셈을 직접 짠 것)으로
 * 따로 계산해 맞췄다: 씨앗 00‖01‖…‖0f, 기간 id = taggedHash("stardraw/op/v1", "period"), 도장 자리 ab × 48
 */
const SEED = Uint8Array.from({ length: 16 }, (_, i) => i);
const PERIOD = fromHex(
  "819eb0f54f5923a3aaa75e2b9b1a92924f2b7006b94ebed871a74765df6dd79a",
);
const FAKE_STAMP = new Uint8Array(48).fill(0xab);

/** 실제 도장을 받는 흐름(기기 가리기 → 서버 찍기 → 기기 벗기기) */
function issue(secretKey: Uint8Array, periodId: Uint8Array): QualHolding {
  const seed = newQualSeed();
  const { publicKey } = qualKeyFromSeed(seed);
  const request = blindStampRequest(periodId, publicKey);
  const blindStamp = signBlinded(secretKey, request.blinded);
  return { periodId, seed, stamp: unblindStamp(blindStamp, request.factor) };
}

describe("자격 열쇠·복구 코드·자격 번호(파이썬과 같은 값)", () => {
  it("씨앗에서 만든 자격 공개 열쇠", () => {
    expect(toHex(qualKeyFromSeed(SEED).publicKey)).toBe(
      "03f996dc8c9d8e2c3b06f1b9ab721c6125bd53a36036c4819cc41de06b9fc47db6",
    );
  });

  it("복구 코드는 117자 base32이고 다시 읽으면 같은 값", () => {
    const code = recoveryCode({
      periodId: PERIOD,
      seed: SEED,
      stamp: FAKE_STAMP,
    });
    expect(code).toBe(
      "SDQ1-060SXC7N9XCJ78R0041061050R3GG28A1C60T3GFNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTQAXBNENTP",
    );
    const parsed = parseRecoveryCode(code);
    expect(toHex(parsed.periodPrefix)).toBe(toHex(PERIOD.slice(0, 8)));
    expect(toHex(parsed.seed)).toBe(toHex(SEED));
    expect(toHex(parsed.stamp)).toBe(toHex(FAKE_STAMP));
  });

  it("복구 코드는 소문자·띄어쓰기·헷갈리는 글자(O→0, I·L→1)를 받아 준다", () => {
    const code = recoveryCode({
      periodId: PERIOD,
      seed: SEED,
      stamp: FAKE_STAMP,
    });
    const messy = ` ${code.toLowerCase().replace(/0/g, "o").replace(/1/g, "l")} `;
    expect(toHex(parseRecoveryCode(messy).seed)).toBe(toHex(SEED));
  });

  it("모자라거나 남거나 앞머리가 다른 복구 코드는 거절한다", () => {
    const code = recoveryCode({
      periodId: PERIOD,
      seed: SEED,
      stamp: FAKE_STAMP,
    });
    expect(() => parseRecoveryCode(code.slice(0, -3))).toThrow();
    expect(() => parseRecoveryCode(`${code}AAA`)).toThrow();
    expect(() => parseRecoveryCode(code.replace("SDQ1", "SDQ2"))).toThrow();
  });

  it("복구 코드의 기간 앞부분으로 장부의 기간을 찾는다", () => {
    const other = sha256(utf8("다른 기간"));
    expect(matchPeriod(PERIOD.slice(0, 8), [other, PERIOD])).toEqual(PERIOD);
    expect(matchPeriod(PERIOD.slice(0, 8), [other])).toBeNull();
  });

  it("보이는 자격 번호", () => {
    expect(qualDisplayId(PERIOD, qualKeyFromSeed(SEED).publicKey)).toBe(
      "Q-8W62-KQGE",
    );
  });

  it("도장 받을 메시지", () => {
    expect(
      toHex(sha256(stampMessage(PERIOD, qualKeyFromSeed(SEED).publicKey))),
    ).toBe("d2fbebcf4bf7ef8959b24550ccb08a3a839645ededc610c72e01b19cbf802e25");
  });
});

describe("블라인드 도장(우주국도 무엇에 찍었는지 모른다)", () => {
  it("가려서 받은 도장을 벗기면 기간 열쇠로 확인된다", () => {
    const issuer = newIssuerKey();
    const h = issue(issuer.secretKey, PERIOD);
    const pub = qualKeyFromSeed(h.seed).publicKey;
    expect(verifyStamp(issuer.publicKey, PERIOD, pub, h.stamp)).toBe(true);
    // 다른 기간·다른 열쇠·다른 자격 번호로는 맞지 않는다
    expect(verifyStamp(issuer.publicKey, sha256(PERIOD), pub, h.stamp)).toBe(
      false,
    );
    expect(verifyStamp(newIssuerKey().publicKey, PERIOD, pub, h.stamp)).toBe(
      false,
    );
    expect(
      verifyStamp(
        issuer.publicKey,
        PERIOD,
        qualKeyFromSeed(SEED).publicKey,
        h.stamp,
      ),
    ).toBe(false);
  });

  it("같은 자격 번호를 두 번 가려도 서버가 보는 값은 매번 다르고, 도장(장부에 나오는 값)과도 다르다", () => {
    const issuer = newIssuerKey();
    const pub = qualKeyFromSeed(SEED).publicKey;
    const a = blindStampRequest(PERIOD, pub);
    const b = blindStampRequest(PERIOD, pub);
    expect(toHex(a.blinded)).not.toBe(toHex(b.blinded));
    const stampA = unblindStamp(
      signBlinded(issuer.secretKey, a.blinded),
      a.factor,
    );
    const stampB = unblindStamp(
      signBlinded(issuer.secretKey, b.blinded),
      b.factor,
    );
    // BLS 도장은 결정적이라 벗긴 값은 같다. 서버가 본 가린 값과는 이어지지 않는다
    expect(toHex(stampA)).toBe(toHex(stampB));
    expect(toHex(stampA)).not.toBe(toHex(a.blinded));
    expect(toHex(stampA)).not.toBe(
      toHex(signBlinded(issuer.secretKey, a.blinded)),
    );
  });

  it("서버는 곡선 위 점이 아니거나 무한원점인 가린 값을 거절한다", () => {
    const issuer = newIssuerKey();
    expect(() => signBlinded(issuer.secretKey, new Uint8Array(48))).toThrow();
    expect(() => signBlinded(issuer.secretKey, new Uint8Array(47))).toThrow();
    const infinity = bls12_381.G1.Point.ZERO.toBytes(true);
    expect(() => signBlinded(issuer.secretKey, infinity)).toThrow();
  });

  it("기간 열쇠는 G2 부분군의 점이어야 한다", () => {
    expect(checkIssuerKey(newIssuerKey().publicKey)).toBeNull();
    expect(checkIssuerKey(new Uint8Array(96))).not.toBeNull();
    expect(
      checkIssuerKey(bls12_381.G2.Point.ZERO.toBytes(true)),
    ).not.toBeNull();
  });

  it("도장 여럿을 한꺼번에 확인하고, 하나라도 틀리면 거절한다", () => {
    const issuer = newIssuerKey();
    const holdings = [
      issue(issuer.secretKey, PERIOD),
      issue(issuer.secretKey, PERIOD),
    ];
    const items = holdings.map((h) => ({
      periodId: h.periodId,
      qualPub: qualKeyFromSeed(h.seed).publicKey,
      stamp: h.stamp,
    }));
    expect(verifyStamps(issuer.publicKey, items)).toBe(true);
    // 두 도장을 맞바꾸면(각자 다른 자격 번호의 도장) 틀린 것이 둘이다
    const swapped = [
      {
        ...(items[0] as (typeof items)[number]),
        stamp: (items[1] as (typeof items)[number]).stamp,
      },
      {
        ...(items[1] as (typeof items)[number]),
        stamp: (items[0] as (typeof items)[number]).stamp,
      },
    ];
    expect(verifyStamps(issuer.publicKey, swapped)).toBe(false);
    expect(verifyStamps(issuer.publicKey, [])).toBe(true);
  });

  it("hash-to-curve는 RFC 9380 시험 값과 같다(BLS12381G1_XMD:SHA-256_SSWU_RO_, 빈 메시지)", () => {
    const point = bls12_381.G1.hashToCurve(new Uint8Array(), {
      DST: "QUUX-V01-CS02-with-BLS12381G1_XMD:SHA-256_SSWU_RO_",
    });
    expect(point.toAffine().x.toString(16).padStart(96, "0")).toBe(
      "052926add2207b76ca4fa57a8734416c8dc95e24501772c814278700eed6d1e4e8cf62d9c09db0fac349612b759e79a1",
    );
  });
});

describe("자격 서명(P-256, low-s)", () => {
  it("자격 열쇠로 서명하고 확인한다. 다른 메시지·열쇠는 거절", () => {
    const key = qualKeyFromSeed(SEED);
    const message = utf8("응모권");
    const sig = qualSign(key.secretKey, message);
    expect(sig).toHaveLength(64);
    expect(qualVerify(key.publicKey, message, sig)).toBe(true);
    expect(qualVerify(key.publicKey, utf8("다른 응모권"), sig)).toBe(false);
    expect(
      qualVerify(qualKeyFromSeed(newQualSeed()).publicKey, message, sig),
    ).toBe(false);
  });
});

describe("응모권 v2(자격 증서를 붙인 응모권)", () => {
  /** 파이썬과 맞춘 고정 v2 응모권: 7회차, 3 11 19 27 38 44, 04‖01×64, 증서, 자격 서명 5c×64, nonce 258 */
  const PUB = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);
  const FIXED: Omit<Ticket, "sig"> = {
    v: 2,
    round: 7,
    numbers: [3, 11, 19, 27, 38, 44],
    pub: PUB,
    qual: {
      cert: {
        periodId: PERIOD,
        qualPub: qualKeyFromSeed(SEED).publicKey,
        stamp: FAKE_STAMP,
      },
      sig: new Uint8Array(64).fill(0x5c),
    },
    nonce: 258,
  };

  it("응모권 id와 자격 서명 대상(파이썬과 같은 값)", () => {
    expect(toHex(ticketId(FIXED))).toBe(
      "fba0e1bef80b0d92a0fe7e790faa57e6693ac00ca088de4cbacafe16844b3d0c",
    );
    expect(toHex(sha256(ticketQualMessage(FIXED)))).toBe(
      "f5f1714d7b2304ad792226213908c78cf830fcbda1c07e05897e855b64ff26ee",
    );
    expect(ticketBody(FIXED)).toHaveLength(1 + 4 + 6 + 65 + 113 + 64 + 4);
  });

  it("자격 증서 113바이트를 쓰고 읽는다", () => {
    const cert = FIXED.qual?.cert;
    if (!cert) throw new Error("증서가 없다");
    const bytes = encodeQualCert(cert);
    expect(bytes).toHaveLength(113);
    expect(toHex(encodeQualCert(readQualCert(new ByteReader(bytes))))).toBe(
      toHex(bytes),
    );
  });

  it("들고 있는 자격으로 만든 응모권: 자격 서명·응모자 서명이 맞고, 쓰고 읽어도 같다", async () => {
    const [entrant] = await signers(1);
    if (!entrant) throw new Error("흉내 패스키가 없다");
    const issuer = newIssuerKey();
    const holding = issue(issuer.secretKey, PERIOD);
    const unsigned = unsignedTicket(entrant, 9, [1, 2, 3, 4, 5, 6], holding);
    expect(unsigned.v).toBe(2);
    const ticket = await signTicket(entrant, unsigned, 5);
    const qual = ticket.qual;
    if (!qual) throw new Error("자격이 붙지 않았다");
    expect(
      qualVerify(qual.cert.qualPub, ticketQualMessage(ticket), qual.sig),
    ).toBe(true);
    expect(await verifyTicketSignature(ticket)).toBe(true);
    const again = decodeTicket(encodeTicket(ticket));
    expect(toHex(ticketId(again))).toBe(toHex(ticketId(ticket)));
    expect(toHex(ticketContent(again))).toBe(toHex(ticketContent(ticket)));
  });

  it("장부에서 증서를 베껴 다른 응모권에 붙이면 자격 서명이 맞지 않는다", async () => {
    const [owner, thief] = await signers(2);
    if (!owner || !thief) throw new Error("흉내 패스키가 없다");
    const holding = issue(newIssuerKey().secretKey, PERIOD);
    const real = await signTicket(
      owner,
      unsignedTicket(owner, 9, [1, 2, 3, 4, 5, 6], holding),
      1,
    );
    // 도둑은 씨앗이 없어 증서와 자격 서명만 베낄 수 있다
    if (!real.qual) throw new Error("자격이 붙지 않았다");
    const copied = await signTicket(
      thief,
      {
        ...unsignedTicket(thief, 9, [7, 8, 9, 10, 11, 12]),
        v: 2,
        qual: real.qual,
      },
      1,
    );
    const qual = copied.qual;
    if (!qual) throw new Error("자격이 없다");
    expect(
      qualVerify(qual.cert.qualPub, ticketQualMessage(copied), qual.sig),
    ).toBe(false);
  });

  it("v1 응모권은 그대로 읽고, 모르는 판은 거절한다", async () => {
    const [entrant] = await signers(1);
    if (!entrant) throw new Error("흉내 패스키가 없다");
    const v1 = await signTicket(
      entrant,
      unsignedTicket(entrant, 3, [1, 2, 3, 4, 5, 6]),
      1,
    );
    expect(decodeTicket(encodeTicket(v1)).qual).toBeUndefined();
    const bytes = encodeTicket(v1);
    bytes[0] = 3;
    expect(() => decodeTicket(bytes)).toThrow("모르는 응모권 판");
  });

  it("자격 서명 대상은 응모권 앞부분과 증서를 덮는다", () => {
    const cert = FIXED.qual?.cert;
    if (!cert) throw new Error("증서가 없다");
    const other = qualSigMessage(new Uint8Array(76), cert);
    expect(toHex(other)).not.toBe(toHex(ticketQualMessage(FIXED)));
  });
});
