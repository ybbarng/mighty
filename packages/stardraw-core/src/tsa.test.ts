import { describe, expect, it } from "vitest";

import { fromHex, toHex, utf8 } from "./bytes";
import { type Der, derChildren, expectTag, parseDer } from "./der";
import { FakeTsa, type FakeTsaChain } from "./testing";
import {
  TSA_DIGICERT,
  TSA_SECTIGO,
  type TsaProof,
  timestampRequest,
  tokenFromResponse,
  verifyTimestampToken,
  verifyTsaProof,
} from "./tsa";
import { FIXTURE_IMPRINT, FIXTURE_TOKENS } from "./tsa.fixtures";

const imprint = fromHex(FIXTURE_IMPRINT);
/** SHA-256(이 값) = FIXTURE_IMPRINT. 봉인 값 자리에 넣어 증거 전체를 확인한다 */
const digest = utf8("stardraw rekor fixture");
const token = (name: keyof typeof FIXTURE_TOKENS) =>
  Uint8Array.from(atob(FIXTURE_TOKENS[name]), (c) => c.charCodeAt(0));
const at = (s: number) => Date.UTC(2026, 9, 30, 1, 51, s) / 1000;
const GEN_TIMES = { digicert: at(12), sectigo: at(14), freetsa: at(15) };

/** SignerInfo 서명 값이 토큰 안 어디에 있는지 */
function signatureOffset(t: Uint8Array): number {
  const kid = (n: Der | undefined, i: number) =>
    expectTag(n, n?.tag ?? -1) && (derChildren(n as Der).at(i) as Der);
  const signed = derChildren(kid(kid(parseDer(t), 1), 0));
  const si = derChildren(kid(signed.at(-1), 0));
  const attrs = si.findIndex((n) => n.tag === 0xa0);
  return expectTag(si[attrs + 2], 0x04).value.byteOffset;
}

describe("시각 인증 토큰(실제 기관 토큰)", () => {
  it.each([
    ["digicert", at(12)],
    ["sectigo", at(14)],
    ["freetsa", at(15)],
  ] as const)("%s 토큰은 서명·사슬·담긴 값이 맞다", async (name, genTime) => {
    const check = await verifyTimestampToken(token(name), { imprint });
    expect(check).toEqual({ ok: true, genTime, tsa: name, problems: [] });
  });

  it("다른 값을 담은 토큰은 거절한다", async () => {
    const other = imprint.slice();
    other[0] = (other[0] ?? 0) ^ 1;
    const check = await verifyTimestampToken(token("digicert"), {
      imprint: other,
    });
    expect(check.problems).toEqual(["토큰이 이 봉인 값을 담고 있지 않다"]);
  });

  it("서명을 바꾸거나 내용(시각)을 바꾸면 거절한다", async () => {
    for (const name of ["digicert", "sectigo", "freetsa"] as const) {
      const sig = token(name);
      const k = signatureOffset(sig) + 10;
      sig[k] = (sig[k] ?? 0) ^ 1;
      expect((await verifyTimestampToken(sig, { imprint })).problems).toEqual([
        "토큰 서명이 맞지 않는다",
      ]);
    }
    // 시각 "…015112Z"의 초를 바꾼다
    const moved = token("digicert");
    const text = new TextDecoder("latin1").decode(moved);
    const k = text.indexOf("20261030015112Z") + 13;
    moved[k] = "3".charCodeAt(0);
    const check = await verifyTimestampToken(moved, { imprint });
    expect(check.genTime).toBe(at(13));
    expect(check.problems).toContain("서명된 속성의 해시가 토큰 내용과 다르다");
  });

  it("고정해 둔 기관 열쇠로 이어지지 않으면 거절한다", async () => {
    const check = await verifyTimestampToken(token("digicert"), {
      imprint,
      authorities: [TSA_SECTIGO],
    });
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual([
      "인증서가 믿는 기관 열쇠로 이어지지 않는다",
    ]);
  });

  it("요청·응답 모양", () => {
    // openssl ts -query -sha256 -cert -no_nonce 와 같은 바이트
    expect(toHex(timestampRequest(imprint))).toBe(
      `30390201013031300d060960864801650304020105000420${FIXTURE_IMPRINT}0101ff`,
    );
    // 상태 0(허락) + 토큰
    const t = token("sectigo");
    const ok = Uint8Array.from([
      0x30,
      0x82,
      (t.length + 5) >> 8,
      (t.length + 5) & 0xff,
      0x30,
      0x03,
      0x02,
      0x01,
      0x00,
      ...t,
    ]);
    expect(tokenFromResponse(ok)).toEqual(t);
    const refused = Uint8Array.from([0x30, 0x05, 0x30, 0x03, 0x02, 0x01, 0x02]);
    expect(tokenFromResponse(refused)).toBeNull();
  });
});

