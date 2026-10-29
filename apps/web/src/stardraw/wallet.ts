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
 */

export const PASSKEY_NAME = "하늘의 별 따기";

const KEY_STORAGE = "stardraw-key";
const TICKETS_STORAGE = "stardraw-tickets";
const OPENED_STORAGE = "stardraw-opened";
const DB_NAME = "stardraw";
const DB_STORE = "keys";

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

export function loadKey(): KeyInfo | null {
  const saved = readJson<{ kind: string; credentialId?: string; pub: string }>(
    KEY_STORAGE,
  );
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
}

function saveKey(key: KeyInfo): void {
  writeJson(KEY_STORAGE, {
    kind: key.kind,
    pub: toBase64Url(key.pub),
    ...(key.kind === "passkey"
      ? { credentialId: toBase64Url(key.credentialId) }
      : {}),
  });
}

/** 패스키를 새로 만든다. 사용자가 취소하면 오류를 던진다 */
export async function createPasskey(): Promise<KeyInfo> {
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
    throw new Error("이 브라우저는 패스키의 공개 열쇠를 알려 주지 않습니다");
  const key: KeyInfo = {
    kind: "passkey",
    credentialId: new Uint8Array(credential.rawId),
    pub: rawPublicKeyFromSpki(new Uint8Array(spki)),
  };
  saveKey(key);
  return key;
}

/** 이 기기 안 열쇠를 새로 만든다(꺼낼 수 없는 열쇠, IndexedDB) */
export async function createDeviceKey(): Promise<KeyInfo> {
  const signer = await generateSigner(false);
  await idbPut("device", signer.keyPair);
  const key: KeyInfo = { kind: "raw", pub: signer.publicKey };
  saveKey(key);
  return key;
}

/** 열쇠로 서명하는 쪽. 패스키면 서명할 때마다 인증기가 뜬다 */
export async function signerFor(key: KeyInfo): Promise<EntrantSigner> {
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

export function loadTickets(): MyTicket[] {
  const saved = readJson<{ t: string; at: number }[]>(TICKETS_STORAGE) ?? [];
  const out: MyTicket[] = [];
  for (const s of saved) {
    try {
      out.push({ ticket: decodeTicket(fromBase64Url(s.t)), receivedAt: s.at });
    } catch {
      // 판이 바뀐 옛 응모권은 건너뛴다
    }
  }
  return out;
}

export function addTicket(mine: MyTicket): void {
  const saved = readJson<{ t: string; at: number }[]>(TICKETS_STORAGE) ?? [];
  saved.push({
    t: toBase64Url(encodeTicket(mine.ticket)),
    at: mine.receivedAt,
  });
  writeJson(TICKETS_STORAGE, saved);
}

/** 결과 봉투를 연 회차 */
export function openedRounds(): Set<number> {
  return new Set(readJson<number[]>(OPENED_STORAGE) ?? []);
}

export function markOpened(round: number): void {
  const set = openedRounds();
  set.add(round);
  writeJson(OPENED_STORAGE, [...set]);
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const req = db
      .transaction(DB_STORE, "readonly")
      .objectStore(DB_STORE)
      .get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}
