import { bls12_381 } from "@noble/curves/bls12-381.js";
import { p256 } from "@noble/curves/nist.js";
import {
  ByteReader,
  ByteWriter,
  concat,
  equalBytes,
  taggedHash,
  utf8,
} from "./bytes";

/**
 * 상품 자격 증서(docs/36 11-13). 기관 계정으로 확인된 사람은 기간마다 한 번, 기기에서 만든 자격 열쇠의
 * 공개 열쇠에 우주국 도장(BLS 서명)을 **가린 채로** 받는다. 우주국은 무엇에 도장을 찍었는지 모른다.
 *
 * 도장 받을 메시지 m = "stardraw/qual/v1" ‖ 0x00 ‖ 기간 id(32) ‖ 자격 공개 열쇠(33, SEC1 압축)
 * 도장 = BLS12-381 짧은 서명(G1 압축 48바이트), 기간 열쇠는 G2 압축 96바이트
 * 자격 증서 = 기간 id(32) ‖ 자격 공개 열쇠(33) ‖ 도장(48) = 113바이트
 * 자격 열쇠 = P-256, 비밀 스칼라는 씨앗(16바이트)에서 만든다. 자격 서명은 r‖s 64바이트(low-s)
 * 복구 코드 = "SDQ1-" ‖ Crockford base32(v(u8 = 1) ‖ 기간 id 앞 8바이트 ‖ 씨앗(16) ‖ 도장(48))
 */

/**
 * 구글 로그인 클라이언트 ID(공개 값, docs/36 11-13). 화면과 서버가 같은 값을 쓴다.
 * 비어 있으면 기관 계정 받기를 "준비 중"으로 둔다
 */
export const GOOGLE_CLIENT_ID =
  "587913064312-m92d8bcm90efqacb32jmjj0jg167gfq0.apps.googleusercontent.com";

export const QUAL_DST = "STARDRAW-QUAL-V1_BLS12381G1_XMD:SHA-256_SSWU_RO_";
export const QUAL_PUB_LENGTH = 33;
export const STAMP_LENGTH = 48;
export const ISSUER_KEY_LENGTH = 96;
export const PERIOD_ID_LENGTH = 32;
export const QUAL_CERT_LENGTH =
  PERIOD_ID_LENGTH + QUAL_PUB_LENGTH + STAMP_LENGTH;
export const QUAL_SIG_LENGTH = 64;
export const QUAL_SEED_LENGTH = 16;
/** 도장 방식(kind 8의 칸). 1 = BLS12-381 G1 짧은 서명 */
export const STAMP_SCHEME_BLS = 1;

const Sigs = bls12_381.shortSignatures;
const G1 = bls12_381.G1.Point;
const G2 = bls12_381.G2.Point;
const Fn = G1.Fn;

export interface QualCert {
  periodId: Uint8Array;
  qualPub: Uint8Array;
  stamp: Uint8Array;
}

export function encodeQualCert(c: QualCert): Uint8Array {
  return new ByteWriter()
    .fixed(c.periodId, PERIOD_ID_LENGTH)
    .fixed(c.qualPub, QUAL_PUB_LENGTH)
    .fixed(c.stamp, STAMP_LENGTH)
    .done();
}

export function readQualCert(r: ByteReader): QualCert {
  return {
    periodId: r.fixed(PERIOD_ID_LENGTH),
    qualPub: r.fixed(QUAL_PUB_LENGTH),
    stamp: r.fixed(STAMP_LENGTH),
  };
}

// ── 기간 열쇠(우주국 도장) ──

/** 기간마다 새로 만드는 도장 열쇠. 비밀 32바이트, 공개 G2 압축 96바이트 */
export function newIssuerKey(): {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
} {
  const { secretKey, publicKey } = Sigs.keygen();
  return { secretKey, publicKey: publicKey.toBytes(true) };
}

export function issuerPublicKey(secretKey: Uint8Array): Uint8Array {
  return Sigs.getPublicKey(secretKey).toBytes(true);
}

/** 기간 열쇠가 G2 부분군의 점이고 무한원점이 아닌지 */
export function checkIssuerKey(key: Uint8Array): string | null {
  if (key.length !== ISSUER_KEY_LENGTH) return "도장 열쇠는 96바이트";
  try {
    const point = G2.fromBytes(key);
    point.assertValidity();
    if (point.is0()) return "도장 열쇠가 무한원점이다";
    return null;
  } catch {
    return "도장 열쇠가 곡선 위 점이 아니다";
  }
}

export function stampMessage(
  periodId: Uint8Array,
  qualPub: Uint8Array,
): Uint8Array {
  return concat(
    utf8("stardraw/qual/v1"),
    new Uint8Array([0]),
    periodId,
    qualPub,
  );
}

function stampPoint(periodId: Uint8Array, qualPub: Uint8Array) {
  return Sigs.hash(stampMessage(periodId, qualPub), QUAL_DST);
}

