import { concat, equalBytes, fromHex, sha256, toHex, utf8 } from "./bytes";
import { verifyInclusion } from "./merkle";
import type { RoundRecord } from "./record";
import { sealDigest } from "./round";
import { derToP1363, rawPublicKeyFromSpki } from "./signature";

/**
 * Sigstore Rekor 투명성 로그 항목 확인(docs/36 8-1 O1, 11-1).
 *
 * 서버는 마감 직후 봉인 값(round.ts `sealDigest`, 32바이트)을 서버 열쇠(ECDSA P-256)로 서명해
 * hashedrekord 항목으로 올린다. 항목의 "데이터"는 봉인 값이고, Rekor에는 그 SHA-256과 서명·공개 열쇠가 실린다.
 * Rekor가 찍은 integratedTime이 그 회차의 drand 시각보다 앞서야 그 회차를 유효로 본다(round.ts `isVoidRound`).
 *
 * 검사기는 서버를 믿지 않고 다음을 다시 계산한다. 브라우저(WebCrypto)와 Node에서 같은 코드로 돈다.
 * 1. 항목 본문이 이 회차 봉인 값과 서버 공개 열쇠를 담고, 그 서명이 맞는지
 * 2. 서명된 항목 시각(SET): Rekor 열쇠로 {body, integratedTime, logID, logIndex}에 한 서명
 * 3. 포함 증명: 본문의 잎 해시가 체크포인트의 트리 루트까지 이어지는지(RFC 6962)
 * 4. 체크포인트: 트리 크기·루트를 Rekor 열쇠로 서명한 note
 * Rekor 공개 열쇠는 아래에 박아 둔다(서버가 바꿀 수 없게).
 */

/** 투명성 로그 하나: 주소와 고정한 공개 열쇠. logID = SHA-256(공개 열쇠 SPKI DER) */
export interface RekorLog {
  name: string;
  url: string;
  /** 공개 열쇠 SPKI DER(base64) */
  publicKeySpki: string;
  /** SHA-256(SPKI DER) hex */
  logID: string;
}

/** 시험용 Sigstore Rekor. 시험 운영(trial)에서 쓴다 */
export const REKOR_STAGING: RekorLog = {
  name: "rekor.sigstage.dev",
  url: "https://rekor.sigstage.dev",
  publicKeySpki:
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDODRU688UYGuy54mNUlaEBiQdTE9nYLr0lg6RXowI/QV/RE1azBn4Eg5/2uTOMbhB1/gfcHzijzFi9Tk+g1Prg==",
  logID: "d32f30a3c32d639c2b762205a21c7bb07788e68283a4ae6f42118723a1bea496",
};

/** 실제 Sigstore Rekor. 정식 운영(live)에서 쓴다 */
export const REKOR_PRODUCTION: RekorLog = {
  name: "rekor.sigstore.dev",
  url: "https://rekor.sigstore.dev",
  publicKeySpki:
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwrkBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==",
  logID: "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d",
};

export const REKOR_LOGS: readonly RekorLog[] = [
  REKOR_STAGING,
  REKOR_PRODUCTION,
];

/** 주소로 고정된 로그를 찾는다(끝의 / 무시). 모르는 주소면 undefined */
export function rekorLogFor(url: string): RekorLog | undefined {
  const clean = url.replace(/\/+$/, "");
  return REKOR_LOGS.find((l) => l.url === clean);
}

/** 장부(seals/N)에 남기는 Rekor 항목. Rekor 응답을 그대로 옮긴 것 */
export interface RekorEntryProof {
  kind: "rekor";
  url: string;
  uuid: string;
  /** 항목 본문(base64, Rekor가 정규화한 JSON) */
  body: string;
  integratedTime: number;
  logID: string;
  logIndex: number;
  inclusionProof: {
    checkpoint: string;
    hashes: string[];
    /** 지금 샤드(트리) 안의 번호 */
    logIndex: number;
    rootHash: string;
    treeSize: number;
  };
  /** 서명된 항목 시각(SET, base64 DER) */
  signedEntryTimestamp: string;
}

