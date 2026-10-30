import { sha384, sha512 } from "@noble/hashes/sha2.js";

import { concat, equalBytes, sha256, toHex } from "./bytes";
import {
  type Der,
  derChildren,
  encodeDer,
  encodeInteger,
  encodeOid,
  expectTag,
  parseDer,
  readOid,
  readTime,
  TAG,
} from "./der";
import type { RoundRecord } from "./record";
import { sealDigest } from "./round";

/**
 * 봉인 값의 시각 증명: 공개 시각 인증 기관(TSA, RFC 3161) 여러 곳의 토큰(docs/36 8-1 O1, 11-1).
 * 서버는 마감 직후 SHA-256(봉인 값)을 여러 기관에 동시에 보내고, 받은 토큰을 장부(seals/N의 log)에 남긴다.
 * 검사기는 토큰마다 ① 담긴 값이 SHA-256(봉인 값)과 같은지 ② 서명이 토큰 안 인증서로 맞는지
 * ③ 그 인증서가 아래에 고정한 기관 공개 열쇠까지 서명으로 이어지는지 ④ 인증서가 그 시각에 유효하고
 * 시각 인증용(EKU timeStamping)인지 본다. 가장 이른 시각이 장부의 rootLoggedAt이고, 그 시각이
 * drand 시각보다 앞서는지는 `verifyLedger`가 따로 본다.
 */

export interface TsaAuthority {
  /** 장부의 토큰에 적는 이름 */
  name: string;
  url: string;
  /** 믿는 공개 열쇠(인증서 SPKI DER의 SHA-256 hex). 사슬이 이 중 하나에 닿아야 한다 */
  pins: readonly string[];
}

/** DigiCert: 루트 "DigiCert Trusted Root G4" */
export const TSA_DIGICERT: TsaAuthority = {
  name: "digicert",
  url: "http://timestamp.digicert.com",
  pins: ["59df317bfa9f4f0ab7ca514d7772296aa2c765b87664d08b96e57399e364729c"],
};

/** Sectigo: 루트 "Sectigo Public Time Stamping Root R46" */
export const TSA_SECTIGO: TsaAuthority = {
  name: "sectigo",
  url: "http://timestamp.sectigo.com",
  pins: ["a4db8668c6796ebf476ddc5ace453a9260dbd4dbb09f51ecec9a839003824795"],
};

/** FreeTSA(개인 운영, 기본으로는 쓰지 않는다): 루트 "Free TSA Root CA" */
export const TSA_FREETSA: TsaAuthority = {
  name: "freetsa",
  url: "https://freetsa.org/tsr",
  pins: ["52c54ba340885605314daa1857c8763b94087d05c636092938d4e2d1818e99b5"],
};

/** 검사기가 믿는 기관 전체 */
export const TSA_AUTHORITIES: readonly TsaAuthority[] = [
  TSA_DIGICERT,
  TSA_SECTIGO,
  TSA_FREETSA,
];

/** 서버가 기본으로 묻는 기관 */
export const DEFAULT_TSA_NAMES: readonly string[] = ["digicert", "sectigo"];

/** 봉인 값이 몇 곳 이상의 유효한 토큰을 받아야 하는지 기본값(docs/36 11-1) */
export const DEFAULT_TSA_MIN = 1;

export function tsaByName(name: string): TsaAuthority | undefined {
  return TSA_AUTHORITIES.find((a) => a.name === name);
}

/** 토큰에 싣는 값: SHA-256(봉인 값) */
export function sealImprint(digest: Uint8Array): Uint8Array {
  return sha256(digest);
}

const OID = {
  sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2",
  sha512: "2.16.840.1.101.3.4.2.3",
  signedData: "1.2.840.113549.1.7.2",
  tstInfo: "1.2.840.113549.1.9.16.1.4",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  rsaEncryption: "1.2.840.113549.1.1.1",
  ecPublicKey: "1.2.840.10045.2.1",
  extKeyUsage: "2.5.29.37",
  subjectKeyId: "2.5.29.14",
  timeStamping: "1.3.6.1.5.5.7.3.8",
} as const;

