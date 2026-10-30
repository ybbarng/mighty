import { toBase64Url, utf8 } from "@mighty/stardraw-core";
import { beforeAll, describe, expect, it } from "vitest";

import { GoogleTokenError, googleTokenVerifier } from "./google";

/**
 * 구글 ID 토큰 확인. 구글 대신 시험이 RS256 열쇠를 만들어 공개 열쇠 목록(JWKS)을 흉내 내고 토큰을 서명한다.
 * 시각은 주입한다(now)
 */

const CLIENT = "123-test.apps.googleusercontent.com";
const NOW = 1_800_000_000;

let keys: CryptoKeyPair;
let jwks: { keys: Record<string, unknown>[] };
let fetched = 0;
const fakeFetch = (async () => {
  fetched++;
  return new Response(JSON.stringify(jwks), { status: 200 });
}) as unknown as typeof fetch;

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", keys.publicKey);
  jwks = {
    keys: [{ kid: "k1", kty: "RSA", n: pub.n, e: pub.e, alg: "RS256" }],
  };
});

async function token(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" },
): Promise<string> {
  const h = toBase64Url(utf8(JSON.stringify(header)));
  const p = toBase64Url(utf8(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keys.privateKey,
      new Uint8Array(utf8(`${h}.${p}`)),
    ),
  );
  return `${h}.${p}.${toBase64Url(sig)}`;
}

const GOOD = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  exp: NOW + 600,
  email: "alice@example.com",
  email_verified: true,
  hd: "example.com",
};

const verifier = () =>
  googleTokenVerifier(CLIENT, { fetch: fakeFetch, now: () => NOW });

describe("구글 ID 토큰 확인", () => {
  it("맞는 토큰에서 이메일·확인 여부·도메인만 꺼낸다", async () => {
    expect(await verifier()(await token(GOOD))).toEqual({
      email: "alice@example.com",
      emailVerified: true,
      hd: "example.com",
    });
  });

  it("다른 앱(aud)·다른 발급자·만료·서명이 틀린 토큰은 거절한다", async () => {
    const v = verifier();
    await expect(v(await token({ ...GOOD, aud: "other" }))).rejects.toThrow(
      "다른 앱",
    );
    await expect(
      v(await token({ ...GOOD, iss: "evil.example" })),
    ).rejects.toThrow("구글이 만든");
    await expect(v(await token({ ...GOOD, exp: NOW - 120 }))).rejects.toThrow(
      "만료",
    );
    const t = await token(GOOD);
    const tampered = `${t.split(".")[0]}.${toBase64Url(utf8(JSON.stringify({ ...GOOD, hd: "other.org" })))}.${t.split(".")[2]}`;
    await expect(v(tampered)).rejects.toThrow("구글 서명이 맞지 않습니다");
    await expect(v("not-a-token")).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it("개인 계정(hd 없음)은 hd null, 확인되지 않은 이메일은 emailVerified false", async () => {
    const { hd: _, ...personal } = GOOD;
    expect(
      await verifier()(await token({ ...personal, email_verified: false })),
    ).toMatchObject({
      hd: null,
      emailVerified: false,
    });
  });

  it("공개 열쇠는 받아 두고 다시 쓰며, 모르는 kid면 새로 받는다", async () => {
    const v = verifier();
    const before = fetched;
    await v(await token(GOOD));
    await v(await token(GOOD));
    expect(fetched - before).toBe(1);
    await expect(
      v(await token(GOOD, { alg: "RS256", kid: "k9", typ: "JWT" })),
    ).rejects.toThrow("서명 열쇠를 찾지 못했습니다");
    expect(fetched - before).toBe(2);
  });

  it("클라이언트 ID가 비어 있으면 준비 중이라고 알린다", async () => {
    await expect(
      googleTokenVerifier("", { fetch: fakeFetch, now: () => NOW })(
        await token(GOOD),
      ),
    ).rejects.toThrow("준비 중");
  });
});
