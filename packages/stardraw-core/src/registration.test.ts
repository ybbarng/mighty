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
import { RawKeyRejected } from "./signature";
import { fakePasskey, registerPasskey } from "./testing";

const PUB = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);

const PASSKEY: KeyRegistration = {
  v: 1,
  credentialId: fromHex("a1b2c3d4"),
  pub: PUB,
  nonce: 7,
};

describe("열쇠 등록 형식", () => {
  it("시험 값: 패스키 등록 → 바이트", () => {
    // v 01 ‖ 종류 02(패스키) ‖ 패스키 번호 길이 0004 ‖ a1b2c3d4 ‖ 공개 열쇠 ‖ nonce 00000007
    expect(toHex(encodeRegistration(PASSKEY))).toBe(
      `01020004a1b2c3d4${toHex(PUB)}00000007`,
    );
    // 작업 증명 대상은 용도 이름 ‖ 00 ‖ nonce를 뺀 앞부분
    expect(toHex(registrationContent(PASSKEY))).toBe(
      `${toHex(new TextEncoder().encode("stardraw/register/v1"))}0001020004a1b2c3d4${toHex(PUB)}`,
    );
  });

  it("원시 열쇠 등록(종류 01)은 받지 않는다(docs/36 11-11)", () => {
    // 예전 원시 열쇠 등록 바이트: 종류 01 ‖ 패스키 번호 길이 0000
    expect(() =>
      decodeRegistration(fromHex(`01010000${toHex(PUB)}00000102`)),
    ).toThrow(RawKeyRejected);
    // 모르는 종류는 원시 열쇠와 다른 오류
    expect(() =>
      decodeRegistration(fromHex(`01030000${toHex(PUB)}00000102`)),
    ).toThrow("모르는 열쇠 종류: 3");
  });

  it("바꿨다 되돌리면 같고, nonce가 다르면 id가 다르다", () => {
    expect(decodeRegistration(encodeRegistration(PASSKEY))).toEqual(PASSKEY);
    expect(toHex(registrationId({ ...PASSKEY, nonce: 8 }))).not.toBe(
      toHex(registrationId(PASSKEY)),
    );
  });

  it("패스키 번호가 없거나 공개 열쇠 모양이 틀리면 거절", () => {
    expect(() =>
      encodeRegistration({ ...PASSKEY, credentialId: new Uint8Array() }),
    ).toThrow("패스키 번호는");
    expect(() =>
      encodeRegistration({ ...PASSKEY, pub: new Uint8Array(65) }),
    ).toThrow("공개 열쇠는");
  });

  it("패스키 등록: 브라우저가 준 SPKI에서 꺼낸 공개 열쇠와 패스키 번호를 남긴다", async () => {
    const passkey = await fakePasskey();
    const reg = await registerPasskey(passkey, fromHex("33".repeat(32)));
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
      registrationRoot: registrationRoot([PASSKEY]),
    };
    const other = {
      ...base,
      registrationRoot: registrationRoot([{ ...PASSKEY, nonce: 1 }]),
    };
    expect(toHex(sealDigest(base))).not.toBe(toHex(sealDigest(other)));
    expect(toHex(sealDigest(base))).toBe(toHex(sealDigest({ ...base })));
  });
});