describe("봉인 증거(TsaProof)", () => {
  const proof = (...names: (keyof typeof FIXTURE_TOKENS)[]): TsaProof => ({
    kind: "tsa",
    tokens: names.map((tsa) => ({
      tsa,
      genTime: GEN_TIMES[tsa],
      token: FIXTURE_TOKENS[tsa],
    })),
  });

  it("두 기관이 맞으면 통과하고, 가장 이른 시각을 봉인 시각으로 본다", async () => {
    const check = await verifyTsaProof(proof("sectigo", "digicert"), {
      digest,
      minValid: 2,
    });
    expect(check.problems).toEqual([]);
    expect(check.loggedAt).toBe(at(12));
  });

  it("적어 둔 시각을 토큰과 다르게 고치면 거절한다", async () => {
    const p = proof("digicert");
    p.tokens[0] = { ...(p.tokens[0] as TsaProof["tokens"][0]), genTime: at(1) };
    expect((await verifyTsaProof(p, { digest })).problems).toEqual([
      "digicert: 적어 둔 시각이 토큰 시각과 다르다",
      "시각 인증 기관이 1곳보다 적다(0곳)",
    ]);
  });

  it("기관 수가 모자라거나 같은 기관을 두 번 실으면 모자란 것으로 본다", async () => {
    expect(
      (await verifyTsaProof(proof("digicert"), { digest, minValid: 2 })).ok,
    ).toBe(false);
    expect(
      (
        await verifyTsaProof(proof("digicert", "digicert"), {
          digest,
          minValid: 2,
        })
      ).problems,
    ).toEqual(["시각 인증 기관이 2곳보다 적다(1곳)"]);
    expect((await verifyTsaProof(proof("digicert"), { digest })).ok).toBe(true);
  });

  it("실린 토큰이 하나라도 틀리면(이름이 다른 기관, 다른 봉인 값) 거절한다", async () => {
    const swapped: TsaProof = {
      kind: "tsa",
      tokens: [
        { tsa: "digicert", genTime: at(12), token: FIXTURE_TOKENS.digicert },
        { tsa: "sectigo", genTime: at(15), token: FIXTURE_TOKENS.freetsa },
      ],
    };
    expect((await verifyTsaProof(swapped, { digest })).ok).toBe(false);
    expect(
      (await verifyTsaProof(proof("digicert"), { digest: utf8("다른 회차") }))
        .ok,
    ).toBe(false);
    expect(
      (
        await verifyTsaProof(proof("freetsa"), {
          digest,
          authorities: [TSA_DIGICERT, TSA_SECTIGO],
        })
      ).problems,
    ).toEqual([
      "freetsa: 믿는 기관 목록에 없다",
      "시각 인증 기관이 1곳보다 적다(0곳)",
    ]);
  });
});

describe("가짜 시각 인증 기관(시험 도구)", () => {
  it("실제 기관과 같은 검사를 통과하고, 고정하지 않은 열쇠라 기본 목록으로는 거절된다", async () => {
    const fake = new FakeTsa("fake", () => at(0));
    const t = fake.stamp(imprint, at(30));
    const check = await verifyTimestampToken(t, {
      imprint,
      authorities: [fake.authority],
    });
    expect(check).toEqual({
      ok: true,
      genTime: at(30),
      tsa: "fake",
      problems: [],
    });
    expect((await verifyTimestampToken(t, { imprint })).ok).toBe(false);
  });
});

describe("인증서 사슬: 고정한 루트 아래 아무 인증서로 가짜 기관을 만들 수 없다", () => {
  const check = (chain: FakeTsaChain) => {
    const fake = new FakeTsa("chain", () => at(0), chain);
    return verifyTimestampToken(fake.stamp(imprint, at(30)), {
      imprint,
      authorities: [fake.authority],
    });
  };
  const CA = { ca: true, keyCertSign: true };

  it("중간 CA(CA·keyCertSign)를 거친 사슬은 통과한다", async () => {
    expect(
      (await check({ intermediates: [CA, { ...CA, pathLen: 0 }] })).ok,
    ).toBe(true);
  });

  it("CA가 아닌 인증서(예: 코드 서명용)가 발급한 시각 인증 인증서는 거절한다", async () => {
    const r = await check({
      intermediates: [{ ca: false, keyCertSign: false }],
    });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("인증서 사슬에 CA가 아닌 발급 인증서가 있다");
  });

  it("CA라도 keyUsage에 keyCertSign이 없으면 거절한다", async () => {
    expect(
      (await check({ intermediates: [{ ca: true, keyCertSign: false }] })).ok,
    ).toBe(false);
  });

  it("경로 길이 제한(pathLenConstraint)을 넘으면 거절한다", async () => {
    // pathLen 0인 CA 아래에 CA가 하나 더 있다
    expect(
      (await check({ intermediates: [{ ...CA, pathLen: 0 }, CA] })).ok,
    ).toBe(false);
  });

  it("서명 인증서의 확장 키 용도는 timeStamping 하나뿐이고 critical이어야 한다", async () => {
    expect((await check({ signerEkuCritical: false })).ok).toBe(false);
    expect(
      (
        await check({
          signerEku: ["1.3.6.1.5.5.7.3.8", "1.3.6.1.5.5.7.3.3"],
        })
      ).ok,
    ).toBe(false);
  });
});
