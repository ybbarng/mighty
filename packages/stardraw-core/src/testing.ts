import { p256 } from "@noble/curves/nist.js";

import { ByteWriter, concat, sha256, toBase64Url, toHex, utf8 } from "./bytes";
import { encodeDer, encodeInteger, encodeOid, TAG } from "./der";
import { generateSigner, type Signer } from "./keys";
import type { PowParams } from "./pow";
import { type KeyRegistration, makeRegistration } from "./registration";
import { spkiFromRaw } from "./rekor";
import type { Schedule } from "./schedule";
import {
  type EntrantSigner,
  p1363ToDer,
  passkeySigner,
  rawPublicKeyFromSpki,
  type WebAuthnAssertion,
} from "./signature";
import { makeTicket, type Ticket } from "./ticket";
import type { TsaAuthority } from "./tsa";

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
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 60,
      powTarget: EASY_TARGET,
      registerPowTarget: EASY_TARGET,
    },
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

/** 원시 열쇠 등록(쉬운 목표값). 시험은 1회차 문제 값으로 1회차에 등록한다 */
export async function registerRaw(
  keys: readonly { publicKey: Uint8Array }[],
  challenge: Uint8Array,
): Promise<KeyRegistration[]> {
  return Promise.all(
    keys.map(async (key) => {
      const r = await makeRegistration(
        key,
        "raw",
        new Uint8Array(),
        challenge,
        EASY_TARGET,
        { params: TEST_POW },
      );
      if (!r) throw new Error("등록을 만들지 못했다");
      return r;
    }),
  );
}

export async function registerPasskey(
  passkey: { credentialId: Uint8Array; signer: EntrantSigner },
  challenge: Uint8Array,
): Promise<KeyRegistration> {
  const r = await makeRegistration(
    passkey.signer,
    "passkey",
    passkey.credentialId,
    challenge,
    EASY_TARGET,
    { params: TEST_POW },
  );
  if (!r) throw new Error("등록을 만들지 못했다");
  return r;
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

// ── 가짜 시각 인증 기관(RFC 3161) ──

/**
 * 시험용 시각 인증 기관: 자기 루트와 서명 인증서(P-256)를 갖고, 실제 기관과 같은 모양의 토큰을 낸다.
 * 실제 기관 토큰은 담긴 값이 고정이라(tsa.fixtures.ts), 회차 봉인 값을 담은 토큰이 필요한 시험이 쓴다.
 * 열쇠는 이름에서 정해져 늘 같은 토큰이 나온다.
 */
export class FakeTsa {
  readonly authority: TsaAuthority;
  /** 다음 응답의 HTTP 상태 */
  status = 200;
  /** 찍는 시각을 지금보다 이만큼(초) 옮긴다 */
  shift = 0;
  /** true면 다른 값을 담은 토큰을 낸다 */
  wrongImprint = false;
  requests = 0;

  private readonly tsaKey: Uint8Array;
  private readonly tsaCert: Uint8Array;
  private readonly rootCert: Uint8Array;
  private readonly tsaName: Uint8Array;
  private serial = 1;

  constructor(
    name: string,
    private readonly nowSeconds: () => number,
  ) {
    const rootKey = sha256(utf8(`fake tsa root ${name}`));
    this.tsaKey = sha256(utf8(`fake tsa signer ${name}`));
    const rootName = x509Name(`${name} root`);
    this.tsaName = x509Name(`${name} signer`);
    const rootSpki = spkiFromRaw(p256.getPublicKey(rootKey, false));
    this.rootCert = x509Cert(1, rootName, rootName, rootSpki, rootKey, false);
    this.tsaCert = x509Cert(
      2,
      rootName,
      this.tsaName,
      spkiFromRaw(p256.getPublicKey(this.tsaKey, false)),
      rootKey,
      true,
    );
    this.authority = {
      name,
      url: `https://${name}.tsa.test`,
      pins: [toHex(sha256(rootSpki))],
    };
  }

  /** imprint를 담은 토큰(ContentInfo DER) */
  stamp(imprint: Uint8Array, genTime: number): Uint8Array {
    const tst = encodeDer(
      TAG.sequence,
      encodeInteger(1),
      encodeOid("1.2.3.4"),
      encodeDer(
        TAG.sequence,
        encodeDer(TAG.sequence, encodeOid(OID_SHA256), encodeDer(TAG.null)),
        encodeDer(TAG.octetString, imprint),
      ),
      encodeInteger(this.serial++),
      encodeDer(TAG.generalizedTime, utf8(generalized(genTime))),
    );
    const attrs = concat(
      encodeDer(
        TAG.sequence,
        encodeOid("1.2.840.113549.1.9.3"),
        encodeDer(TAG.set, encodeOid(OID_TSTINFO)),
      ),
      encodeDer(
        TAG.sequence,
        encodeOid("1.2.840.113549.1.9.4"),
        encodeDer(TAG.set, encodeDer(TAG.octetString, sha256(tst))),
      ),
    );
    const signature = ecdsaDer(encodeDer(TAG.set, attrs), this.tsaKey);
    const signerInfo = encodeDer(
      TAG.sequence,
      encodeInteger(1),
      encodeDer(TAG.sequence, this.rootName(), encodeInteger(2)),
      encodeDer(TAG.sequence, encodeOid(OID_SHA256), encodeDer(TAG.null)),
      encodeDer(0xa0, attrs),
      encodeDer(TAG.sequence, encodeOid(OID_ECDSA_SHA256)),
      encodeDer(TAG.octetString, signature),
    );
    const signedData = encodeDer(
      TAG.sequence,
      encodeInteger(3),
      encodeDer(
        TAG.set,
        encodeDer(TAG.sequence, encodeOid(OID_SHA256), encodeDer(TAG.null)),
      ),
      encodeDer(
        TAG.sequence,
        encodeOid(OID_TSTINFO),
        encodeDer(0xa0, encodeDer(TAG.octetString, tst)),
      ),
      encodeDer(0xa0, this.tsaCert, this.rootCert),
      encodeDer(TAG.set, signerInfo),
    );
    return encodeDer(
      TAG.sequence,
      encodeOid("1.2.840.113549.1.7.2"),
      encodeDer(0xa0, signedData),
    );
  }

  /** 서버가 쓰는 fetch 자리: TimeStampReq를 받아 TimeStampResp를 돌려준다 */
  fetch: typeof fetch = (async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    this.requests++;
    if (this.status !== 200)
      return new Response("busy", { status: this.status });
    const req = new Uint8Array(init?.body as ArrayBuffer);
    // 요청 끝 쪽: … OCTET STRING(32) imprint, BOOLEAN certReq
    const imprint = req.slice(req.length - 3 - 32, req.length - 3);
    if (this.wrongImprint) imprint[0] = (imprint[0] ?? 0) ^ 1;
    const token = this.stamp(imprint, this.nowSeconds() + this.shift);
    const body = encodeDer(
      TAG.sequence,
      encodeDer(TAG.sequence, encodeInteger(0)),
      token,
    );
    return new Response(body as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: { "content-type": "application/timestamp-reply" },
    });
  }) as typeof fetch;

  private rootName(): Uint8Array {
    return x509Name(`${this.authority.name} root`);
  }
}

