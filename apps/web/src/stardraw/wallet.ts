import {
  decodeTicket,
  type EntrantSigner,
  encodeTicket,
  equalBytes,
  fromBase64Url,
  passkeySigner,
  rawPublicKeyFromSpki,
  signerFromKeyPair,
  type Ticket,
  toBase64Url,
  type WebAuthnAssertion,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { requestUnlock, type UnlockPurpose } from "./demo-unlock";

/**
 * 내 열쇠와 내 응모권(docs/36 11-2). 브라우저 응모는 패스키로만 한다(2026-10-29 사용자).
 * 비밀 열쇠는 인증기(iCloud 키체인·Google 비밀번호 관리자·1Password·Windows Hello·보안 키 등) 안에만 있고,
 * 여기에는 패스키 번호와 공개 열쇠만 둔다. 응모·확인마다 Face ID·지문·화면 잠금 한 번.
 * 터미널 도구(나중)는 열쇠 파일을 쓴다.
 * 저장 이름공간(`ns`)이 다르면 서로 보이지 않는다(데모는 실제 게임과 따로 둔다).
 * 응모권과 봉투를 연 회차에는 장부 표시(`Ledger.id()`)를 함께 두고, 지금 장부의 것만 보여 준다.
 * 서버 장부를 새 genesis로 다시 시작하면 회차 번호가 1부터 겹치기 때문이다(2026-10-30 시험 서버).
 */

export const PASSKEY_NAME = "하늘의 별 따기";

export interface KeyInfo {
  /** passkey: 실제 게임. demo: 데모만 쓰는 기기 안 열쇠(패스키 흉내, 장부에는 원시 열쇠로 등록) */
  kind: "passkey" | "demo";
  /** 패스키 번호(데모 열쇠는 비어 있다) */
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
  /**
   * 등록증 주인 확인용 서명자. 이 기기의 내 등록증이면 그 패스키를 지정하고,
   * 남의 등록증이면 이 기기의 아무 패스키로 서명하게 해 공개 열쇠가 맞지 않아 실패한다
   */
  ownerSigner(pub: Uint8Array): Promise<EntrantSigner>;
  loadTickets(): MyTicket[];
  addTicket(mine: MyTicket): void;
  /** 결과 봉투를 연 회차 */
  openedRounds(): Set<number>;
  markOpened(round: number): void;
  /** 이 이름공간의 지갑을 모두 지운다(데모 처음부터) */
  clear(): Promise<void>;
}

/**
 * `ledgerId`는 지금 장부의 표시다(아직 장부를 받지 못했으면 null).
 * 다른 장부의 응모권·봉투는 지우지 않고 남겨 두되 지금 것으로 세지 않는다
 */
export function createWallet(
  ns: string,
  ledgerId: () => string | null = () => null,
): Wallet {
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
    readJson<{ t: string; at: number; ledger?: string | null }[]>(TICKETS) ??
    [];

  /** 장부별 봉투를 연 회차. 장부 표시가 없던 옛 판의 목록(숫자 배열)은 어느 장부의 것인지 몰라 버린다 */
  const readOpened = () => {
    const saved = readJson<Record<string, number[]> | number[]>(OPENED);
    return saved && !Array.isArray(saved) ? saved : {};
  };

  const ticketIds = () => new Set(readTickets().map((s) => s.t));

  const loadKey = (): KeyInfo | null => {
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
  };

  return {
    loadKey,

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

    async ownerSigner(pub) {
      const mine = loadKey();
      const own = mine && equalBytes(mine.pub, pub) ? mine.credentialId : null;
      return passkeySigner(pub, (challenge) =>
        passkeyAssertion(own, challenge),
      );
    },

    loadTickets() {
      const ledger = ledgerId();
      const out: MyTicket[] = [];
      if (!ledger) return out;
      for (const s of readTickets()) {
        // 다른 장부(다시 시작한 서버 장부, 연습 장부)와 장부 표시가 없는 옛 응모권은 세지 않는다
        if (s.ledger !== ledger) continue;
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
      writeJson(TICKETS, [
        ...readTickets(),
        { t, at: mine.receivedAt, ledger: ledgerId() },
      ]);
    },

    openedRounds() {
      const ledger = ledgerId();
      return new Set(ledger ? (readOpened()[ledger] ?? []) : []);
    },

    markOpened(round) {
      const ledger = ledgerId();
      if (!ledger) return;
      const all = readOpened();
      all[ledger] = [...new Set([...(all[ledger] ?? []), round])];
      writeJson(OPENED, all);
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

/**
 * 데모 지갑: 실제 패스키를 만들지 않는다(`navigator.credentials`를 부르지 않는다).
 * 실제 게임의 "브라우저 응모는 패스키로만" 규칙의 데모만의 예외다. 데모와 실제 게임이 같은 주소라
 * 데모 패스키가 비밀번호 관리 앱에 남으면 실제 게임의 패스키 목록에 섞이기 때문이다(2026-10-29 사용자).
 * 대신 이 기기 안 임시 P-256 열쇠로 원시 서명을 하고, 서명마다 화면의 흉내 시트(`requestUnlock`)로 확인받는다.
 * 응모권·확인 기록은 실제 지갑과 같은 방식으로 이 이름공간에만 둔다.
 */
export function createDemoWallet(
  ns: string,
  unlock: (purpose: UnlockPurpose) => Promise<boolean> = requestUnlock,
  ledgerId: () => string | null = () => null,
): Wallet {
  const base = createWallet(ns, ledgerId);
  const DEMO_KEY = `${ns}-demo-key`;

  const confirm = async (purpose: UnlockPurpose) => {
    // 실제 패스키 창을 닫은 것과 같은 오류로 알린다(화면은 "응모되지 않았습니다"로 이어 간다)
    if (!(await unlock(purpose)))
      throw new DOMException("확인을 취소했습니다", "NotAllowedError");
  };

  const loadPair = async (): Promise<CryptoKeyPair | null> => {
    const saved = readJson<{ priv: JsonWebKey; pub: JsonWebKey }>(DEMO_KEY);
    if (!saved) return null;
    try {
      const algorithm = { name: "ECDSA", namedCurve: "P-256" };
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
    ...base,

    loadKey() {
      const saved = readJson<{ raw: string }>(`${DEMO_KEY}-pub`);
      return saved
        ? {
            kind: "demo",
            credentialId: new Uint8Array(),
            pub: fromBase64Url(saved.raw),
          }
        : null;
    },

    async createPasskey() {
      await confirm("create");
      // 다음 방문에도 같은 열쇠로 서명하려고 비밀 열쇠를 이 기기 저장소에 둔다(데모 전용, 실제 게임은 이렇게 하지 않는다)
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const pub = new Uint8Array(
        await crypto.subtle.exportKey("raw", pair.publicKey),
      );
      writeJson(DEMO_KEY, {
        priv: await crypto.subtle.exportKey("jwk", pair.privateKey),
        pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
      });
      writeJson(`${DEMO_KEY}-pub`, { raw: toBase64Url(pub) });
      return { kind: "demo", credentialId: new Uint8Array(), pub };
    },

    async recoverPasskey() {
      // 데모 열쇠는 다른 기기로 따라가지 않는다
      return null;
    },

    async signerFor(key) {
      const pair = await loadPair();
      if (!pair)
        throw new Error(
          "데모 열쇠가 없습니다. 「데모 처음부터」를 눌러 주세요",
        );
      const signer = await signerFromKeyPair(pair);
      return {
        publicKey: key.pub,
        sign: async (message) => {
          await confirm("sign");
          return signer.sign(message);
        },
      };
    },

    async ownerSigner(pub) {
      const pair = await loadPair();
      const signer = pair ? await signerFromKeyPair(pair) : null;
      return {
        publicKey: pub,
        sign: async (message) => {
          await confirm("check");
          if (!signer)
            throw new DOMException("데모 열쇠가 없습니다", "NotAllowedError");
          return signer.sign(message);
        },
      };
    },

    async clear() {
      await base.clear();
      for (const k of [DEMO_KEY, `${DEMO_KEY}-pub`]) {
        try {
          localStorage.removeItem(k);
        } catch {
          // 지우지 못해도 다음 데모는 새 열쇠를 만든다
        }
      }
    },
  };
}

/** 패스키 서명. 패스키 번호가 없으면 이 기기의 아무 패스키나 고르게 한다(남의 등록증 주인 확인) */
async function passkeyAssertion(
  credentialId: Uint8Array | null,
  challenge: Uint8Array,
): Promise<WebAuthnAssertion> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(challenge),
      rpId: location.hostname,
      ...(credentialId
        ? {
            allowCredentials: [
              { type: "public-key" as const, id: new Uint8Array(credentialId) },
            ],
          }
        : {}),
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
