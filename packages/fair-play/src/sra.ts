/**
 * SRA(Shamir·Rivest·Adleman, 1979) 교환 가능한 암호. 안전 소수 p = 2q + 1의 이차잉여 부분군(크기 q)에서
 *   잠그기: E_k(m) = m^k mod p,  풀기: m = c^(k⁻¹ mod q) mod p
 * 지수끼리 곱해지므로 잠근 순서와 상관없이 풀 수 있다: E_a(E_b(m)) = E_b(E_a(m)).
 *
 * 카드는 이차잉여(제곱수)로만 나타낸다. 이차잉여가 아닌 값을 섞어 쓰면 잠가도 "이차잉여인가"가
 * 그대로 남아 카드 정보가 샌다(SRA의 잘 알려진 약점).
 */

/** 브라우저와 Node(전역 Web Crypto) 모두에 있는 난수 함수. 패키지는 DOM 타입을 쓰지 않는다 */
declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
};

export interface SraGroup {
  name: string;
  /** 안전 소수 */
  p: bigint;
  /** (p − 1) / 2, 소수 */
  q: bigint;
  bits: number;
}

function group(name: string, hex: string): SraGroup {
  const p = BigInt(`0x${hex.replace(/\s+/g, "")}`);
  return { name, p, q: (p - 1n) / 2n, bits: p.toString(2).length };
}

/** RFC 2409 Oakley Group 2 (1024비트 안전 소수). 학습·시험용 */
export const GROUP_1024 = group(
  "RFC 2409 Oakley Group 2",
  `FFFFFFFF FFFFFFFF C90FDAA2 2168C234 C4C6628B 80DC1CD1
   29024E08 8A67CC74 020BBEA6 3B139B22 514A0879 8E3404DD
   EF9519B3 CD3A431B 302B0A6D F25F1437 4FE1356D 6D51C245
   E485B576 625E7EC6 F44C42E9 A637ED6B 0BFF5CB6 F406B7ED
   EE386BFB 5A899FA5 AE9F2411 7C4B1FE6 49286651 ECE65381
   FFFFFFFF FFFFFFFF`,
);

/** RFC 3526 MODP Group 14 (2048비트 안전 소수) */
export const GROUP_2048 = group(
  "RFC 3526 MODP Group 14",
  `FFFFFFFF FFFFFFFF C90FDAA2 2168C234 C4C6628B 80DC1CD1
   29024E08 8A67CC74 020BBEA6 3B139B22 514A0879 8E3404DD
   EF9519B3 CD3A431B 302B0A6D F25F1437 4FE1356D 6D51C245
   E485B576 625E7EC6 F44C42E9 A637ED6B 0BFF5CB6 F406B7ED
   EE386BFB 5A899FA5 AE9F2411 7C4B1FE6 49286651 ECE45B3D
   C2007CB8 A163BF05 98DA4836 1C55D39A 69163FA8 FD24CF5F
   83655D23 DCA3AD96 1C62F356 208552BB 9ED52907 7096966D
   670C354E 4ABC9804 F1746C08 CA18217C 32905E46 2E36CE3B
   E39E772C 180E8603 9B2783A2 EC07A28F B5C55DF0 6F4C52C9
   DE2BCBF6 95581718 3995497C EA956AE5 15D22618 98FA0510
   15728E5A 8AACAA68 FFFFFFFF FFFFFFFF`,
);

/** 거듭제곱 나머지. 5비트씩 끊어 곱하는 창 방식이라 한 비트씩 하는 것보다 3할쯤 빠르다 */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (exp === 0n) return 1n % mod;
  const b = ((base % mod) + mod) % mod;
  const table: bigint[] = [1n, b];
  for (let i = 2; i < 32; i++) table.push(((table[i - 1] as bigint) * b) % mod);
  const bits = exp.toString(2);
  const padded = "0".repeat((5 - (bits.length % 5)) % 5) + bits;
  let result = 1n;
  for (let i = 0; i < padded.length; i += 5) {
    if (i > 0) for (let k = 0; k < 5; k++) result = (result * result) % mod;
    const digit = Number.parseInt(padded.slice(i, i + 5), 2);
    if (digit) result = (result * (table[digit] as bigint)) % mod;
  }
  return result;
}

/** a⁻¹ mod m (확장 유클리드) */
export function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new Error("역원이 없다");
  return ((oldS % m) + m) % m;
}

/** 0 이상 max 미만의 고른 난수(Web Crypto) */
export function randomBelow(max: bigint): bigint {
  const bytes = Math.ceil(max.toString(2).length / 8) + 8;
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  return n % max;
}

/** 밀러–라빈 소수 판정(군 상수 확인용) */
export function isProbablePrime(n: bigint, rounds = 24): boolean {
  if (n < 2n) return false;
  for (const small of [2n, 3n, 5n, 7n, 11n, 13n]) {
    if (n === small) return true;
    if (n % small === 0n) return false;
  }
  let d = n - 1n;
  let r = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  for (let i = 0; i < rounds; i++) {
    const a = 2n + randomBelow(n - 4n);
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let j = 1; j < r; j++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

/** 잠그는 열쇠: 1 ≤ k < q (q가 소수라 모두 역원이 있다) */
export function newKey(g: SraGroup): bigint {
  return 1n + randomBelow(g.q - 1n);
}

/**
 * 섞을 때 쓰는 짧은 열쇠(320비트). 잠그기는 열쇠 길이만큼 걸리므로 빨라진다.
 * 짧은 지수도 이 군에서는 안전하다(찾는 데 2^160번쯤, RFC 3526 권장 크기)
 */
export function newShortKey(bits = 320): bigint {
  return 1n + randomBelow((1n << BigInt(bits)) - 1n);
}

/** 여러 열쇠로 한꺼번에 잠그거나 푸는 지수: 곱(mod q) */
export function combine(g: SraGroup, exponents: readonly bigint[]): bigint {
  return exponents.reduce((acc, e) => (acc * e) % g.q, 1n);
}

/** 풀기 지수 */
export function unlockExponent(g: SraGroup, key: bigint): bigint {
  return modInverse(key, g.q);
}

/** 카드 번호 i를 이차잉여 (i + 2)² mod p로 나타낸다 */
export function encodeIndex(g: SraGroup, index: number): bigint {
  const x = BigInt(index + 2);
  return (x * x) % g.p;
}

/** 이차잉여인가(오일러 판정) */
export function isQuadraticResidue(g: SraGroup, value: bigint): boolean {
  return modPow(value, g.q, g.p) === 1n;
}

/**
 * 야코비 기호(a/n), n은 홀수. n이 소수면 르장드르 기호라 1이면 이차잉여다.
 * 오일러 판정(거듭제곱 한 번)보다 수십 배 빠르다. 증명을 확인할 때 받은 값이 부분군에 있는지 본다
 */
export function jacobi(a: bigint, n: bigint): number {
  let x = ((a % n) + n) % n;
  let m = n;
  let result = 1;
  while (x !== 0n) {
    while ((x & 1n) === 0n) {
      x >>= 1n;
      const r = m & 7n;
      if (r === 3n || r === 5n) result = -result;
    }
    [x, m] = [m, x];
    if ((x & 3n) === 3n && (m & 3n) === 3n) result = -result;
    x %= m;
  }
  return m === 1n ? result : 0;
}
