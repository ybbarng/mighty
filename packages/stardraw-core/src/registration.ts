import {
  ByteReader,
  ByteWriter,
  compareBytes,
  concat,
  taggedHash,
  utf8,
} from "./bytes";
import { PUBLIC_KEY_LENGTH } from "./keys";
import { type SolveOptions, solvePow } from "./pow";
import { RAW_KEY_KIND, RawKeyRejected } from "./signature";

/**
 * 열쇠 등록(docs/36 5절, 11-2). 응모하려면 먼저 공개 열쇠를 장부에 등록한다.
 * - 패스키는 만들 때만 공개 열쇠를 알려 주므로, 새 기기에서 패스키 번호(credential id)로
 *   공개 열쇠를 찾으려면 이 기록이 있어야 한다. 서버가 저장하는 것은 이 기록뿐이다(이름·이메일 없음).
 * - 등록에는 응모권보다 훨씬 무거운 작업 증명이 든다(`registerPowTarget`). 열쇠를 대량으로
 *   만들어 응모권을 여러 장 내는 것을 억제한다.
 * - 등록에는 서명이 없다. 남의 공개 열쇠를 먼저 등록해 봐야 그 열쇠로 서명할 수 없어
 *   쓸모가 없고, 같은 열쇠·같은 패스키 번호는 장부에 한 번만 들어간다(먼저 들어간 것이 이긴다).
 *   열쇠를 가졌다는 것은 응모권 서명이 증명한다.
 *
 * 바이너리 형식: v(u8) ‖ kind(u8 = 2, 패스키) ‖ credentialId(u16 길이 + 바이트) ‖ pub(65) ‖ nonce(u32)
 * credentialId는 1~1023바이트(WebAuthn 상한)다. kind 1(원시 열쇠, credentialId 빈 값)은
 * 2026-10-30부터 받지 않는다(docs/36 11-11). kind 바이트는 이미 장부에 실린 등록과 맞추려고 남긴다.
 * 작업 증명 대상은 용도 이름 ‖ nonce를 뺀 앞부분이라 응모권 작업 증명과 섞이지 않는다.
 */

export const REGISTRATION_VERSION = 1;
export const MAX_CREDENTIAL_ID = 1023;
/** 등록 바이트의 kind 값. 패스키만 받는다 */
export const PASSKEY_KIND = 2;

export interface KeyRegistration {
  v: number;
  /** 패스키 번호 */
  credentialId: Uint8Array;
  pub: Uint8Array;
  nonce: number;
}

export type UnsolvedRegistration = Omit<KeyRegistration, "nonce">;

export function checkRegistration(r: UnsolvedRegistration): string | null {
  if (r.v !== REGISTRATION_VERSION) return `모르는 등록 판: ${r.v}`;
  if (r.pub.length !== PUBLIC_KEY_LENGTH || r.pub[0] !== 0x04)
    return "공개 열쇠는 압축하지 않은 P-256 65바이트";
  if (r.credentialId.length < 1 || r.credentialId.length > MAX_CREDENTIAL_ID) {
    return `패스키 번호는 1~${MAX_CREDENTIAL_ID}바이트`;
  }
  return null;
}

function head(r: UnsolvedRegistration): ByteWriter {
  const problem = checkRegistration(r);
  if (problem) throw new Error(problem);
  return new ByteWriter()
    .u8(r.v)
    .u8(PASSKEY_KIND)
    .bytes(r.credentialId)
    .fixed(r.pub, PUBLIC_KEY_LENGTH);
}

/** 작업 증명 대상 */
export function registrationContent(r: UnsolvedRegistration): Uint8Array {
  return concat(
    utf8("stardraw/register/v1"),
    new Uint8Array([0]),
    head(r).done(),
  );
}

export function encodeRegistration(r: KeyRegistration): Uint8Array {
  return head(r).u32(r.nonce).done();
}

export function decodeRegistration(bytes: Uint8Array): KeyRegistration {
  const reader = new ByteReader(bytes);
  const v = reader.u8();
  const kindByte = reader.u8();
  if (kindByte === RAW_KEY_KIND) throw new RawKeyRejected();
  if (kindByte !== PASSKEY_KIND)
    throw new Error(`모르는 열쇠 종류: ${kindByte}`);
  const r: KeyRegistration = {
    v,
    credentialId: reader.bytes(),
    pub: reader.fixed(PUBLIC_KEY_LENGTH),
    nonce: reader.u32(),
  };
  reader.end();
  const problem = checkRegistration(r);
  if (problem) throw new Error(problem);
  return r;
}

export function registrationId(r: KeyRegistration): Uint8Array {
  return taggedHash("stardraw/registration/v1", encodeRegistration(r));
}

/** 장부의 등록 목록과 머클 잎은 id 사전 순이다 */
export function sortRegistrations(
  list: readonly KeyRegistration[],
): KeyRegistration[] {
  return list
    .map((r) => ({ r, id: registrationId(r) }))
    .sort((a, b) => compareBytes(a.id, b.id))
    .map(({ r }) => r);
}

/**
 * 등록 만들기: 작업 증명을 푼다. 문제 값은 응모권과 같이 그 회차의 문제 값(앞 기록 해시)이고,
 * 등록은 그 회차 기록에 들어간다. 취소되면 null
 */
export async function makeRegistration(
  key: { publicKey: Uint8Array },
  credentialId: Uint8Array,
  challenge: Uint8Array,
  registerPowTarget: number,
  options: SolveOptions = {},
): Promise<KeyRegistration | null> {
  const unsolved: UnsolvedRegistration = {
    v: REGISTRATION_VERSION,
    credentialId,
    pub: key.publicKey,
  };
  const nonce = await solvePow(
    challenge,
    registrationContent(unsolved),
    registerPowTarget,
    options,
  );
  return nonce === null ? null : { ...unsolved, nonce };
}
