import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { p1363ToDer, type Signer } from "@mighty/stardraw-core";

/**
 * 서버 서명 열쇠(ECDSA P-256). 응모 영수증과 투명성 로그 항목에 서명한다.
 * 파일은 PKCS8 DER을 base64로 적은 한 줄이다. 운영은 파일 비밀값으로 읽기 전용 마운트한다.
 * 공개 열쇠는 장부(head.json)에 실어 누구나 영수증을 확인할 수 있게 한다.
 */

export interface ServerKey extends Signer {
  /** Rekor에 넣는 PEM(SPKI) */
  publicKeyPem: string;
  /** DER 서명(Rekor hashedrekord) */
  signDer(message: Uint8Array): Promise<Uint8Array>;
}

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export async function serverKeyFromPkcs8(
  pkcs8: Uint8Array,
): Promise<ServerKey> {
  const priv = await crypto.subtle.importKey(
    "pkcs8",
    new Uint8Array(pkcs8),
    ALG,
    true,
    ["sign"],
  );
  // 비밀 열쇠의 JWK에서 x·y만 꺼내 공개 열쇠를 만든다
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  if (!jwk.x || !jwk.y)
    throw new Error("서버 열쇠에서 공개 열쇠를 꺼내지 못했다");
  const pub = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
    ALG,
    true,
    ["verify"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pub));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pub));
  const b64 = Buffer.from(spki).toString("base64");
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----\n`;
  const sign = async (message: Uint8Array) =>
    new Uint8Array(
      await crypto.subtle.sign(SIGN, priv, new Uint8Array(message)),
    );
  return {
    publicKey: raw,
    publicKeyPem: pem,
    sign,
    signDer: async (message) => {
      const der = p1363ToDer(await sign(message));
      if (!der) throw new Error("서명을 DER로 바꾸지 못했다");
      return der;
    },
  };
}

export async function newServerKeyPkcs8(): Promise<Uint8Array> {
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  return new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
}

/** 파일에서 읽는다. 없고 `generate`면 새로 만들어 저장한다(개발용) */
export async function loadServerKey(
  path: string,
  generate: boolean,
): Promise<ServerKey> {
  if (!existsSync(path)) {
    if (!generate)
      throw new Error(
        `서버 열쇠 파일이 없다: ${path} (개발은 STARDRAW_GENERATE_SERVER_KEY=1)`,
      );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${Buffer.from(await newServerKeyPkcs8()).toString("base64")}\n`,
      {
        mode: 0o600,
      },
    );
  }
  const text = readFileSync(path, "utf8").trim();
  return serverKeyFromPkcs8(new Uint8Array(Buffer.from(text, "base64")));
}
