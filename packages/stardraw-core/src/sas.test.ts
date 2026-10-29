import { describe, expect, it } from "vitest";

import { toHex } from "./bytes";
import {
  generateSasKey,
  parseSasChallenge,
  SAS_COUNT,
  type SasKey,
  sasChallenge,
  sasKeyFromPair,
  sasSecret,
  sasStars,
} from "./sas";

/** 시험 값용 고정 열쇠(확인하는 분, 당첨자) */
const CHECKER_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "sHVzKqLT40R3lakwXpc8HmxWFriHIlZndES61L792NA",
  y: "g1P-2irX-leq-9FgYawlkQPPACqKRgAPnoTgRGXY8nI",
  d: "W2HREYn5QqLbS530wTeYrE3WasBEhHf3VZv0OvhPvLs",
};
const WINNER_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "5rjH91jSPQy_SI4SGyPhKPXHo_2R5PF3TEoRCYbxmi0",
  y: "haVR64a2KzzZypecwA0EAkRrkWE-bPgJwbx18Y9ODag",
  d: "DWMX58JwL5RewV6uABIfmz_0hxegpK41beXKUCzurWs",
};

async function fixed(jwk: JsonWebKey): Promise<SasKey> {
  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, ecdh, true, [
    "deriveBits",
  ]);
  const { d: _d, ...pub } = jwk;
  const publicKey = await crypto.subtle.importKey("jwk", pub, ecdh, true, []);
  return sasKeyFromPair({ privateKey, publicKey });
}

describe("별 세 개", () => {
  it("두 기기가 같은 공유 비밀과 같은 별을 얻는다(시험 값)", async () => {
    const checker = await fixed(CHECKER_JWK);
    const winner = await fixed(WINNER_JWK);
    const a = await sasSecret(checker.privateKey, winner.publicKey);
    const b = await sasSecret(winner.privateKey, checker.publicKey);
    expect(toHex(a)).toBe(toHex(b));
    expect(toHex(a)).toBe(SECRET_HEX);
    expect(sasStars(a, "req-1")).toEqual(STARS_REQ1);
    expect(sasStars(a, "req-2")).toEqual(STARS_REQ2);
  });

  it("1~45에서 서로 다른 세 개, 열쇠가 다르면 다른 별", async () => {
    const one = await generateSasKey();
    const two = await generateSasKey();
    const three = await generateSasKey();
    const s12 = sasStars(await sasSecret(one.privateKey, two.publicKey), "r");
    const s13 = sasStars(await sasSecret(one.privateKey, three.publicKey), "r");
    for (const s of [s12, s13]) {
      expect(s).toHaveLength(SAS_COUNT);
      expect(new Set(s).size).toBe(SAS_COUNT);
      expect(s.every((n) => n >= 1 && n <= 45)).toBe(true);
    }
    expect(s12).not.toEqual(s13);
  });

  it("서명할 문구에 양쪽 임시 공개 열쇠를 묶고, 풀 수 있다", async () => {
    const checker = await fixed(CHECKER_JWK);
    const winner = await fixed(WINNER_JWK);
    const text = sasChallenge(
      "ABCDEFGHJK",
      checker.publicKey,
      winner.publicKey,
    );
    expect(text.length).toBeLessThanOrEqual(200);
    const parsed = parseSasChallenge(text);
    expect(parsed?.challenge).toBe("ABCDEFGHJK");
    expect(toHex(parsed?.checkerKey ?? new Uint8Array())).toBe(
      toHex(checker.publicKey),
    );
    expect(parseSasChallenge("ABCDEFGHJK")).toBeNull();
    expect(parseSasChallenge("A|B|C")).toBeNull();
  });

  it("공개 열쇠가 아닌 값으로는 공유 비밀을 만들지 않는다", async () => {
    const mine = await generateSasKey();
    await expect(
      sasSecret(mine.privateKey, new Uint8Array(65)),
    ).rejects.toThrow();
    await expect(
      sasSecret(mine.privateKey, new Uint8Array(10)),
    ).rejects.toThrow("65바이트");
  });
});

// Node crypto.createECDH와 파이썬 hashlib으로 따로 계산해 맞춘 값(2026-10-29)
const SECRET_HEX =
  "2b2ee18355c88af67a4e461574d24558b464f2bb199debc79716cf698b7c21cf";
const STARS_REQ1 = [16, 31, 1];
const STARS_REQ2 = [27, 11, 10];
