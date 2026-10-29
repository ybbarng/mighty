import {
  decodeTicket,
  type EntrantSigner,
  encodeTicket,
  fromBase64Url,
  generateSigner,
  passkeySigner,
  rawPublicKeyFromSpki,
  signerFromKeyPair,
  type Ticket,
  toBase64Url,
  type WebAuthnAssertion,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

/**
 * 내 열쇠와 내 응모권(docs/36 11-2). 열쇠는 패스키가 먼저이고, 못 쓰는 브라우저는 이 기기 안 열쇠다.
 * - 패스키: 비밀 열쇠는 인증기(iCloud 키체인·Google 비밀번호 관리자·1Password 등) 안에만 있다.
 *   여기에는 패스키 번호와 공개 열쇠만 둔다. 응모·증명마다 Face ID·지문 한 번.
 * - 기기 안 열쇠: 꺼낼 수 없는 WebCrypto 열쇠를 IndexedDB에 둔다. 이 브라우저에서만 증명할 수 있다.
 * 저장 이름공간(`ns`)이 다르면 서로 보이지 않는다(데모는 실제 게임과 따로 둔다).
 */

export const PASSKEY_NAME = "하늘의 별 따기";

export type KeyInfo =
  | { kind: "passkey"; credentialId: Uint8Array; pub: Uint8Array }
  | { kind: "raw"; pub: Uint8Array };

export interface MyTicket {
  ticket: Ticket;
  /** 장부가 받은 시각(초) */
  receivedAt: number;
}

/** 이 페이지 주소의 패스키 정책(검사기·확인 화면도 같은 값을 쓴다) */
export function sitePolicy(): WebAuthnPolicy {
  return { rpId: location.hostname, origins: [location.origin] };
}

export function passkeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
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
  createPasskey(): Promise<KeyInfo>;
  createDeviceKey(): Promise<KeyInfo>;
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
  const DB = ns;
  const STORE = "keys";

  const idb = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const idbPut = async (key: string, value: unknown) => {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  };
  const idbGet = async <T>(key: string): Promise<T | undefined> => {
    const db = await idb();
    const value = await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  };

  const saveKey = (key: KeyInfo) =>
    writeJson(KEY, {
      kind: key.kind,
      pub: toBase64Url(key.pub),
      ...(key.kind === "passkey"
        ? { credentialId: toBase64Url(key.credentialId) }
        : {}),
    });

  const readTickets = () =>
    readJson<{ t: string; at: number }[]>(TICKETS) ?? [];

  return {
    loadKey() {
      const saved = readJson<{
        kind: string;
        credentialId?: string;
        pub: string;
      }>(KEY);
      if (!saved) return null;
      if (saved.kind === "passkey" && saved.credentialId)
        return {
          kind: "passkey",
          credentialId: fromBase64Url(saved.credentialId),
          pub: fromBase64Url(saved.pub),
        };
      if (saved.kind === "raw")
        return { kind: "raw", pub: fromBase64Url(saved.pub) };
      return null;
    },

    async createPasskey() {
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { id: location.hostname, name: PASSKEY_NAME },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: PASSKEY_NAME,
            displayName: PASSKEY_NAME,
          },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          // ES256(P-256)만: 응모자 id와 서명 규칙이 P-256이다
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred",
          },
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error("패스키를 만들지 않았습니다");
      const response = credential.response as AuthenticatorAttestationResponse;
      const spki = response.getPublicKey?.();
      if (!spki)
        throw new Error(
          "이 브라우저는 패스키의 공개 열쇠를 알려 주지 않습니다",
        );
      const key: KeyInfo = {
        kind: "passkey",
        credentialId: new Uint8Array(credential.rawId),
        pub: rawPublicKeyFromSpki(new Uint8Array(spki)),
      };
      saveKey(key);
      return key;
    },

    async createDeviceKey() {
      const signer = await generateSigner(false);
      await idbPut("device", signer.keyPair);
      const key: KeyInfo = { kind: "raw", pub: signer.publicKey };
      saveKey(key);
      return key;
    },

    async signerFor(key) {
      if (key.kind === "passkey")
        return passkeySigner(key.pub, (challenge) =>
          passkeyAssertion(key.credentialId, challenge),
        );
      const pair = await idbGet<CryptoKeyPair>("device");
      if (!pair)
        throw new Error(
          "이 기기의 열쇠를 찾지 못했습니다. 브라우저 저장소가 지워졌을 수 있습니다",
        );
      return signerFromKeyPair(pair);
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
      writeJson(TICKETS, [
        ...readTickets(),
        { t: toBase64Url(encodeTicket(mine.ticket)), at: mine.receivedAt },
      ]);
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
          // 지우지 못해도 다음 데모에 겹치지 않게 아래에서 열쇠는 지운다
        }
      }
      await idbPut("device", undefined);
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
      userVerification: "preferred",
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("패스키로 서명하지 않았습니다");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
}
