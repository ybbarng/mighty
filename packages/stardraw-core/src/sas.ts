import { ByteWriter, fromBase64Url, taggedHash, toBase64Url } from "./bytes";
import { PUBLIC_KEY_LENGTH } from "./keys";
import { MAX_NUMBER } from "./ticket";

/**
 * 별 세 개(docs/36 11-2): 당첨자 확인에서 두 화면이 같은 상대와 이야기하는지 사람이 맞춰 보는 짧은 확인값.
 * 당첨자 화면에 별 세 개가 차례로 뜨고, 당첨자는 그 이름을 당첨을 알렸던 메신저·메일로 보낸다.
 * 확인하는 분은 받은 세 별을 하늘에서 차례로 눌러 자기 화면이 계산한 값과 맞춰 본다.
 *
 * 왜 ECDH인가: 요청 문구와 서명만으로 뽑으면 둘 다 서버를 거치므로, 서버(나 응답을 엿본 누구든)가
 * 별을 알아 가짜 당첨자에게 넘길 수 있다. 그래서 양쪽 기기가 요청마다 임시 P-256 ECDH 열쇠를 만들고
 * 공개 열쇠만 주고받는다. 공유 비밀은 두 기기만 계산할 수 있어 서버는 별을 모른다.
 * 당첨자는 서명할 문구에 양쪽 임시 공개 열쇠를 묶어(`sasChallenge`) 가운데서 열쇠를 바꿔치기할 수 없게 한다.
 *
 * 별 = taggedHash("stardraw/sas/v1", 공유 비밀(32) ‖ 요청 id(text))를 씨앗으로,
 * SHA-256(씨앗 ‖ i(u32))를 i = 0, 1, …로 이어 바이트를 읽고 225 이상은 버리고 b % 45 + 1,
 * 이미 나온 번호는 건너뛰어 3개(나온 차례가 곧 순서. 당첨 번호 뽑기 draw.ts와 같은 방식).
 */

export const SAS_COUNT = 3;
const ACCEPT_BELOW = Math.floor(256 / MAX_NUMBER) * MAX_NUMBER;
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export interface SasKey {
  /** 압축하지 않은 P-256 공개 열쇠 65바이트 */
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}

/** 요청 하나에만 쓰는 임시 ECDH 열쇠(비밀 열쇠는 꺼낼 수 없다) */
export async function generateSasKey(): Promise<SasKey> {
  const pair = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  return sasKeyFromPair(pair);
}

export async function sasKeyFromPair(pair: CryptoKeyPair): Promise<SasKey> {
  return {
    publicKey: new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    ),
    privateKey: pair.privateKey,
  };
}

/** 내 임시 비밀 열쇠와 상대 임시 공개 열쇠로 공유 비밀(32바이트) */
export async function sasSecret(
  mine: CryptoKey,
  peerPublicKey: Uint8Array,
): Promise<Uint8Array> {
  if (peerPublicKey.length !== PUBLIC_KEY_LENGTH || peerPublicKey[0] !== 0x04)
    throw new Error("임시 공개 열쇠는 압축하지 않은 P-256 65바이트");
  const peer = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(peerPublicKey),
    ECDH,
    false,
    [],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, mine, 256),
  );
}

/** 공유 비밀과 요청 id로 별 세 개(차례 있음) */
export function sasStars(secret: Uint8Array, requestId: string): number[] {
  const seed = taggedHash(
    "stardraw/sas/v1",
    new ByteWriter().fixed(secret, 32).text(requestId).done(),
  );
  const out: number[] = [];
  for (let i = 0; out.length < SAS_COUNT; i++) {
    const block = taggedHash(
      "stardraw/sas-draw/v1",
      seed,
      new ByteWriter().u32(i).done(),
    );
    for (const b of block) {
      if (b >= ACCEPT_BELOW) continue;
      const n = (b % MAX_NUMBER) + 1;
      if (out.includes(n)) continue;
      out.push(n);
      if (out.length === SAS_COUNT) break;
    }
  }
  return out;
}

/**
 * 당첨자가 서명할 확인 문구: 요청 문구 | 확인자 임시 공개 열쇠 | 당첨자 임시 공개 열쇠(base64url).
 * 10 + 1 + 87 + 1 + 87 = 186자로 증명 문구 한도(200자) 안이다.
 */
export function sasChallenge(
  challenge: string,
  checkerKey: Uint8Array,
  winnerKey: Uint8Array,
): string {
  return [challenge, toBase64Url(checkerKey), toBase64Url(winnerKey)].join("|");
}

/** `sasChallenge`를 풀어 본다. 형식이 다르면 null */
export function parseSasChallenge(text: string): {
  challenge: string;
  checkerKey: Uint8Array;
  winnerKey: Uint8Array;
} | null {
  const parts = text.split("|");
  if (parts.length !== 3) return null;
  try {
    const checkerKey = fromBase64Url(parts[1] as string);
    const winnerKey = fromBase64Url(parts[2] as string);
    if (
      checkerKey.length !== PUBLIC_KEY_LENGTH ||
      winnerKey.length !== PUBLIC_KEY_LENGTH
    )
      return null;
    return { challenge: parts[0] as string, checkerKey, winnerKey };
  } catch {
    return null;
  }
}
