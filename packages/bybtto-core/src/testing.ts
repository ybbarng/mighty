import { ByteWriter, concat, sha256, toBase64Url, utf8 } from "./bytes";
import { generateSigner, type Signer } from "./keys";
import type { PowParams } from "./pow";
import type { Schedule } from "./schedule";
import {
  type EntrantSigner,
  p1363ToDer,
  passkeySigner,
  rawPublicKeyFromSpki,
  type WebAuthnAssertion,
} from "./signature";
import { makeTicket, type Ticket } from "./ticket";

/**
 * 시험용 도구(index에서 내보내지 않는다).
 * 작업 증명은 규칙의 16MB 대신 가장 작은 메모리로 돌리고, 목표값을 넉넉히 둬 몇 번 만에 풀린다.
 */

export const TEST_POW: PowParams = { memorySize: 8, iterations: 1 };
/** 평균 2번 만에 풀린다 */
export const EASY_TARGET = 2 ** 31;

// 2026-10-29 15:00 KST
export const TEST_EPOCH = 1793253600;

export const HOURLY: Schedule = {
  epoch: TEST_EPOCH,
  entries: [
    { fromRound: 1, length: 3600, closeMargin: 60, powTarget: EASY_TARGET },
  ],
};

export async function signers(n: number): Promise<Signer[]> {
  return Promise.all(Array.from({ length: n }, () => generateSigner()));
}

export async function ticketFor(
  signer: EntrantSigner,
  round: number,
  numbers: number[],
  challenge: Uint8Array,
): Promise<Ticket> {
  const t = await makeTicket(signer, round, numbers, challenge, EASY_TARGET, {
    params: TEST_POW,
  });
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

export interface FakePasskeyOptions {
  rpId?: string;
  origin?: string;
  /** authenticatorData flags. 기본 0x05(UP + UV) */
  flags?: number;
  type?: string;
}

/**
 * 가짜 패스키 인증기. 브라우저가 돌려주는 것과 같은 모양으로 단언을 만든다:
 * authenticatorData = SHA-256(rpId) ‖ flags ‖ signCount(u32),
 * clientDataJSON = {"type","challenge"(base64url),"origin","crossOrigin"} 순서의 JSON,
 * signature = authenticatorData ‖ SHA-256(clientDataJSON)에 대한 ES256 DER 서명.
 * 공개 열쇠는 `getPublicKey()`처럼 SPKI로도 준다.
 */
export async function fakePasskey(options: FakePasskeyOptions = {}) {
  const rpId = options.rpId ?? "game.byb.kr";
  const origin = options.origin ?? "https://game.byb.kr";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(
    await crypto.subtle.exportKey("spki", keyPair.publicKey),
  );
  let signCount = 0;
  const getAssertion = async (
    challenge: Uint8Array,
  ): Promise<WebAuthnAssertion> => {
    signCount++;
    const authenticatorData = concat(
      sha256(utf8(rpId)),
      new Uint8Array([options.flags ?? 0x05]),
      new ByteWriter().u32(signCount).done(),
    );
    const clientDataJSON = utf8(
      JSON.stringify({
        type: options.type ?? "webauthn.get",
        challenge: toBase64Url(challenge),
        origin,
        crossOrigin: false,
      }),
    );
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new Uint8Array(concat(authenticatorData, sha256(clientDataJSON))),
      ),
    );
    return { authenticatorData, clientDataJSON, signature: p1363ToDer(raw) };
  };
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  return {
    spki,
    credentialId,
    signer: passkeySigner(rawPublicKeyFromSpki(spki), getAssertion),
  };
}

/** 48바이트 가짜 drand 서명(시험은 서명 확인을 바꿔 끼운다) */
export function fakeSignature(seed: number): Uint8Array {
  return Uint8Array.from({ length: 48 }, (_, i) => (seed * 31 + i * 7) & 255);
}