const HASHES: Record<string, "SHA-256" | "SHA-384" | "SHA-512"> = {
  [OID.sha256]: "SHA-256",
  [OID.sha384]: "SHA-384",
  [OID.sha512]: "SHA-512",
  "1.2.840.113549.1.1.11": "SHA-256",
  "1.2.840.113549.1.1.12": "SHA-384",
  "1.2.840.113549.1.1.13": "SHA-512",
  "1.2.840.10045.4.3.2": "SHA-256",
  "1.2.840.10045.4.3.3": "SHA-384",
  "1.2.840.10045.4.3.4": "SHA-512",
};

const CURVES: Record<string, { name: string; size: number }> = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 },
  "1.3.132.0.35": { name: "P-521", size: 66 },
};

/** TimeStampReq(DER): SHA-256 값 하나, 인증서를 함께 달라고(certReq) 한다 */
export function timestampRequest(imprint: Uint8Array): Uint8Array {
  if (imprint.length !== 32) throw new Error("SHA-256 값은 32바이트");
  return encodeDer(
    TAG.sequence,
    encodeInteger(1),
    encodeDer(
      TAG.sequence,
      encodeDer(TAG.sequence, encodeOid(OID.sha256), encodeDer(TAG.null)),
      encodeDer(TAG.octetString, imprint),
    ),
    encodeDer(TAG.boolean, new Uint8Array([0xff])),
  );
}

/** TimeStampResp(DER) → 토큰(ContentInfo DER). 허락(0·1)이 아니거나 모양이 틀리면 null */
export function tokenFromResponse(response: Uint8Array): Uint8Array | null {
  try {
    const [status, token] = derChildren(parseDer(response));
    const code = derChildren(expectTag(status, TAG.sequence))[0];
    const value = expectTag(code, TAG.integer).value;
    if (value.length !== 1 || (value[0] ?? 9) > 1 || !token) return null;
    return token.bytes.slice();
  } catch {
    return null;
  }
}

export interface TimestampCheck {
  ok: boolean;
  /** 기관이 찍은 시각(초, 소수점 아래 버림). 읽지 못하면 0 */
  genTime: number;
  /** 사슬이 닿은 기관 이름 */
  tsa: string | null;
  problems: string[];
}

/**
 * 토큰 하나를 확인한다(브라우저·Node 모두, WebCrypto).
 * - imprint: 토큰에 담겨 있어야 할 SHA-256 값(봉인이면 `sealImprint(digest)`)
 * - authorities: 믿는 기관(기본 `TSA_AUTHORITIES`). 이름을 정해 주면 그 기관에만 닿아야 한다
 */
export async function verifyTimestampToken(
  token: Uint8Array,
  expect: {
    imprint: Uint8Array;
    authorities?: readonly TsaAuthority[];
  },
): Promise<TimestampCheck> {
  const problems: string[] = [];
  let genTime = 0;
  let tsa: string | null = null;
  try {
    const t = readToken(token);
    genTime = Math.floor(t.genTimeMs / 1000);
    if (t.imprintAlg !== OID.sha256 || !equalBytes(t.imprint, expect.imprint))
      problems.push("토큰이 이 봉인 값을 담고 있지 않다");

    const hash = HASHES[t.digestAlg];
    if (!hash) throw new Error(`모르는 해시 ${t.digestAlg}`);
    if (!equalBytes(t.messageDigest, digestOf(hash, t.content)))
      problems.push("서명된 속성의 해시가 토큰 내용과 다르다");
    if (t.contentTypeAttr !== OID.tstInfo)
      problems.push("서명된 속성의 내용 종류가 TSTInfo가 아니다");

    const signer = t.certs.find((c) => t.sidMatches(c));
    if (!signer) throw new Error("서명한 인증서가 토큰 안에 없다");
    if (
      !(await verifySignature(
        signer.spki,
        t.sigAlg,
        hash,
        t.signedAttrs,
        t.signature,
      ))
    )
      problems.push("토큰 서명이 맞지 않는다");
    if (!signer.eku.includes(OID.timeStamping))
      problems.push("서명한 인증서가 시각 인증용이 아니다");

    const authorities = expect.authorities ?? TSA_AUTHORITIES;
    tsa = await chainTo(signer, t.certs, t.genTimeMs, authorities, problems);
    if (!tsa) problems.push("인증서가 믿는 기관 열쇠로 이어지지 않는다");
  } catch (err) {
    problems.push(`토큰을 읽을 수 없다(${(err as Error).message})`);
  }
  return { ok: problems.length === 0, genTime, tsa, problems };
}