const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_TSTINFO = "1.2.840.113549.1.9.16.1.4";
const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";

function x509Name(cn: string): Uint8Array {
  return encodeDer(
    TAG.sequence,
    encodeDer(
      TAG.set,
      encodeDer(TAG.sequence, encodeOid("2.5.4.3"), encodeDer(0x0c, utf8(cn))),
    ),
  );
}

function x509Cert(
  serial: number,
  issuer: Uint8Array,
  subject: Uint8Array,
  spki: Uint8Array,
  signerKey: Uint8Array,
  timeStamping: boolean,
): Uint8Array {
  const ext = timeStamping
    ? [
        encodeDer(
          0xa3,
          encodeDer(
            TAG.sequence,
            encodeDer(
              TAG.sequence,
              encodeOid("2.5.29.37"),
              encodeDer(TAG.boolean, new Uint8Array([0xff])),
              encodeDer(
                TAG.octetString,
                encodeDer(TAG.sequence, encodeOid("1.3.6.1.5.5.7.3.8")),
              ),
            ),
          ),
        ),
      ]
    : [];
  const tbs = encodeDer(
    TAG.sequence,
    encodeDer(0xa0, encodeInteger(2)),
    encodeInteger(serial),
    encodeDer(TAG.sequence, encodeOid(OID_ECDSA_SHA256)),
    issuer,
    encodeDer(
      TAG.sequence,
      encodeDer(TAG.utcTime, utf8("200101000000Z")),
      encodeDer(TAG.generalizedTime, utf8("20991231000000Z")),
    ),
    subject,
    spki,
    ...ext,
  );
  return encodeDer(
    TAG.sequence,
    tbs,
    encodeDer(TAG.sequence, encodeOid(OID_ECDSA_SHA256)),
    encodeDer(TAG.bitString, new Uint8Array([0]), ecdsaDer(tbs, signerKey)),
  );
}

function ecdsaDer(message: Uint8Array, key: Uint8Array): Uint8Array {
  return p1363ToDer(p256.sign(message, key));
}

function generalized(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
}