/** Rekor POST /api/v1/log/entries 응답(201) → 장부에 남길 모양. 모양이 틀리면 null */
export function rekorProofFromResponse(
  url: string,
  response: unknown,
): RekorEntryProof | null {
  if (!response || typeof response !== "object") return null;
  const [uuid, entry] =
    Object.entries(response as Record<string, unknown>)[0] ?? [];
  if (!uuid || !entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const v = e.verification as Record<string, unknown> | undefined;
  const ip = v?.inclusionProof as Record<string, unknown> | undefined;
  if (
    typeof e.body !== "string" ||
    typeof e.integratedTime !== "number" ||
    typeof e.logID !== "string" ||
    typeof e.logIndex !== "number" ||
    !ip ||
    typeof v?.signedEntryTimestamp !== "string" ||
    typeof ip.checkpoint !== "string" ||
    !Array.isArray(ip.hashes) ||
    typeof ip.logIndex !== "number" ||
    typeof ip.rootHash !== "string" ||
    typeof ip.treeSize !== "number"
  )
    return null;
  return {
    kind: "rekor",
    url: url.replace(/\/+$/, ""),
    uuid,
    body: e.body,
    integratedTime: e.integratedTime,
    logID: e.logID,
    logIndex: e.logIndex,
    inclusionProof: {
      checkpoint: ip.checkpoint,
      hashes: ip.hashes.map(String),
      logIndex: ip.logIndex,
      rootHash: ip.rootHash,
      treeSize: ip.treeSize,
    },
    signedEntryTimestamp: v.signedEntryTimestamp,
  };
}

/** 서버가 Rekor에 올릴 hashedrekord 항목(본문). 데이터는 봉인 값, 서명은 봉인 값에 대한 ECDSA-SHA256(DER) */
export function hashedRekordRequest(
  digest: Uint8Array,
  signatureDer: Uint8Array,
  publicKeyPem: string,
): unknown {
  return {
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: toHex(sha256(digest)) } },
      signature: {
        content: toBase64(signatureDer),
        publicKey: { content: toBase64(utf8(publicKeyPem)) },
      },
    },
  };
}

export interface RekorCheck {
  ok: boolean;
  /** 맞지 않은 까닭(사람이 읽는 한국어) */
  problems: string[];
}

/**
 * Rekor 항목 하나를 확인한다.
 * - digest: 이 항목이 담아야 할 봉인 값(32바이트)
 * - serverPublicKey: 서버 공개 열쇠(압축하지 않은 65바이트)
 * - logs: 받아 줄 로그(기본: 시험용·실제 둘 다). 정식 장부는 실제 로그만 넘긴다
 */