// ── 장부의 증거 ──

/** seals/N의 log(시각 인증 증거). token은 표준 base64 DER */
export interface TsaProof {
  kind: "tsa";
  tokens: { tsa: string; token: string }[];
}

export interface TsaProofCheck {
  ok: boolean;
  /** 확인된 토큰 중 가장 이른 시각(초). 장부의 rootLoggedAt과 같아야 한다 */
  loggedAt: number;
  stamps: { tsa: string; genTime: number; ok: boolean; problems: string[] }[];
  problems: string[];
}

/**
 * 봉인 증거 전체를 확인한다. 실린 토큰은 모두 맞아야 하고(서버는 확인한 것만 싣는다),
 * 서로 다른 기관 minValid곳 이상이어야 한다
 */
export async function verifyTsaProof(
  proof: TsaProof,
  expect: {
    digest: Uint8Array;
    minValid?: number;
    authorities?: readonly TsaAuthority[];
  },
): Promise<TsaProofCheck> {
  const minValid = expect.minValid ?? DEFAULT_TSA_MIN;
  const all = expect.authorities ?? TSA_AUTHORITIES;
  const imprint = sealImprint(expect.digest);
  const problems: string[] = [];
  const stamps: TsaProofCheck["stamps"] = [];
  for (const item of proof.tokens ?? []) {
    const authority = all.find((a) => a.name === item.tsa);
    const check = authority
      ? await verifyTimestampToken(fromBase64(item.token), {
          imprint,
          authorities: [authority],
        })
      : {
          ok: false,
          genTime: 0,
          tsa: null,
          problems: ["믿는 기관 목록에 없다"],
        };
    stamps.push({ ...check, tsa: item.tsa });
    if (!check.ok) problems.push(`${item.tsa}: ${check.problems.join(", ")}`);
  }
  const names = new Set(stamps.filter((s) => s.ok).map((s) => s.tsa));
  if (names.size < minValid)
    problems.push(`시각 인증 기관이 ${minValid}곳보다 적다(${names.size}곳)`);
  const times = stamps.filter((s) => s.ok).map((s) => s.genTime);
  return {
    ok: problems.length === 0,
    loggedAt: times.length > 0 ? Math.min(...times) : 0,
    stamps,
    problems,
  };
}

/**
 * 장부 검사(`verifyLedger`의 `rootLogVerifier`)에 넣는 확인 함수.
 * - proofOf: 회차 번호 → 장부 seals/N의 log. 없으면 undefined
 * - 기한 안에 시각 인증을 못 받은 회차(rootLoggedAt 0, 무효)는 확인할 것이 없어 통과
 * - 가장 이른 토큰 시각이 기록의 rootLoggedAt과 같아야 한다(drand 시각과의 앞뒤는 verifyLedger가 본다)
 */
export function tsaRootLogVerifier(
  proofOf: (round: number) => unknown,
  expect: { minValid?: number; authorities?: readonly TsaAuthority[] } = {},
): (record: RoundRecord) => Promise<boolean> {
  return async (record) => {
    if (record.rootLoggedAt === 0) return true;
    const proof = proofOf(record.round) as TsaProof | undefined;
    if (proof?.kind !== "tsa") return false;
    const check = await verifyTsaProof(proof, {
      digest: sealDigest(record),
      ...expect,
    });
    return check.ok && check.loggedAt === record.rootLoggedAt;
  };
}

// ── 안쪽 도우미 ──

interface Cert {
  tbs: Uint8Array;
  sigAlg: string;
  signature: Uint8Array;
  serial: Uint8Array;
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  ski: Uint8Array | null;
  eku: string[];
}

