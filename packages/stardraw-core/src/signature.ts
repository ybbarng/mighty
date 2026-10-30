import {
  type ByteReader,
  type ByteWriter,
  concat,
  equalBytes,
  sha256,
  toBase64Url,
  utf8,
} from "./bytes";
import { SIGNATURE_LENGTH, verifySignature } from "./keys";

/**
 * 응모자 서명(응모권·당첨 증명·별명)은 두 가지 모양이다(docs/36 11-2).
 * 1. 원시 P-256 서명(r‖s 64바이트): 터미널 열쇠 파일, 패스키를 못 쓰는 브라우저의 기기 안 열쇠
 * 2. 패스키(WebAuthn ES256) 단언: 인증기가 `authenticatorData ‖ SHA-256(clientDataJSON)`에
 *    DER 서명한다. clientDataJSON의 challenge가 서명할 내용의 해시(SHA-256)라서,
 *    결국 같은 내용에 대한 서명이 된다.
 * 어느 쪽이든 공개 열쇠는 P-256 압축하지 않은 65바이트라 응모자 id 규칙이 같다.
 *
 * 바이너리 형식: kind(u8)
 *   1 ‖ sig(64)
 *   2 ‖ authenticatorData(u16 길이 + 바이트) ‖ clientDataJSON(u16 길이 + 바이트) ‖ DER 서명(u16 길이 + 바이트)
 */

export type SignatureData =
  | { kind: "raw"; sig: Uint8Array }
  | {
      kind: "webauthn";
      authenticatorData: Uint8Array;
      clientDataJSON: Uint8Array;
      /** ASN.1 DER로 감싼 ECDSA 서명 */
      signature: Uint8Array;
    };

export type WebAuthnAssertion = Omit<
  Extract<SignatureData, { kind: "webauthn" }>,
  "kind"
>;

/** 패스키가 묶인 주소. 검사기는 이 사이트에서 만든 서명만 받는다 */
export interface WebAuthnPolicy {
  rpId: string;
  /** clientDataJSON.origin으로 받는 값. 개발·시험은 localhost를 더한다 */
  origins: readonly string[];
}

export const DEFAULT_WEBAUTHN_POLICY: WebAuthnPolicy = {
  rpId: "game.byb.kr",
  origins: ["https://game.byb.kr"],
};

/** 너무 큰 값으로 장부를 부풀리지 못하게 */
const MAX_AUTH_DATA = 512;
const MAX_CLIENT_DATA = 1024;
const MAX_DER = 72;

/**
 * 응모자 서명을 만드는 쪽. 원시 열쇠(`Signer`, 바이트를 돌려줌)도 패스키도 이 모양이다.
 */
export interface EntrantSigner {
  publicKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array | SignatureData>;
}

export async function signAsEntrant(
  signer: EntrantSigner,
  message: Uint8Array,
): Promise<SignatureData> {
  const out = await signer.sign(message);
  return out instanceof Uint8Array ? { kind: "raw", sig: out } : out;
}

/** 패스키에 넘길 challenge: 서명할 내용의 해시 */
export function webauthnChallenge(message: Uint8Array): Uint8Array {
  return sha256(message);
}

/**
 * 패스키 서명자. 화면은 `getAssertion`에 `navigator.credentials.get`
 * (challenge = 받은 값, allowCredentials = 이 패스키)을 넣는다.
 */
export function passkeySigner(
  publicKey: Uint8Array,
  getAssertion: (challenge: Uint8Array) => Promise<WebAuthnAssertion>,
): EntrantSigner {
  return {
    publicKey,
    sign: async (message) => ({
      kind: "webauthn",
      ...(await getAssertion(webauthnChallenge(message))),
    }),
  };
}

export function writeSignature(w: ByteWriter, s: SignatureData): ByteWriter {
  if (s.kind === "raw") return w.u8(1).fixed(s.sig, SIGNATURE_LENGTH);
  return w
    .u8(2)
    .bytes(s.authenticatorData)
    .bytes(s.clientDataJSON)
    .bytes(s.signature);
}

export function readSignature(r: ByteReader): SignatureData {
  const kind = r.u8();
  if (kind === 1) return { kind: "raw", sig: r.fixed(SIGNATURE_LENGTH) };
  if (kind === 2) {
    const authenticatorData = r.bytes();
    const clientDataJSON = r.bytes();
    const signature = r.bytes();
    if (
      authenticatorData.length > MAX_AUTH_DATA ||
      clientDataJSON.length > MAX_CLIENT_DATA ||
      signature.length > MAX_DER
    ) {
      throw new Error("패스키 서명이 너무 크다");
    }
    return { kind: "webauthn", authenticatorData, clientDataJSON, signature };
  }
  throw new Error(`모르는 서명 종류: ${kind}`);
}

