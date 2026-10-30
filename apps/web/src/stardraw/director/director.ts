import {
  type DirectorView,
  directorFingerprint,
  directorKeyConfig,
  encodeOperation,
  fromBase64Url,
  type OpBody,
  type Operation,
  opMessage,
  rawPublicKeyFromSpki,
  signAsDirector,
  signerFromKeyPair,
  softCredentialId,
  softPasskeySigner,
  toBase64Url,
  webauthnChallenge,
} from "@mighty/stardraw-core";

import { requestUnlock, type UnlockPurpose } from "../demo-unlock";
import type { DirectorState, LocalLedger } from "../local-ledger";
import { hasUserVerification, sitePolicy } from "../wallet";

/**
 * 우주국장 관리 화면의 바탕(docs/36 11-12).
 * - 장부 쪽(`DirectorBackend`): 실제는 서버 API, 데모는 기기 안 연습 장부. 둘 다 같은 상태 모양을 준다.
 * - 열쇠 쪽(`DirectorKeyring`): 실제는 국장 패스키(WebAuthn, 우주인 패스키와 다른 패스키), 데모는 흉내 패스키.
 * 이 화면에서 패스키를 만든다고 국장이 되지 않는다. 장부에 "국장 열쇠 지정"이 실리고 3회차 예고가 지나야 서명이 통한다.
 */

export type { DirectorState };

export interface SubmitResult {
  id: string;
  round: number;
  effectiveRound: number;
}

export interface DirectorBackend {
  state(): Promise<DirectorState>;
  submit(op: Operation): Promise<SubmitResult>;
  /** 자격 기간 열기 전에: 새 도장 열쇠를 만들게 하고 공개 열쇠를 받는다(비밀은 서버에, docs/36 11-13) */
  issuerKey(): Promise<Uint8Array>;
}