function readCert(node: Der): Cert {
  const [tbs, sigAlg, sig] = derChildren(expectTag(node, TAG.sequence));
  const fields = derChildren(expectTag(tbs, TAG.sequence));
  if (fields[0]?.tag === 0xa0) fields.shift();
  const [serial, , issuer, validity, subject, spki, ...rest] = fields;
  const [notBefore, notAfter] = derChildren(expectTag(validity, TAG.sequence));
  let ski: Uint8Array | null = null;
  let eku: string[] = [];
  const exts = rest.find((f) => f.tag === 0xa3);
  if (exts) {
    for (const ext of derChildren(
      expectTag(derChildren(exts)[0], TAG.sequence),
    )) {
      const parts = derChildren(ext);
      const id = readOid(parts[0]);
      const inner = parseDer(
        expectTag(parts[parts.length - 1], TAG.octetString).value,
      );
      if (id === OID.subjectKeyId)
        ski = expectTag(inner, TAG.octetString).value;
      if (id === OID.extKeyUsage)
        eku = derChildren(inner).map((o) => readOid(o));
    }
  }
  const bits = expectTag(sig, TAG.bitString).value;
  return {
    tbs: (tbs as Der).bytes,
    sigAlg: readOid(derChildren(expectTag(sigAlg, TAG.sequence))[0]),
    signature: bits.subarray(1),
    serial: expectTag(serial, TAG.integer).value,
    issuer: expectTag(issuer, TAG.sequence).bytes,
    subject: expectTag(subject, TAG.sequence).bytes,
    notBefore: readTime(notBefore),
    notAfter: readTime(notAfter),
    spki: expectTag(spki, TAG.sequence).bytes,
    ski,
    eku,
  };
}

function readToken(token: Uint8Array) {
  const [type, wrapped] = derChildren(parseDer(token));
  if (readOid(type) !== OID.signedData) throw new Error("SignedData가 아니다");
  const signed = derChildren(
    expectTag(derChildren(expectTag(wrapped, 0xa0))[0], TAG.sequence),
  );
  const encap = derChildren(expectTag(signed[2], TAG.sequence));
  if (readOid(encap[0]) !== OID.tstInfo) throw new Error("TSTInfo가 아니다");
  const content = expectTag(
    derChildren(expectTag(encap[1], 0xa0))[0],
    TAG.octetString,
  ).value;
  const certsNode = signed.find((n) => n.tag === 0xa0);
  const certs = certsNode
    ? derChildren(certsNode)
        .filter((n) => n.tag === TAG.sequence)
        .map(readCert)
    : [];
  const signerInfos = derChildren(
    expectTag(signed[signed.length - 1], TAG.set),
  );
  if (signerInfos.length !== 1) throw new Error("서명자가 하나가 아니다");
  const si = derChildren(expectTag(signerInfos[0], TAG.sequence));
  const sid = si[1] as Der;
  const attrsNode = si.find((n) => n.tag === 0xa0);
  if (!attrsNode) throw new Error("서명된 속성이 없다");
  const after = si.slice(si.indexOf(attrsNode) + 1);
  let messageDigest: Uint8Array = new Uint8Array();
  let contentTypeAttr = "";
  for (const attr of derChildren(attrsNode)) {
    const [id, values] = derChildren(attr);
    const first = derChildren(expectTag(values, TAG.set))[0];
    const oid = readOid(id);
    if (oid === OID.messageDigest)
      messageDigest = expectTag(first, TAG.octetString).value;
    if (oid === OID.contentType) contentTypeAttr = readOid(first);
  }

  const tst = derChildren(expectTag(parseDer(content), TAG.sequence));
  const imprintParts = derChildren(expectTag(tst[2], TAG.sequence));
  const genTime = expectTag(tst[4], TAG.generalizedTime);

  return {
    content,
    certs,
    imprintAlg: readOid(
      derChildren(expectTag(imprintParts[0], TAG.sequence))[0],
    ),
    imprint: expectTag(imprintParts[1], TAG.octetString).value,
    genTimeMs: readTime(genTime),
    digestAlg: readOid(derChildren(expectTag(si[2], TAG.sequence))[0]),
    // 서명 대상은 [0] 대신 SET(0x31) 태그로 바꾼 속성 묶음(RFC 5652 5.4)
    signedAttrs: concat(new Uint8Array([TAG.set]), attrsNode.bytes.subarray(1)),
    messageDigest,
    contentTypeAttr,
    sigAlg: readOid(derChildren(expectTag(after[0], TAG.sequence))[0]),
    signature: expectTag(after[1], TAG.octetString).value,
    sidMatches(c: Cert): boolean {
      if (sid.tag === 0x80) return !!c.ski && equalBytes(c.ski, sid.value);
      const [issuer, serial] = derChildren(sid);
      return (
        equalBytes((issuer as Der).bytes, c.issuer) &&
        equalBytes((serial as Der).value, c.serial)
      );
    },
  };
}

