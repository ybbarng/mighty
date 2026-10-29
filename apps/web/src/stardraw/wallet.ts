import {
  decodeTicket,
  type EntrantSigner,
  encodeTicket,
  fromBase64Url,
  passkeySigner,
  rawPublicKeyFromSpki,
  type Ticket,
  toBase64Url,
  type WebAuthnAssertion,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

/**
 * 내 열쇠와 내 응모권(docs/36 11-2). 브라우저 응모는 패스키로만 한다(2026-10-29 사용자).
 * 비밀 열쇠는 인증기(iCloud 키체인·Google 비밀번호 관리자·1Password·Windows Hello·보안 키 등) 안에만 있고,
 * 여기에는 패스키 번호와 공개 열쇠만 둔다. 응모·확인마다 Face ID·지문·화면 잠금 한 번.
 * 터미널 도구(나중)는 열쇠 파일을 쓴다.
 * 저장 이름공간(`ns`)이 다르면 서로 보이지 않는다(데모는 실제 게임과 따로 둔다).
 */

export const PASSKEY_NAME = "하늘의 별 따기";

export interface KeyInfo {
  kind: "passkey";
  credentialId: Uint8Array;
  pub: Uint8Array;
}

export interface MyTicket {
  ticket: Ticket;
  /** 장부가 받은 시각(초) */
  receivedAt: number;
}

/** 이 페이지 주소의 패스키 정책(검사기·확인 화면도 같은 값을 쓴다) */
export function sitePolicy(): WebAuthnPolicy {
  return { rpId: location.hostname, origins: [location.origin] };
}

function readJson<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면(사생활 보호 창 등) 이번 방문 동안만 기억한다
  }
}

export interface Wallet {
  loadKey(): KeyInfo | null;
  /** 새 패스키를 만든다(응모 단추를 처음 누를 때) */
  createPasskey(): Promise<KeyInfo>;
  /**
   * 다른 기기·브라우저에서: 따라온 패스키로 한 번 확인하고, 장부에서 그 패스키의 공개 열쇠를 찾아 기억한다.
   * `lookup`은 패스키 번호로 공개 열쇠를 찾는다(장부에 등록이 있어야 한다)
   */
  recoverPasskey(
    lookup: (credentialId: Uint8Array) => Promise<Uint8Array | null>,
  ): Promise<KeyInfo | null>;
  signerFor(key: KeyInfo): Promise<EntrantSigner>;
  loadTickets(): MyTicket[];
  addTicket(mine: MyTicket): void;
  /** 결과 봉투를 연 회차 */
  openedRounds(): Set<number>;
  markOpened(round: number): void;
  /** 이 이름공간의 지갑을 모두 지운다(데모 처음부터) */
  clear(): Promise<void>;
}

export function createWallet(ns: string): Wallet {
  const KEY = `${ns}-key`;
  const TICKETS = `${ns}-tickets`;
  const OPENED = `${ns}-opened`;

  const saveKey = (key: KeyInfo) =>
    writeJson(KEY, {
      kind: key.kind,
      pub: toBase64Url(key.pub),
      credentialId: toBase64Url(key.credentialId),
    });

  const readTickets = () =>
    readJson<{ t: string; at: number }[]>(TICKETS) ?? [];

  const ticketIds = () => new Set(readTickets().map((s) => s.t));

  return {
    loadKey() {
      const saved = readJson<{
        kind: string;
        credentialId?: string;
        pub: string;
      }>(KEY);
      // 예전 판의 "이 기기에만 둔 열쇠"(raw)는 더 쓰지 않는다
      if (saved?.kind !== "passkey" || !saved.credentialId) return null;
      return {
        kind: "passkey",
        credentialId: fromBase64Url(saved.credentialId),
        pub: fromBase64Url(saved.pub),
      };
    },

    async createPasskey() {
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { id: location.hostname, name: PASSKEY_NAME },
          user: {
            // 이름·이메일은 받지 않는다. 비밀번호 관리 앱에는 "하늘의 별 따기"로 보인다
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: PASSKEY_NAME,
            displayName: PASSKEY_NAME,
          },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          // ES256(P-256)만: 응모자 id와 서명 규칙이 P-256이다
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          // 새 기기에서 이름 없이 찾을 수 있게(discoverable). 기기 종류는 정하지 않는다:
          // iCloud·Google 비밀번호 관리자·1Password·Windows Hello·보안 키·휴대폰 QR 모두 되게
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
          "이 기기는 이 게임에 맞는 패스키를 만들지 못합니다",
          "NotSupportedError",
        );
      const key: KeyInfo = {
        kind: "passkey",
        credentialId: new Uint8Array(credential.rawId),
        pub: rawPublicKeyFromSpki(new Uint8Array(spki)),
      };
      saveKey(key);
      return key;
    },

    async recoverPasskey(lookup) {
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: location.hostname,
          userVerification: "required",
        },
      })) as PublicKeyCredential | null;
      if (!credential) return null;
      const credentialId = new Uint8Array(credential.rawId);
      const pub = await lookup(credentialId);
      if (!pub) return null;
      const key: KeyInfo = { kind: "passkey", credentialId, pub };
      saveKey(key);
      return key;
    },

    async signerFor(key) {
      return passkeySigner(key.pub, (challenge) =>
        passkeyAssertion(key.credentialId, challenge),
      );
    },

    loadTickets() {
      const out: MyTicket[] = [];
      for (const s of readTickets()) {
        try {
          out.push({
            ticket: decodeTicket(fromBase64Url(s.t)),
            receivedAt: s.at,
          });
        } catch {
          // 판이 바뀐 옛 응모권은 건너뛴다
        }
      }
      return out;
    },

    addTicket(mine) {
      const t = toBase64Url(encodeTicket(mine.ticket));
      if (ticketIds().has(t)) return;
      writeJson(TICKETS, [...readTickets(), { t, at: mine.receivedAt }]);
    },

    openedRounds() {
      return new Set(readJson<number[]>(OPENED) ?? []);
    },

    markOpened(round) {
      const set = new Set(readJson<number[]>(OPENED) ?? []);
      set.add(round);
      writeJson(OPENED, [...set]);
    },

    async clear() {
      for (const k of [KEY, TICKETS, OPENED]) {
        try {
          localStorage.removeItem(k);
        } catch {
          // 지우지 못해도 다음 데모는 새 패스키를 만든다
        }
      }
    },
  };
}

async function passkeyAssertion(
  credentialId: Uint8Array,
  challenge: Uint8Array,
): Promise<WebAuthnAssertion> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(challenge),
      rpId: location.hostname,
      allowCredentials: [
        { type: "public-key", id: new Uint8Array(credentialId) },
      ],
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;
  if (!credential)
    throw new DOMException("패스키로 서명하지 않았습니다", "NotAllowedError");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
}