/** 서버 API(같은 출처 /stardraw-api) */
export function remoteDirectorBackend(
  base: string,
  f: typeof fetch = (...args) => fetch(...args),
): DirectorBackend {
  const read = async (res: Response) => {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok)
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : `서버에 닿지 않습니다(${res.status})`,
      );
    return body;
  };
  return {
    async state() {
      const res = await f(`${base}/api/director/state`, { cache: "no-store" });
      return (await read(res)) as unknown as DirectorState;
    },
    async submit(op) {
      const res = await f(`${base}/api/director/ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: toBase64Url(encodeOperation(op)) }),
      });
      return (await read(res)) as unknown as SubmitResult;
    },
    async issuerKey() {
      const res = await f(`${base}/api/director/qual-key`, { method: "POST" });
      const body = await read(res);
      return fromBase64Url(String(body.issuerKey));
    },
  };
}

/** 데모: 기기 안 연습 장부가 서버 노릇을 한다 */
export function practiceDirectorBackend(ledger: LocalLedger): DirectorBackend {
  return {
    state: () => ledger.directorState(),
    submit: (op) => ledger.submitOperation(op),
    issuerKey: async () => ledger.createIssuerKey(),
  };
}

export interface DirectorKey {
  credentialId: Uint8Array;
  pub: Uint8Array;
  /** 이 기기에서 만든 시각(ms). 예전에 저장한 열쇠에는 없다 */
  createdAt?: number;
}

/** 고른 패스키가 장부의 국장 열쇠가 아닐 때 */
export class NotDirectorError extends Error {
  constructor(message = "고른 패스키는 국장 열쇠가 아닙니다") {
    super(message);
    this.name = "NotDirectorError";
  }
}

export interface DirectorKeyring {
  /** 이 기기에서 만든 국장 패스키(설정 값을 다시 보여 주려고 기억한다) */
  saved(): DirectorKey[];
  create(): Promise<DirectorKey>;
  /** 패스키를 고르게 해 서명한다. 장부의 국장 열쇠(directors)가 아니면 NotDirectorError */
  sign(body: OpBody, directors: readonly DirectorView[]): Promise<Operation>;
}

export const DIRECTOR_PASSKEY_NAME = "카노푸스 우주국장";

function readKeys(key: string): DirectorKey[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]") as {
      c: string;
      p: string;
      t?: number;
    }[];
    return list.map((k) => ({
      credentialId: fromBase64Url(k.c),
      pub: fromBase64Url(k.p),
      ...(typeof k.t === "number" ? { createdAt: k.t } : {}),
    }));
  } catch {
    return [];
  }
}

function writeKeys(key: string, keys: readonly DirectorKey[]): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        keys.map((k) => ({
          c: toBase64Url(k.credentialId),
          p: toBase64Url(k.pub),
          ...(k.createdAt === undefined ? {} : { t: k.createdAt }),
        })),
      ),
    );
  } catch {
    // 저장소를 못 쓰면 이번 방문 동안만 보인다(설정 값은 장부·서버에 남는다)
  }
}

const sameId = (a: Uint8Array, b: string) => toBase64Url(a) === b;

/** 실제 국장 패스키(WebAuthn). 응모용 우주인 패스키와 다른 사용자 id로 만든다 */
export function passkeyKeyring(
  storageKey = "stardraw-director-keys",
): DirectorKeyring {
  return {
    saved: () => readKeys(storageKey),

    async create() {
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { id: location.hostname, name: "하늘의 별 따기" },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: DIRECTOR_PASSKEY_NAME,
            displayName: DIRECTOR_PASSKEY_NAME,
          },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!credential)
        throw new DOMException("패스키를 만들지 않았습니다", "NotAllowedError");
      const response = credential.response as AuthenticatorAttestationResponse;
      const spki = response.getPublicKey?.();
      if (!spki || response.getPublicKeyAlgorithm?.() !== -7)
        throw new DOMException(
          "이 기기는 맞는 패스키(P-256)를 만들지 못합니다",
          "NotSupportedError",
        );
      const authData = response.getAuthenticatorData?.();
      if (authData && !hasUserVerification(new Uint8Array(authData)))
        throw new DOMException(
          "이 기기는 지문·얼굴·화면 잠금으로 본인 확인을 하지 못합니다",
          "NotSupportedError",
        );
      const key = {
        credentialId: new Uint8Array(credential.rawId),
        pub: rawPublicKeyFromSpki(new Uint8Array(spki)),
        createdAt: Date.now(),
      };
      writeKeys(storageKey, [...readKeys(storageKey), key]);
      return key;
    },

    async sign(body, directors) {
      // 패스키를 고르게 한다(우주인 패스키를 골라도 막지 않고, 고른 뒤 국장 열쇠인지 본다)
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(webauthnChallenge(opMessage(body))),
          rpId: location.hostname,
          userVerification: "required",
        },
      })) as PublicKeyCredential | null;
      if (!credential)
        throw new DOMException("서명하지 않았습니다", "NotAllowedError");
      const rawId = new Uint8Array(credential.rawId);
      const director = directors.find(
        (d) => d.until === null && sameId(rawId, d.credentialId),
      );
      if (!director) {
        const mine = readKeys(storageKey).some(
          (k) => toBase64Url(k.credentialId) === toBase64Url(rawId),
        );
        throw new NotDirectorError(
          mine
            ? "이 패스키는 아직 국장 열쇠가 아닙니다. 우주국이 장부에 지정하고 3회차가 지나야 서명할 수 있습니다"
            : "고른 패스키는 국장 열쇠가 아닙니다(우주인 패스키이거나 지정되지 않은 패스키)",
        );
      }
      const response = credential.response as AuthenticatorAssertionResponse;
      return {
        ...body,
        signer: {
          role: "director",
          pub: fromBase64Url(director.pub),
          signature: {
            kind: "webauthn",
            authenticatorData: new Uint8Array(response.authenticatorData),
            clientDataJSON: new Uint8Array(response.clientDataJSON),
            signature: new Uint8Array(response.signature),
          },
        },
      } as Operation;
    },
  };
}

/**
 * 데모 국장 패스키: 실제 패스키를 만들지 않고(데모 지갑과 같은 이유) 이 기기 안 열쇠로 흉내 낸다.
 * 서명 순간마다 흉내 시트로 확인받는다
 */
export function demoKeyring(
  ns: string,
  unlock: (purpose: UnlockPurpose) => Promise<boolean> = requestUnlock,
): DirectorKeyring & {
  /** 「국장 아닌 패스키로 해 보기」: 지정되지 않은 새 열쇠로 서명한다 */
  signAsStranger(body: OpBody): Promise<Operation>;
} {
  const KEY = `${ns}-director-key`;
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const confirm = async (purpose: UnlockPurpose) => {
    if (!(await unlock(purpose)))
      throw new DOMException("확인을 취소했습니다", "NotAllowedError");
  };
  const loadPair = async (): Promise<CryptoKeyPair | null> => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
        priv: JsonWebKey;
        pub: JsonWebKey;
      } | null;
      if (!saved) return null;
      return {
        privateKey: await crypto.subtle.importKey(
          "jwk",
          saved.priv,
          algorithm,
          false,
          ["sign"],
        ),
        publicKey: await crypto.subtle.importKey(
          "jwk",
          saved.pub,
          algorithm,
          true,
          ["verify"],
        ),
      };
    } catch {
      return null;
    }
  };
  return {
    saved: () => readKeys(`${KEY}-pub`),

    async create() {
      await confirm("create");
      const pair = await crypto.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ]);
      const pub = new Uint8Array(
        await crypto.subtle.exportKey("raw", pair.publicKey),
      );
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            priv: await crypto.subtle.exportKey("jwk", pair.privateKey),
            pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
          }),
        );
      } catch {
        // 저장하지 못하면 이번 방문 동안만
      }
      const key = {
        credentialId: softCredentialId(pub),
        pub,
        createdAt: Date.now(),
      };
      writeKeys(`${KEY}-pub`, [key]);
      return key;
    },

    async sign(body, directors) {
      const pair = await loadPair();
      if (!pair) throw new NotDirectorError("먼저 국장 패스키를 만들어 주세요");
      const signer = await signerFromKeyPair(pair);
      await confirm("sign");
      const id = toBase64Url(softCredentialId(signer.publicKey));
      if (!directors.some((d) => d.until === null && d.credentialId === id))
        throw new NotDirectorError(
          "이 패스키는 아직 국장 열쇠가 아닙니다. 지정 기록이 실리고 3회차가 지나야 합니다",
        );
      return signAsDirector(
        body,
        softPasskeySigner(signer, { policy: sitePolicy() }),
      );
    },

    async signAsStranger(body) {
      await confirm("sign");
      const pair = await crypto.subtle.generateKey(algorithm, false, [
        "sign",
        "verify",
      ]);
      return signAsDirector(
        body,
        softPasskeySigner(await signerFromKeyPair(pair), {
          policy: sitePolicy(),
        }),
      );
    },
  };
}

/** 설정에 넣을 값과 지문 */
export function keyLabel(key: DirectorKey): {
  config: string;
  fingerprint: string;
} {
  return {
    config: directorKeyConfig(key.credentialId, key.pub),
    fingerprint: directorFingerprint(key.pub),
  };
}
