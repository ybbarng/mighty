import { equalBytes, sha256 } from "./bytes";

/**
 * 열쇠는 ECDSA P-256(docs/36 4절). 브라우저·Node 모두 WebCrypto(`crypto.subtle`)로 다룬다.
 * 응모자 서명은 패스키 모양만 받는다(signature.ts). 여기 `Signer`는 서버 영수증 열쇠와,
 * 연습 장부·데모·시험의 흉내 패스키(`softPasskeySigner`) 속 열쇠가 쓴다.
 * 서명은 r‖s 64바이트(IEEE P1363), 공개 열쇠는 압축하지 않은 65바이트다.
 */

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export const PUBLIC_KEY_LENGTH = 65;
export const SIGNATURE_LENGTH = 64;
export const ENTRANT_ID_LENGTH = 16;

export interface Signer {
  publicKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/** 새 열쇠. extractable=false면 비밀 열쇠를 꺼낼 수 없다(브라우저 기본) */
export async function generateSigner(
  extractable = false,
): Promise<Signer & { keyPair: CryptoKeyPair }> {
  const keyPair = await crypto.subtle.generateKey(ALGORITHM, extractable, [
    "sign",
    "verify",
  ]);
  return { keyPair, ...(await signerFromKeyPair(keyPair)) };
}

export async function signerFromKeyPair(
  keyPair: CryptoKeyPair,
): Promise<Signer> {
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return {
    publicKey,
    sign: async (message) =>
      new Uint8Array(
        await crypto.subtle.sign(SIGN, keyPair.privateKey, toBuffer(message)),
      ),
  };
}

export async function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (
    publicKey.length !== PUBLIC_KEY_LENGTH ||
    signature.length !== SIGNATURE_LENGTH
  )
    return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      toBuffer(publicKey),
      ALGORITHM,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      SIGN,
      key,
      toBuffer(signature),
      toBuffer(message),
    );
  } catch {
    return false;
  }
}

/** 응모자 id = 공개 열쇠 해시 앞 16바이트 */
export function entrantId(publicKey: Uint8Array): Uint8Array {
  return sha256(publicKey).slice(0, ENTRANT_ID_LENGTH);
}

export function sameEntrant(a: Uint8Array, b: Uint8Array): boolean {
  return equalBytes(entrantId(a), entrantId(b));
}

/** WebCrypto 타입이 ArrayBuffer 바탕 배열을 요구해서 복사해 넘긴다 */
function toBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}
