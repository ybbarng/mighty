import { concat } from "./bytes";

/**
 * 시각 인증 토큰(RFC 3161, CMS)을 읽고 요청을 만드는 데 필요한 만큼만의 DER 읽기·쓰기.
 * 브라우저 묶음 크기를 줄이려고 pkijs/asn1js 대신 직접 쓴다. 정해진 길이(DER)만 받는다.
 */

export interface Der {
  tag: number;
  /** 머리(태그·길이)까지 포함한 전체 바이트 */
  bytes: Uint8Array;
  /** 값 부분 */
  value: Uint8Array;
}

export const TAG = {
  boolean: 0x01,
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  null: 0x05,
  oid: 0x06,
  utcTime: 0x17,
  generalizedTime: 0x18,
  sequence: 0x30,
  set: 0x31,
} as const;

/** bytes[at]부터 TLV 하나를 읽는다. 모양이 틀리면 던진다 */
export function parseDer(bytes: Uint8Array, at = 0): Der {
  const tag = bytes[at];
  if (tag === undefined || (tag & 0x1f) === 0x1f)
    throw new Error("DER 태그를 읽을 수 없다");
  let len = bytes[at + 1];
  let start = at + 2;
  if (len === undefined) throw new Error("DER 길이가 없다");
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("DER 길이 형식이 틀리다");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + (bytes[start + i] ?? 0);
    start += n;
  }
  const end = start + len;
  if (end > bytes.length) throw new Error("DER 값이 잘렸다");
  return {
    tag,
    bytes: bytes.subarray(at, end),
    value: bytes.subarray(start, end),
  };
}

/** 구조형(SEQUENCE·SET·문맥 태그) 값 안의 TLV들 */
export function derChildren(node: Der): Der[] {
  const out: Der[] = [];
  let at = 0;
  while (at < node.value.length) {
    const child = parseDer(node.value, at);
    out.push(child);
    at += child.bytes.length;
  }
  return out;
}

/** 태그를 확인하며 읽는다 */
export function expectTag(node: Der | undefined, tag: number): Der {
  if (!node || node.tag !== tag)
    throw new Error(`DER 태그 0x${tag.toString(16)}를 기대했다`);
  return node;
}

export function readOid(node: Der | undefined): string {
  const v = expectTag(node, TAG.oid).value;
  const first = v[0] ?? 0;
  const parts = [Math.floor(first / 40), first % 40];
  let n = 0;
  for (let i = 1; i < v.length; i++) {
    const b = v[i] ?? 0;
    n = n * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(n);
      n = 0;
    }
  }
  return parts.join(".");
}

/** UTCTime·GeneralizedTime → 밀리초 */
export function readTime(node: Der | undefined): number {
  if (!node) throw new Error("시각이 없다");
  const text = new TextDecoder().decode(node.value);
  const m =
    node.tag === TAG.generalizedTime
      ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3})\d*)?Z$/.exec(
          text,
        )
      : node.tag === TAG.utcTime
        ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})()Z$/.exec(text)
        : null;
  if (!m) throw new Error(`시각 형식이 틀리다: ${text}`);
  let year = Number(m[1]);
  if (node.tag === TAG.utcTime) year += year < 50 ? 2000 : 1900;
  return Date.UTC(
    year,
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number((m[7] ?? "").padEnd(3, "0")),
  );
}

// ── 쓰기 ──

export function encodeDer(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const value = concat(...parts);
  const len = value.length;
  const head =
    len < 0x80
      ? [tag, len]
      : len < 0x100
        ? [tag, 0x81, len]
        : len < 0x10000
          ? [tag, 0x82, len >> 8, len & 0xff]
          : [tag, 0x83, len >> 16, (len >> 8) & 0xff, len & 0xff];
  return concat(Uint8Array.from(head), value);
}

export function encodeOid(oid: string): Uint8Array {
  const [a = 0, b = 0, ...rest] = oid.split(".").map(Number);
  const out = [a * 40 + b];
  for (const n of rest) {
    const groups = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128))
      groups.unshift((v & 0x7f) | 0x80);
    out.push(...groups);
  }
  return encodeDer(TAG.oid, Uint8Array.from(out));
}

/** 부호 없는 큰 정수(바이트) → INTEGER */
export function encodeInteger(value: Uint8Array | number): Uint8Array {
  let b: Uint8Array;
  if (typeof value === "number") {
    const out: number[] = [];
    for (let v = value; out.length === 0 || v > 0; v = Math.floor(v / 256))
      out.unshift(v & 0xff);
    b = Uint8Array.from(out);
  } else b = value;
  let start = 0;
  while (start < b.length - 1 && b[start] === 0) start++;
  b = b.subarray(start);
  if ((b[0] ?? 0) & 0x80) b = concat(new Uint8Array([0]), b);
  return encodeDer(TAG.integer, b);
}
