import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./bytes";
import {
  DRAND_DELAY,
  drandRandomness,
  drandRoundAtOrAfter,
  drandRoundForClose,
  drandTime,
  QUICKNET,
  verifyQuicknetBeacon,
} from "./drand";

// api.drand.sh/<quicknet>/public/1000000 에서 받은 실제 값(2026-10-29)
const REAL = {
  round: 1000000,
  randomness:
    "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
  signature:
    "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
};

describe("drand quicknet", () => {
  const beacon = { round: REAL.round, signature: fromHex(REAL.signature) };

  it("실제 회차의 서명을 확인하고 난수를 서명에서 얻는다", () => {
    expect(verifyQuicknetBeacon(beacon)).toBe(true);
    expect(toHex(drandRandomness(beacon))).toBe(REAL.randomness);
  });

  it("회차 번호가 다르거나 서명이 바뀌면 거절한다", () => {
    expect(verifyQuicknetBeacon({ ...beacon, round: REAL.round + 1 })).toBe(
      false,
    );
    const bent = fromHex(REAL.signature);
    bent[10] = (bent[10] ?? 0) ^ 1;
    expect(verifyQuicknetBeacon({ round: REAL.round, signature: bent })).toBe(
      false,
    );
    expect(
      verifyQuicknetBeacon({
        round: REAL.round,
        signature: new Uint8Array(47),
      }),
    ).toBe(false);
  });

  it("회차와 시각을 서로 바꾼다", () => {
    expect(drandTime(1)).toBe(QUICKNET.genesisTime);
    expect(drandTime(1000000)).toBe(QUICKNET.genesisTime + 999999 * 3);
    expect(drandRoundAtOrAfter(drandTime(500))).toBe(500);
    expect(drandRoundAtOrAfter(drandTime(500) + 1)).toBe(501);
    expect(drandRoundAtOrAfter(0)).toBe(1);
  });

  it("마감 + 5분 이후 첫 회차를 쓴다", () => {
    const closesAt = 1793264400; // 어떤 정각
    const r = drandRoundForClose(closesAt);
    expect(drandTime(r)).toBeGreaterThanOrEqual(closesAt + DRAND_DELAY);
    expect(drandTime(r - 1)).toBeLessThan(closesAt + DRAND_DELAY);
  });
});
