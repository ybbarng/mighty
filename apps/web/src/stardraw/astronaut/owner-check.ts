import {
  ByteWriter,
  type EntrantSigner,
  signAsEntrant,
  utf8,
  verifyEntrantSignature,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

/**
 * 등록증 주인 확인(docs/36 11-9, 모바일 신분증 검사처럼). 등록증을 누르면 그 자리에서 만든 새 문제 값에
 * 패스키로 서명하고, 이 기기 안에서 등록증의 공개 열쇠로 서명을 확인한다. 서버에 묻지 않는다.
 * 문제 값에 시각과 무작위 32바이트를 넣어, 지난 서명을 다시 내밀어도 통과하지 못한다.
 * 다른 사람의 등록증(공유받은 주소)은 이 기기에 그 패스키가 없어 서명이 맞지 않아 실패한다.
 */
export const OWNER_CHECK_TAG = "stardraw/owner-check/v1";

/** 확인이 이어지는 시간(초). 지나면 원래 모습으로 */
export const OWNER_CHECK_SECONDS = 30;

/** 서명할 내용: 태그 ‖ 공개 열쇠 ‖ 무작위 32바이트 ‖ 시각(초) */
export function ownerMessage(
  pub: Uint8Array,
  nonce: Uint8Array,
  at: number,
): Uint8Array {
  if (nonce.length !== 32) throw new Error("문제 값은 32바이트여야 한다");
  const tag = utf8(OWNER_CHECK_TAG);
  return new ByteWriter()
    .fixed(tag, tag.length)
    .fixed(pub, pub.length)
    .fixed(nonce, 32)
    .u64(at)
    .done();
}

/**
 * 주인 확인 한 번: 새 문제 값을 만들어 `signer`로 서명하고 `pub`으로 확인한다.
 * 서명을 취소하거나 맞지 않으면 false(화면은 조용히 "확인하지 못했습니다")
 */
export async function checkOwner(
  pub: Uint8Array,
  signer: EntrantSigner,
  policy: WebAuthnPolicy,
  at: number,
  random: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n)),
): Promise<boolean> {
  const message = ownerMessage(pub, random(32), at);
  try {
    const sig = await signAsEntrant(signer, message);
    return await verifyEntrantSignature(pub, message, sig, policy);
  } catch {
    return false;
  }
}