export async function verifyRekorEntry(
  proof: RekorEntryProof,
  expect: {
    digest: Uint8Array;
    serverPublicKey: Uint8Array;
    logs?: readonly RekorLog[];
  },
): Promise<RekorCheck> {
  const problems: string[] = [];
  const fail = (m: string) => {
    problems.push(m);
  };
  const logs = expect.logs ?? REKOR_LOGS;
  const log = logs.find((l) => l.logID === proof.logID);
  if (!log) {
    fail(`받아 주지 않는 투명성 로그다(logID ${proof.logID.slice(0, 12)}…)`);
    return { ok: false, problems };
  }
  const logSpki = fromBase64(log.publicKeySpki);
  if (toHex(sha256(logSpki)) !== log.logID)
    fail("고정해 둔 로그 열쇠와 logID가 맞지 않는다");

  // 1. 본문
  let bodyBytes: Uint8Array;
  try {
    bodyBytes = fromBase64(proof.body);
  } catch {
    fail("항목 본문을 읽을 수 없다");
    return { ok: false, problems };
  }
  const bodyProblem = await checkBody(
    bodyBytes,
    expect.digest,
    expect.serverPublicKey,
  );
  if (bodyProblem) fail(bodyProblem);

  // 2. 서명된 항목 시각(SET): 정규화 JSON(키 사전 순, 공백 없음)에 대한 Rekor 서명
  const setPayload = utf8(
    `{"body":${JSON.stringify(proof.body)},"integratedTime":${proof.integratedTime},"logID":${JSON.stringify(proof.logID)},"logIndex":${proof.logIndex}}`,
  );
  if (
    !(await verifyDer(
      logSpki,
      setPayload,
      fromBase64(proof.signedEntryTimestamp),
    ))
  )
    fail("Rekor의 서명된 항목 시각(SET)이 맞지 않는다");

  // 3. 포함 증명(RFC 6962: 잎 = SHA-256(0x00 ‖ 본문))
  const ip = proof.inclusionProof;
  let root: Uint8Array | null = null;
  try {
    root = fromHex(ip.rootHash);
    const ok = verifyInclusion(
      bodyBytes,
      ip.logIndex,
      ip.treeSize,
      ip.hashes.map(fromHex),
      root,
    );
    if (!ok) fail("포함 증명이 트리 루트까지 이어지지 않는다");
  } catch {
    fail("포함 증명을 읽을 수 없다");
  }

  // 4. 체크포인트(note): 트리 크기·루트가 포함 증명과 같고, Rekor 열쇠로 서명됐는지
  const cp = parseCheckpoint(ip.checkpoint);
  if (!cp) {
    fail("체크포인트 모양이 틀리다");
  } else {
    if (cp.treeSize !== ip.treeSize)
      fail("체크포인트의 트리 크기가 포함 증명과 다르다");
    if (root && !equalBytes(cp.rootHash, root))
      fail("체크포인트의 트리 루트가 포함 증명과 다르다");
    const sig = cp.signatures.find(
      (s) => s.name === log.name && toHex(s.keyHint) === log.logID.slice(0, 8),
    );
    if (!sig || !(await verifyDer(logSpki, utf8(cp.text), sig.der)))
      fail("체크포인트 서명이 Rekor 열쇠와 맞지 않는다");
  }
  return { ok: problems.length === 0, problems };
}

/**
 * 장부 검사(`verifyLedger`의 `rootLogVerifier`)에 넣는 확인 함수를 만든다.
 * - proofOf: 회차 번호 → 그 회차 봉인의 Rekor 항목(장부 seals/N의 log). 없으면 undefined
 * - 로그에 못 올린 회차(rootLoggedAt 0, 무효)는 확인할 것이 없어 통과
 * - 항목의 integratedTime이 기록의 rootLoggedAt과 같아야 한다. 그 시각과 drand 시각의 앞뒤는
 *   `verifyLedger`가 `isVoidRound`로 따로 확인한다(그래서 여기서 시각을 잇는 것이 핵심이다)
 */
export function rekorRootLogVerifier(
  proofOf: (round: number) => RekorEntryProof | undefined,
  expect: { serverPublicKey: Uint8Array; logs?: readonly RekorLog[] },
): (record: RoundRecord) => Promise<boolean> {
  return async (record) => {
    if (record.rootLoggedAt === 0) return true;
    const proof = proofOf(record.round);
    if (proof?.kind !== "rekor") return false;
    if (proof.integratedTime !== record.rootLoggedAt) return false;
    const check = await verifyRekorEntry(proof, {
      digest: sealDigest(record),
      serverPublicKey: expect.serverPublicKey,
      ...(expect.logs ? { logs: expect.logs } : {}),
    });
    return check.ok;
  };
}

// ── 안쪽 도우미 ──