/** 서명한 인증서에서 위로 올라가며 믿는 열쇠에 닿으면 그 기관 이름 */
async function chainTo(
  signer: Cert,
  certs: readonly Cert[],
  atMs: number,
  authorities: readonly TsaAuthority[],
  problems: string[],
): Promise<string | null> {
  let cur = signer;
  for (let depth = 0; depth < 6; depth++) {
    const pin = toHex(sha256(cur.spki));
    const found = authorities.find((a) => a.pins.includes(pin));
    if (found) return found.name;
    if (atMs < cur.notBefore || atMs > cur.notAfter) {
      problems.push("인증서가 토큰 시각에 유효하지 않다");
      return null;
    }
    const issuer = certs.find(
      (c) => c !== cur && equalBytes(c.subject, cur.issuer),
    );
    if (!issuer) return null;
    const hash = HASHES[cur.sigAlg];
    if (
      !hash ||
      !(await verifySignature(
        issuer.spki,
        cur.sigAlg,
        hash,
        cur.tbs,
        cur.signature,
      ))
    ) {
      problems.push("인증서 사슬의 서명이 맞지 않는다");
      return null;
    }
    cur = issuer;
  }
  return null;
}

async function verifySignature(
  spki: Uint8Array,
  sigAlg: string,
  hash: "SHA-256" | "SHA-384" | "SHA-512",
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    const [alg] = derChildren(parseDer(spki));
    const [keyType, params] = derChildren(expectTag(alg, TAG.sequence));
    const type = readOid(keyType);
    // 인증서·서명 정보의 서명 방식이 sha*WithRSA면 그 해시, rsaEncryption이면 digestAlgorithm의 해시
    const h = HASHES[sigAlg] ?? (sigAlg === OID.rsaEncryption ? hash : null);
    if (!h) return false;
    if (type === OID.rsaEncryption) {
      const key = await crypto.subtle.importKey(
        "spki",
        buf(spki),
        { name: "RSASSA-PKCS1-v1_5", hash: h },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        buf(signature),
        buf(message),
      );
    }
    if (type === OID.ecPublicKey) {
      const curve = CURVES[readOid(params)];
      if (!curve) return false;
      const raw = ecdsaRaw(signature, curve.size);
      if (!raw) return false;
      const key = await crypto.subtle.importKey(
        "spki",
        buf(spki),
        { name: "ECDSA", namedCurve: curve.name },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: h },
        key,
        buf(raw),
        buf(message),
      );
    }
    return false;
  } catch {
    return false;
  }
}

/** DER ECDSA 서명 → r‖s(좌표 크기만큼씩) */
function ecdsaRaw(der: Uint8Array, size: number): Uint8Array | null {
  try {
    const [r, s] = derChildren(expectTag(parseDer(der), TAG.sequence));
    const out = new Uint8Array(size * 2);
    for (const [i, part] of [r, s].entries()) {
      let v = expectTag(part, TAG.integer).value;
      while (v.length > size && v[0] === 0) v = v.subarray(1);
      if (v.length > size) return null;
      out.set(v, i * size + size - v.length);
    }
    return out;
  } catch {
    return null;
  }
}

function digestOf(
  hash: "SHA-256" | "SHA-384" | "SHA-512",
  data: Uint8Array,
): Uint8Array {
  return hash === "SHA-256"
    ? sha256(data)
    : hash === "SHA-384"
      ? sha384(data)
      : sha512(data);
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