/** 응모자 서명 확인. 패스키 서명은 정책(사이트·주소)도 맞아야 한다 */
export async function verifyEntrantSignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  s: SignatureData,
  policy: WebAuthnPolicy = DEFAULT_WEBAUTHN_POLICY,
): Promise<boolean> {
  if (s.kind === "raw") return verifySignature(publicKey, message, s.sig);
  if (!checkClientData(s.clientDataJSON, message, policy)) return false;
  if (!checkAuthenticatorData(s.authenticatorData, policy.rpId)) return false;
  const raw = derToP1363(s.signature);
  if (!raw) return false;
  return verifySignature(
    publicKey,
    concat(s.authenticatorData, sha256(s.clientDataJSON)),
    raw,
  );
}

function checkClientData(
  clientDataJSON: Uint8Array,
  message: Uint8Array,
  policy: WebAuthnPolicy,
): boolean {
  let data: unknown;
  try {
    data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(clientDataJSON),
    );
  } catch {
    return false;
  }
  if (typeof data !== "object" || data === null) return false;
  const c = data as Record<string, unknown>;
  return (
    c.type === "webauthn.get" &&
    c.challenge === toBase64Url(webauthnChallenge(message)) &&
    typeof c.origin === "string" &&
    policy.origins.includes(c.origin) &&
    c.crossOrigin !== true
  );
}

/** authenticatorData flags: UP(사람이 있음, 0x01)과 UV(본인 확인, 0x04) */
export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
const REQUIRED_FLAGS = FLAG_UP | FLAG_UV;

/**
 * rpIdHash(32) ‖ flags(1) ‖ signCount(4) ‖ … — 사이트가 맞고, 사람이 눌렀고(UP),
 * 인증기가 지문·얼굴·PIN으로 본인 확인을 했는지(UV) 본다(docs/36 4절, 2026-10-30).
 * 화면은 늘 `userVerification: "required"`로 부르므로 진짜 패스키 서명에는 UV가 켜져 있다.
 * 가상 인증기는 UV도 꾸밀 수 있어 자동화를 막지는 못한다
 */
export function checkAuthenticatorData(
  authData: Uint8Array,
  rpId: string,
): boolean {
  if (authData.length < 37) return false;
  if (!equalBytes(authData.slice(0, 32), sha256(utf8(rpId)))) return false;
  return ((authData[32] ?? 0) & REQUIRED_FLAGS) === REQUIRED_FLAGS;
}

/** DER(SEQUENCE { INTEGER r, INTEGER s }) → r‖s 64바이트. 모양이 틀리면 null */
export function derToP1363(der: Uint8Array): Uint8Array | null {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2)
    return null;
  const out = new Uint8Array(64);
  let at = 2;
  for (let part = 0; part < 2; part++) {
    if (der[at] !== 0x02) return null;
    const len = der[at + 1] ?? 0;
    let start = at + 2;
    const end = start + len;
    if (len === 0 || end > der.length) return null;
    // 양수 표시용 앞 0 바이트를 떼어 낸다
    while (end - start > 32 && der[start] === 0) start++;
    if (end - start > 32) return null;
    out.set(der.slice(start, end), part * 32 + 32 - (end - start));
    at = end;
  }
  return at === der.length ? out : null;
}

/** r‖s 64바이트 → DER. 시험의 가짜 인증기와 터미널이 쓴다 */
export function p1363ToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error("서명은 64바이트");
  const int = (b: Uint8Array) => {
    let start = 0;
    while (start < b.length - 1 && b[start] === 0) start++;
    const body = b.slice(start);
    const padded =
      (body[0] ?? 0) & 0x80 ? concat(new Uint8Array([0]), body) : body;
    return concat(new Uint8Array([0x02, padded.length]), padded);
  };
  const seq = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, seq.length]), seq);
}

/**
 * 패스키 공개 열쇠(`AuthenticatorAttestationResponse.getPublicKey()`의 SPKI DER)
 * → 압축하지 않은 65바이트. P-256 SPKI는 91바이트이고 끝 65바이트가 열쇠다.
 */
export function rawPublicKeyFromSpki(spki: Uint8Array): Uint8Array {
  const prefix = Uint8Array.from([
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
    0x42, 0x00,
  ]);
  if (spki.length !== 91 || !equalBytes(spki.slice(0, 26), prefix)) {
    throw new Error("P-256 공개 열쇠(SPKI)가 아니다");
  }
  return spki.slice(26);
}
