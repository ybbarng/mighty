import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

/**
 * 해시·서명 대상은 모두 고정 바이너리 형식이다(docs/36 8-1 S1).
 * JSON은 숫자·유니코드·키 순서가 언어마다 달라 검사기끼리 해시가 어긋날 수 있다.
 * 정수는 모두 빅엔디언, 가변 길이 값은 앞에 u16 길이를 붙인다.
 */

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function sha256(...parts: Uint8Array[]): Uint8Array {
  return nobleSha256(concat(...parts));
}

/** 용도 이름을 앞에 붙인 해시. 같은 바이트라도 용도가 다르면 해시가 다르다 */
export function taggedHash(tag: string, ...parts: Uint8Array[]): Uint8Array {
  return sha256(utf8(tag), new Uint8Array([0]), ...parts);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** 사전 순 비교(응모권 id 정렬에 쓴다) */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("16진수 문자열이 아니다");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 붙여 넣기 좋은 base64url(덧붙임 없음) */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let k = 0; k < chars; k++) out += B64URL[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const clean = text.trim();
  if (/[^A-Za-z0-9_-]/.test(clean) || clean.length % 4 === 1) {
    throw new Error("base64url 문자열이 아니다");
  }
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? B64URL.indexOf(chunk[k] ?? "") : 0;
      n = (n << 6) | v;
    }
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

/** 고정 바이너리 형식으로 쓰기 */
export class ByteWriter {
  private parts: Uint8Array[] = [];

  u8(value: number): this {
    checkInt(value, 0xff);
    this.parts.push(new Uint8Array([value]));
    return this;
  }

  u16(value: number): this {
    checkInt(value, 0xffff);
    this.parts.push(new Uint8Array([value >>> 8, value & 255]));
    return this;
  }

  u32(value: number): this {
    checkInt(value, 0xffffffff);
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    this.parts.push(out);
    return this;
  }

  /** 2^53 아래 정수만(초 단위 시각, drand 회차) */
  u64(value: number): this {
    checkInt(value, Number.MAX_SAFE_INTEGER);
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, BigInt(value));
    this.parts.push(out);
    return this;
  }

  /** 길이가 정해진 바이트 */
  fixed(bytes: Uint8Array, length: number): this {
    if (bytes.length !== length) {
      throw new Error(
        `길이 ${length}바이트여야 하는데 ${bytes.length}바이트다`,
      );
    }
    this.parts.push(bytes);
    return this;
  }

  /** u16 길이를 앞에 붙인 바이트 */
  bytes(bytes: Uint8Array): this {
    this.u16(bytes.length);
    this.parts.push(bytes);
    return this;
  }

  text(text: string): this {
    return this.bytes(utf8(text));
  }

  done(): Uint8Array {
    return concat(...this.parts);
  }
}

/** 고정 바이너리 형식 읽기. 남거나 모자라면 오류 */
export class ByteReader {
  private at = 0;
  constructor(private readonly data: Uint8Array) {}

  private take(n: number): Uint8Array {
    if (this.at + n > this.data.length) throw new Error("바이트가 모자란다");
    const out = this.data.slice(this.at, this.at + n);
    this.at += n;
    return out;
  }

  u8(): number {
    return this.take(1)[0] ?? 0;
  }

  u16(): number {
    const b = this.take(2);
    return ((b[0] ?? 0) << 8) | (b[1] ?? 0);
  }

  u32(): number {
    return new DataView(this.take(4).buffer).getUint32(0);
  }

  u64(): number {
    const value = new DataView(this.take(8).buffer).getBigUint64(0);
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error("수가 너무 크다");
    return Number(value);
  }

  fixed(length: number): Uint8Array {
    return this.take(length);
  }

  bytes(): Uint8Array {
    return this.take(this.u16());
  }

  text(): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(this.bytes());
  }

  end(): void {
    if (this.at !== this.data.length) throw new Error("바이트가 남는다");
  }
}

function checkInt(value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`0~${max} 정수가 아니다: ${value}`);
  }
}