// ── 블라인드 서명 ──

export interface BlindRequest {
  /** 서버에 보내는 가린 값(G1 압축 48바이트) */
  blinded: Uint8Array;
  /** 벗길 때 쓰는 무작위 수. 기기 밖으로 내보내지 않는다 */
  factor: bigint;
}

function randomScalar(): bigint {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    const s = Fn.create(n);
    if (s !== 0n) return s;
  }
}

/** 기기: m을 곡선 위 점 H(m)으로 바꾸고 무작위 r을 곱해 가린다 */
export function blindStampRequest(
  periodId: Uint8Array,
  qualPub: Uint8Array,
): BlindRequest {
  const factor = randomScalar();
  const blinded = stampPoint(periodId, qualPub).multiply(factor).toBytes(true);
  return { blinded, factor };
}

/**
 * 서버: 가린 값에 기간 비밀 열쇠를 곱한다. 가린 값이 G1 부분군의 점이고 무한원점이 아닌지 꼭 본다
 * (블라인드 형태는 표준이 없어 받은 점을 그대로 믿지 않는다, docs/36 11-13 ⑤)
 */
export function signBlinded(
  secretKey: Uint8Array,
  blinded: Uint8Array,
): Uint8Array {
  if (blinded.length !== STAMP_LENGTH) throw new Error("가린 값은 48바이트");
  const point = G1.fromBytes(blinded);
  point.assertValidity();
  if (point.is0()) throw new Error("가린 값이 무한원점이다");
  return Sigs.sign(point, secretKey).toBytes(true);
}

/** 기기: r의 역수를 곱해 보통 BLS 도장을 얻는다 */
export function unblindStamp(
  blindStamp: Uint8Array,
  factor: bigint,
): Uint8Array {
  const point = G1.fromBytes(blindStamp);
  point.assertValidity();
  return point.multiply(Fn.inv(factor)).toBytes(true);
}

export function verifyStamp(
  issuerKey: Uint8Array,
  periodId: Uint8Array,
  qualPub: Uint8Array,
  stamp: Uint8Array,
): boolean {
  if (stamp.length !== STAMP_LENGTH || checkIssuerKey(issuerKey)) return false;
  try {
    const sig = G1.fromBytes(stamp);
    sig.assertValidity();
    if (sig.is0()) return false;
    return Sigs.verify(sig, stampPoint(periodId, qualPub), issuerKey);
  } catch {
    return false;
  }
}

/**
 * 같은 기간 열쇠의 도장 여럿을 짝짓기 두 번으로 한꺼번에 확인한다. 도장마다 무작위 계수를 곱한다
 * (곱하지 않으면 틀린 두 도장이 서로 지워져 통과할 수 있다). 하나라도 틀리면 false
 */
export function verifyStamps(
  issuerKey: Uint8Array,
  items: readonly {
    periodId: Uint8Array;
    qualPub: Uint8Array;
    stamp: Uint8Array;
  }[],
): boolean {
  if (items.length === 0) return true;
  if (items.length === 1) {
    const one = items[0] as (typeof items)[number];
    return verifyStamp(issuerKey, one.periodId, one.qualPub, one.stamp);
  }
  if (checkIssuerKey(issuerKey)) return false;
  try {
    let sigSum = G1.ZERO;
    let msgSum = G1.ZERO;
    for (const it of items) {
      if (it.stamp.length !== STAMP_LENGTH) return false;
      const sig = G1.fromBytes(it.stamp);
      sig.assertValidity();
      if (sig.is0()) return false;
      const c = randomScalar();
      sigSum = sigSum.add(sig.multiply(c));
      msgSum = msgSum.add(stampPoint(it.periodId, it.qualPub).multiply(c));
    }
    const left = bls12_381.pairing(sigSum, G2.BASE);
    const right = bls12_381.pairing(msgSum, G2.fromBytes(issuerKey));
    return bls12_381.fields.Fp12.eql(left, right);
  } catch {
    return false;
  }
}

// ── 자격 열쇠 ──

export interface QualKey {
  /** P-256 비밀 스칼라 32바이트 */
  secretKey: Uint8Array;
  /** SEC1 압축 33바이트 = 자격 번호 */
  publicKey: Uint8Array;
}

export function newQualSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(QUAL_SEED_LENGTH));
}

/** 씨앗 → 자격 열쇠. 스칼라 = taggedHash("stardraw/qual-key/v1", 씨앗) mod (n−1) + 1 */
export function qualKeyFromSeed(seed: Uint8Array): QualKey {
  if (seed.length !== QUAL_SEED_LENGTH) throw new Error("씨앗은 16바이트");
  const h = taggedHash("stardraw/qual-key/v1", seed);
  let n = 0n;
  for (const b of h) n = (n << 8n) | BigInt(b);
  const order = p256.Point.Fn.ORDER;
  const scalar = (n % (order - 1n)) + 1n;
  const secretKey = new Uint8Array(32);
  let s = scalar;
  for (let i = 31; i >= 0; i--) {
    secretKey[i] = Number(s & 255n);
    s >>= 8n;
  }
  return { secretKey, publicKey: p256.getPublicKey(secretKey, true) };
}

