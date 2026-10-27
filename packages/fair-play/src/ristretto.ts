import type { SraGroup } from "./sra";

/*
 * ristretto255 위의 SRA(docs/15 "타원곡선"). 소수 크기 군이라 곱셈군의 이차잉여 같은 따로 걸러 낼 성질이 없다.
 *   잠그기: E_k(M) = k·M,  풀기: M = (k⁻¹ mod ℓ)·C
 * 계산은 libsodium(웹어셈블리)으로 한다. 곱하기 한 번이 2048비트 거듭제곱보다 열 배 넘게 빠르고,
 * 원소 하나가 32바이트라 메시지도 작다.
 *
 * 원소는 다른 군처럼 bigint로 다룬다: 32바이트 표준 인코딩을 큰 끝(big-endian) 수로 읽은 값.
 * 표준 인코딩은 점마다 하나라 수가 같으면 같은 점이다. 항등원(모두 0인 인코딩)은 0n이다.
 */

type Sodium = typeof import("libsodium-wrappers-sumo");

/** 군의 크기 ℓ = 2^252 + 27742317777372353535851937790883648493 */
const L = (1n << 252n) + 27742317777372353535851937790883648493n;

function toBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function fromBytes(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/** 지수(mod ℓ)를 libsodium의 작은 끝(little-endian) 32바이트로 */
function scalarBytes(e: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = e;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** 영문 글자를 바이트로. TextEncoder는 환경(jsdom 등)에 따라 다른 Uint8Array를 돌려줘 libsodium이 받지 않는다 */
function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function makeGroup(sodium: Sodium): SraGroup {
  const one = 0n;
  const pow = (x: bigint, e: bigint): bigint => {
    const k = ((e % L) + L) % L;
    if (k === 0n || x === one) return one;
    return fromBytes(
      sodium.crypto_scalarmult_ristretto255(scalarBytes(k), toBytes(x)),
    );
  };
  const mul = (a: bigint, b: bigint): bigint => {
    if (a === one) return b;
    if (b === one) return a;
    return fromBytes(
      sodium.crypto_core_ristretto255_add(toBytes(a), toBytes(b)),
    );
  };
  return {
    name: "ristretto255",
    q: L,
    bits: 256,
    generator: fromBytes(
      sodium.crypto_scalarmult_ristretto255_base(scalarBytes(1n)),
    ),
    one,
    keyBits: null,
    pow,
    mul,
    // 표준 인코딩인 군의 원소만(항등원 제외). 다른 값은 증명을 속이는 데 쓸 수 있다.
    isElement: (x) =>
      x > 0n &&
      x < 1n << 256n &&
      sodium.crypto_core_ristretto255_is_valid_point(toBytes(x)),
    // 카드는 해시로 정한 점(RFC 9380식 해시→점). 생성원으로 i·G처럼 두면 이산 로그가 알려져
    // 잠근 값에서 카드를 거꾸로 맞춰 볼 수 있다.
    encodeIndex: (index) =>
      fromBytes(
        sodium.crypto_core_ristretto255_from_hash(
          sodium.crypto_hash_sha512(ascii(`mighty-fair-card|${index}`)),
        ),
      ),
  };
}

let loaded: Promise<SraGroup> | null = null;

/** libsodium을 불러와 ristretto255 군을 만든다(한 번만). 인터넷 대전에 들어갈 때만 받는다 */
export function loadRistretto255(): Promise<SraGroup> {
  loaded ??= import("libsodium-wrappers-sumo").then(async (module) => {
    const sodium = (module.default ?? module) as Sodium;
    await sodium.ready;
    return makeGroup(sodium);
  });
  return loaded;
}
