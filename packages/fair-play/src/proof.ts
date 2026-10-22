import { isQuadraticResidue, modPow, randomBelow, type SraGroup } from "./sra";

/*
 * 열쇠 증명(Chaum–Pedersen, 1992). "같은 비밀 지수 u로 두 쌍이 이어져 있다"를 u를 보이지 않고 증명한다.
 *   V = g^u  이고  B = A^u
 *
 * 쓰는 곳: 자리마다 다시 잠그는 단계(relock)에서 기기는 자리 i를 I[i] → O[i] = I[i]^(u·k_i)로 잠근다.
 * u는 그 단계에서 섞기 열쇠를 푸는 지수, k_i는 자리 열쇠다. 잠글 때 V = g^u를 함께 낸다.
 * 나중에 자리 열쇠 k_i를 공개하면 A = Π (I[i]^k_i)^w_i, B = Π O[i]^w_i로 두고 B = A^u를 증명한다.
 * 열쇠가 잠글 때 쓴 것과 다르면(또는 잠글 때 값을 바꿔치기했으면) 증명이 맞지 않는다.
 * 여러 열쇠를 한 증명으로 묶는다. 가중치 w_i는 공개한 값에서 해시로 정하므로 틀린 열쇠끼리 서로 지워지게 고를 수 없다.
 *
 * 비대화식(Fiat–Shamir): 도전값 c를 상대가 내지 않고 (g, V, A, B, a, b)의 해시로 정한다.
 */

/** 이차잉여 부분군(크기 q)의 생성원. 2²은 이차잉여이고 q가 소수라 1이 아닌 원소는 모두 생성원이다 */
export const GENERATOR = 4n;

/** 같은 지수 증명: a = g^r, b = A^r, z = r + c·u (mod q) */
export interface KeyProof {
  a: string;
  b: string;
  z: string;
}

/** 브라우저와 Node(전역 Web Crypto) 모두에 있는 해시 */
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  };
};
declare class TextEncoder {
  encode(text: string): Uint8Array;
}

async function hash(
  parts: readonly (string | number | bigint)[],
): Promise<bigint> {
  const text = parts
    .map((p) => (typeof p === "bigint" ? p.toString(16) : String(p)))
    .join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  let n = 0n;
  for (const b of new Uint8Array(digest)) n = (n << 8n) | BigInt(b);
  return n;
}

/** 한 단계에서 잠근 값과 그 자리 열쇠들 */
export interface KeyStatement {
  /** 증명하는 기기(해시에 넣어 남의 증명을 옮겨 쓰지 못하게) */
  device: number;
  /** 잠근 단계의 V = g^u */
  v: bigint;
  /** 자리마다 잠그기 전 값 I, 잠근 뒤 값 O, 공개한 자리 열쇠 k */
  items: readonly {
    slot: number;
    input: bigint;
    output: bigint;
    key: bigint;
  }[];
}

/** A = Π (I^k)^w, B = Π O^w. 가중치는 공개한 값의 해시(64비트) */
async function combineStatement(
  g: SraGroup,
  st: KeyStatement,
): Promise<{ A: bigint; B: bigint }> {
  const seed = await hash([
    "w",
    st.device,
    st.v,
    ...st.items.flatMap((i) => [i.slot, i.input, i.output, i.key]),
  ]);
  let A = 1n;
  let B = 1n;
  for (const [index, item] of st.items.entries()) {
    const w = (await hash([seed, index])) & 0xffff_ffff_ffff_ffffn;
    A = (A * modPow(item.input, (item.key * w) % g.q, g.p)) % g.p;
    B = (B * modPow(item.output, w, g.p)) % g.p;
  }
  return { A, B };
}

async function challenge(
  g: SraGroup,
  st: KeyStatement,
  A: bigint,
  B: bigint,
  a: bigint,
  b: bigint,
): Promise<bigint> {
  return (await hash(["c", st.device, GENERATOR, st.v, A, B, a, b])) % g.q;
}

/** 증명을 만든다. `u`는 잠근 단계의 지수(V = g^u) */
export async function proveKeys(
  g: SraGroup,
  st: KeyStatement,
  u: bigint,
): Promise<KeyProof> {
  const { A, B } = await combineStatement(g, st);
  const r = 1n + randomBelow(g.q - 1n);
  const a = modPow(GENERATOR, r, g.p);
  const b = modPow(A, r, g.p);
  const c = await challenge(g, st, A, B, a, b);
  const z = (r + c * u) % g.q;
  return { a: a.toString(16), b: b.toString(16), z: z.toString(16) };
}

/** 증명이 맞는가: g^z = a·V^c 이고 A^z = b·B^c */
export async function verifyKeys(
  g: SraGroup,
  st: KeyStatement,
  proof: KeyProof,
): Promise<boolean> {
  let a: bigint;
  let b: bigint;
  let z: bigint;
  try {
    a = BigInt(`0x${proof.a}`);
    b = BigInt(`0x${proof.b}`);
    z = BigInt(`0x${proof.z}`);
  } catch {
    return false;
  }
  if (st.items.length === 0) return false;
  const { A, B } = await combineStatement(g, st);
  // 크기 q 부분군 밖의 값을 섞어 짝수·홀수 도전값만 맞추는 속임을 막는다.
  if (![st.v, a, b, A, B].every((x) => isQuadraticResidue(g, x))) return false;
  const c = await challenge(g, st, A, B, a, b);
  return (
    modPow(GENERATOR, z, g.p) === (a * modPow(st.v, c, g.p)) % g.p &&
    modPow(A, z, g.p) === (b * modPow(B, c, g.p)) % g.p
  );
}
