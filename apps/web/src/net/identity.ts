/**
 * 방장 신원 확인. 방장은 방을 열 때 ECDSA(P-256) 열쇠 쌍을 만들고, 공개 열쇠의 지문(SHA-256 앞 16바이트)을
 * 초대 링크에 넣는다(`?k=`). 참가자는 들어갈 때 임의의 값(nonce)을 보내고, 방장은
 * "게임·nonce·참가자 연결 아이디·자리·토큰"에 서명해 공개 열쇠와 함께 돌려준다.
 * 참가자는 지문과 서명을 확인한 연결만 방장으로 믿는다.
 *
 * 링크를 아는 다른 참가자가 먼저 "어서 와"라고 답해 방장 행세를 하거나(방장 사칭),
 * 진짜 방장과 참가자 사이에 끼어 말을 전달하는 것(중간자)을 막는다.
 * 중간자는 방장이 서명한 "참가자 연결 아이디"가 자기 것이 되어 들킨다.
 */

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export interface HostIdentity {
  /** 공개 열쇠(raw, base64url) */
  publicKey: string;
  /** 초대 링크에 넣는 지문 */
  fingerprint: string;
  sign(text: string): Promise<string>;
  /** 새로고침해도 같은 열쇠로 이어 가도록 탭에 남길 개인 열쇠(JWK) */
  exportPrivate(): Promise<JsonWebKey>;
}

/** 공개 열쇠의 지문: SHA-256의 앞 16바이트(base64url 22글자) */
export async function fingerprintOf(publicKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    fromBase64Url(publicKey) as BufferSource,
  );
  return toBase64Url(new Uint8Array(digest).slice(0, 16));
}

export async function createHostIdentity(): Promise<HostIdentity> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  return identityOf(pair.privateKey, pair.publicKey);
}

/** 남겨 둔 개인 열쇠로 같은 신원을 되살린다(방장 새로고침) */
export async function restoreHostIdentity(
  jwk: JsonWebKey,
): Promise<HostIdentity> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    ALGORITHM,
    true,
    ["sign"],
  );
  // 개인 열쇠 JWK에는 공개 열쇠 좌표(x, y)도 들어 있다.
  const { d: _, key_ops: __, ...pub } = jwk;
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { ...pub, key_ops: ["verify"] },
    ALGORITHM,
    true,
    ["verify"],
  );
  return identityOf(privateKey, publicKey);
}

async function identityOf(
  privateKey: CryptoKey,
  publicKeyHandle: CryptoKey,
): Promise<HostIdentity> {
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", publicKeyHandle),
  );
  const publicKey = toBase64Url(raw);
  return {
    publicKey,
    fingerprint: await fingerprintOf(publicKey),
    async sign(text) {
      const sig = await crypto.subtle.sign(
        SIGN,
        privateKey,
        new TextEncoder().encode(text),
      );
      return toBase64Url(new Uint8Array(sig));
    },
    exportPrivate: () => crypto.subtle.exportKey("jwk", privateKey),
  };
}

/** 지문이 맞는 공개 열쇠로 한 서명인가 */
export async function verifyHostProof(
  fingerprint: string,
  proof: { key: string; sig: string },
  text: string,
): Promise<boolean> {
  try {
    if ((await fingerprintOf(proof.key)) !== fingerprint) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(proof.key) as BufferSource,
      ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      SIGN,
      key,
      fromBase64Url(proof.sig) as BufferSource,
      new TextEncoder().encode(text),
    );
  } catch {
    return false;
  }
}

/** 방장이 서명하는 환영 문장. 양쪽이 같은 함수로 만든다 */
export function welcomeStatement(fields: {
  game: string;
  nonce: string;
  peerId: string;
  seat: number;
  token: string;
}): string {
  return [
    "mighty-welcome-v1",
    fields.game,
    fields.nonce,
    fields.peerId,
    fields.seat,
    fields.token,
  ].join("|");
}