export function qualSign(
  secretKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return p256.sign(message, secretKey, { lowS: true });
}

export function qualVerify(
  qualPub: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (
    qualPub.length !== QUAL_PUB_LENGTH ||
    signature.length !== QUAL_SIG_LENGTH
  )
    return false;
  try {
    return p256.verify(signature, message, qualPub, { lowS: true });
  } catch {
    return false;
  }
}

/** 자격 열쇠 공개 열쇠가 곡선 위 점인지 */
export function checkQualPub(qualPub: Uint8Array): boolean {
  if (qualPub.length !== QUAL_PUB_LENGTH) return false;
  try {
    p256.Point.fromBytes(qualPub).assertValidity();
    return true;
  } catch {
    return false;
  }
}

// ── 들고 있는 자격(기기·백업) ──

/** 사람이 들고 있는 자격: 기간 + 씨앗 + 도장. 들고 있는 사람이 주인이다 */
export interface QualHolding {
  periodId: Uint8Array;
  seed: Uint8Array;
  stamp: Uint8Array;
}

export function certOf(h: QualHolding): QualCert {
  return {
    periodId: h.periodId,
    qualPub: qualKeyFromSeed(h.seed).publicKey,
    stamp: h.stamp,
  };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_PREFIX = "SDQ1-";
const RECOVERY_VERSION = 1;
const PERIOD_PREFIX_LENGTH = 8;

function toBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const ch of text) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) throw new Error("복구 코드에 쓸 수 없는 글자가 있다");
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      if (at >= length) throw new Error("복구 코드가 너무 길다");
      out[at++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  if (at !== length) throw new Error("복구 코드가 짧다");
  return out;
}

/** 복구 코드: 복사·QR·파일로 내보내는 평문 백업 */
export function recoveryCode(h: QualHolding): string {
  const bytes = new ByteWriter()
    .u8(RECOVERY_VERSION)
    .fixed(h.periodId.slice(0, PERIOD_PREFIX_LENGTH), PERIOD_PREFIX_LENGTH)
    .fixed(h.seed, QUAL_SEED_LENGTH)
    .fixed(h.stamp, STAMP_LENGTH)
    .done();
  return RECOVERY_PREFIX + toBase32(bytes);
}

const RECOVERY_BYTES =
  1 + PERIOD_PREFIX_LENGTH + QUAL_SEED_LENGTH + STAMP_LENGTH;

/** 복구 코드를 읽는다. 기간 id는 앞 8바이트뿐이라 장부의 기간 목록에서 찾는다 */
export function parseRecoveryCode(text: string): {
  periodPrefix: Uint8Array;
  seed: Uint8Array;
  stamp: Uint8Array;
} {
  const clean = text
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  const prefix = RECOVERY_PREFIX.replace("-", "");
  if (!clean.startsWith(prefix))
    throw new Error("복구 코드는 SDQ1-로 시작한다");
  const r = new ByteReader(
    fromBase32(clean.slice(prefix.length), RECOVERY_BYTES),
  );
  if (r.u8() !== RECOVERY_VERSION) throw new Error("모르는 복구 코드 판");
  const out = {
    periodPrefix: r.fixed(PERIOD_PREFIX_LENGTH),
    seed: r.fixed(QUAL_SEED_LENGTH),
    stamp: r.fixed(STAMP_LENGTH),
  };
  r.end();
  return out;
}

/** 복구 코드의 기간 앞부분으로 기간 id를 찾는다. 여럿이거나 없으면 null */
export function matchPeriod(
  prefix: Uint8Array,
  periodIds: readonly Uint8Array[],
): Uint8Array | null {
  const hits = periodIds.filter((id) =>
    equalBytes(id.slice(0, PERIOD_PREFIX_LENGTH), prefix),
  );
  return hits.length === 1 ? (hits[0] as Uint8Array) : null;
}

/** 보이는 자격 번호 `Q-XXXX-XXXX`(사람이 대조하는 보조 표시) */
export function qualDisplayId(
  periodId: Uint8Array,
  qualPub: Uint8Array,
): string {
  const h = taggedHash("stardraw/qual-id/v1", periodId, qualPub);
  const id = toBase32(h.slice(0, 5));
  return `Q-${id.slice(0, 4)}-${id.slice(4, 8)}`;
}

/** 자격 서명 대상 = "stardraw/qual-sig/v1" ‖ 0x00 ‖ v ‖ round ‖ numbers ‖ pub ‖ 자격 증서 */
export function qualSigMessage(prefix: Uint8Array, cert: QualCert): Uint8Array {
  return concat(
    utf8("stardraw/qual-sig/v1"),
    new Uint8Array([0]),
    prefix,
    encodeQualCert(cert),
  );
}
