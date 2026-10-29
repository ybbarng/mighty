import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./bytes";
import {
  decodeRegistration,
  encodeRegistration,
  type KeyRegistration,
  registrationContent,
  registrationId,
} from "./registration";
import { registrationRoot, sealDigest } from "./round";
import { fakePasskey, registerPasskey } from "./testing";

const PUB = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);

const RAW: KeyRegistration = {
  v: 1,
  kind: "raw",
  credentialId: new Uint8Array(),
  pub: PUB,
  nonce: 258,
};

const PASSKEY: KeyRegistration = {
  v: 1,
  kind: "passkey",
  credentialId: fromHex("a1b2c3d4"),
  pub: PUB,
  nonce: 7,
};

describe("열쇠 등록 형식", () => {
  it("시험 값: 원시 열쇠·패스키 등록 → 바이트", () => {
    // v 01 ‖ 종류 01(원시) ‖ 패스키 번호 길이 0000 ‖ 공개 열쇠 ‖ nonce 00000102
    expect(toHex(encodeRegistration(RAW))).toBe(
      `01010000${toHex(PUB)}00000102`,
    );
    // 종류 02(패스키) ‖ 길이 0004 ‖ a1b2c3d4
    expect(toHex(encodeRegistration(PASSKEY))).toBe(
      `01020004a1b2c3d4${toHex(PUB)}00000007`,
    );
    // 작업 증명 대상은 용도 이름 ‖ 00 ‖ nonce를 뺀 앞부분
    expect(toHex(registrationContent(RAW))).toBe(
      `${toHex(new TextEncoder().encode("bybtto/register/v1"))}0001010000${toHex(PUB)}`,
    );
  });

  it("바꿨다 되돌리면 같고, nonce가 다르면 id가 다르다", () => {
    expect(decodeRegistration(encodeRegistration(PASSKEY))).toEqual(PASSKEY);
    expect(toHex(registrationId({ ...RAW, nonce: 259 }))).not.toBe(
      toHex(registrationId(RAW)),
    );
  });

  it("원시 열쇠에 패스키 번호가 있거나, 패스키에 번호가 없으면 거절", () => {
    expect(() =>
      encodeRegistration({ ...RAW, credentialId: fromHex("01") }),
    ).toThrow("원시 열쇠는 패스키 번호가 없다");
    expect(() =>
      encodeRegistration({ ...PASSKEY, credentialId: new Uint8Array() }),
    ).toThrow("패스키 번호는");
    expect(() =>
      encodeRegistration({ ...RAW, pub: new Uint8Array(65) }),
    ).toThrow("공개 열쇠는");
  });

  it("패스키 등록: 브라우저가 준 SPKI에서 꺼낸 공개 열쇠와 패스키 번호를 남긴다", async () => {
    const passkey = await fakePasskey();
    const reg = await registerPasskey(passkey, fromHex("33".repeat(32)));
    expect(reg.kind).toBe("passkey");
    expect(toHex(reg.pub)).toBe(toHex(passkey.spki.slice(26)));
    expect(toHex(reg.credentialId)).toBe(toHex(passkey.credentialId));
  });
});

describe("봉인 값", () => {
  it("응모권 루트와 등록 루트를 함께 묶어, 등록이 하나만 달라도 값이 바뀐다", () => {
    const base = {
      round: 3,
      count: 2,
      merkleRoot: fromHex("44".repeat(32)),
      registrationCount: 1,
      registrationRoot: registrationRoot([RAW]),
    };
    const other = {
      ...base,
      registrationRoot: registrationRoot([{ ...RAW, nonce: 1 }]),
    };
    expect(toHex(sealDigest(base))).not.toBe(toHex(sealDigest(other)));
    expect(toHex(sealDigest(base))).toBe(toHex(sealDigest({ ...base })));
  });
});