async function checkBody(
  bodyBytes: Uint8Array,
  digest: Uint8Array,
  serverPublicKey: Uint8Array,
): Promise<string | null> {
  let body: {
    kind?: string;
    spec?: {
      data?: { hash?: { algorithm?: string; value?: string } };
      signature?: { content?: string; publicKey?: { content?: string } };
    };
  };
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return "항목 본문이 JSON이 아니다";
  }
  if (body.kind !== "hashedrekord") return "hashedrekord 항목이 아니다";
  const hash = body.spec?.data?.hash;
  if (hash?.algorithm !== "sha256" || hash.value !== toHex(sha256(digest)))
    return "항목이 이 회차의 봉인 값을 담고 있지 않다";
  const pemB64 = body.spec?.signature?.publicKey?.content;
  const sigB64 = body.spec?.signature?.content;
  if (!pemB64 || !sigB64) return "항목에 서명·공개 열쇠가 없다";
  let key: Uint8Array;
  try {
    key = rawPublicKeyFromSpki(
      spkiFromPem(new TextDecoder().decode(fromBase64(pemB64))),
    );
  } catch {
    return "항목의 공개 열쇠를 읽을 수 없다";
  }
  if (!equalBytes(key, serverPublicKey))
    return "항목의 공개 열쇠가 서버 열쇠가 아니다";
  const spki = spkiFromRaw(serverPublicKey);
  if (!(await verifyDer(spki, digest, fromBase64(sigB64))))
    return "항목의 서명이 봉인 값과 맞지 않는다";
  return null;
}

interface Checkpoint {
  /** 서명 대상(본문 줄들과 끝 줄바꿈) */
  text: string;
  origin: string;
  treeSize: number;
  rootHash: Uint8Array;
  signatures: { name: string; keyHint: Uint8Array; der: Uint8Array }[];
}

/** signed note: "origin\nsize\nroot(base64)\n[다른 줄…]\n\n— name base64(keyhint4 ‖ DER)\n" */
function parseCheckpoint(note: string): Checkpoint | null {
  const sep = note.indexOf("\n\n");
  if (sep < 0) return null;
  const text = note.slice(0, sep + 1);
  const lines = text.split("\n");
  const [origin, size, root] = lines;
  if (!origin || !size || !root || !/^\d+$/.test(size)) return null;
  let rootHash: Uint8Array;
  try {
    rootHash = fromBase64(root);
  } catch {
    return null;
  }
  const signatures: Checkpoint["signatures"] = [];
  for (const line of note.slice(sep + 2).split("\n")) {
    const m = /^— (\S+) (\S+)$/.exec(line);
    if (!m) continue;
    try {
      const raw = fromBase64(m[2] as string);
      if (raw.length <= 4) continue;
      signatures.push({
        name: m[1] as string,
        keyHint: raw.slice(0, 4),
        der: raw.slice(4),
      });
    } catch {
      // 읽을 수 없는 서명 줄은 건너뛴다
    }
  }
  return { text, origin, treeSize: Number(size), rootHash, signatures };
}

async function verifyDer(
  spki: Uint8Array,
  message: Uint8Array,
  der: Uint8Array,
): Promise<boolean> {
  const raw = derToP1363(der);
  if (!raw) return false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      buf(spki),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      buf(raw),
      buf(message),
    );
  } catch {
    return false;
  }
}

function spkiFromPem(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  return fromBase64(b64);
}

const SPKI_P256_PREFIX = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

/** 압축하지 않은 65바이트 P-256 공개 열쇠 → SPKI DER */
export function spkiFromRaw(raw: Uint8Array): Uint8Array {
  return concat(SPKI_P256_PREFIX, raw);
}

/** 압축하지 않은 65바이트 P-256 공개 열쇠 → PEM(Rekor에 싣는 모양) */
export function pemFromRaw(raw: Uint8Array): string {
  const b64 = toBase64(spkiFromRaw(raw));
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function buf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(
    b.byteOffset,
    b.byteOffset + b.byteLength,
  ) as ArrayBuffer;
}
