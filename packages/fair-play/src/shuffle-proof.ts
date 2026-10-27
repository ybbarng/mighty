import {
  hash,
  type KeyProof,
  type KeyStatement,
  proveKeys,
  verifyKeys,
} from "./proof";
import { modInverse, type SraGroup } from "./sra";

/*
 * 섞기 증명(cut-and-choose, Sako–Kilian 1995식). 섞은 사람이 "출력 Y는 입력 X를 같은 비밀 지수 e로
 * 잠그고 순서만 바꾼 것"(Y_i = X_π(i)^e)을 e와 π를 보이지 않고 증명한다. 카드를 바꿔치기·복제·빼면
 * 이 문장이 깨진다. docs/15-shuffle-proof.md.
 *
 * 한 회: 중간 덱 Z = σ(X^t)(σ 무작위 순열, t 짧은 수)와 D = g^(e/t)를 먼저 낸다(약속).
 *   도전 0이면 σ와 t를 보여 X → Z를, 도전 1이면 τ = σ⁻¹∘π를 보여 Z → Y(Y_i = Z_τ(i)^(e/t))를 증명한다.
 *   τ는 σ가 무작위라 π에 대해 아무것도 알려 주지 않는다. 거짓 덱이면 한 회에 ½로 들키고, k회면 2^-k만 남는다.
 * 도전 1의 증명은 열쇠 증명(proof.ts, Chaum–Pedersen 묶음)을 그대로 쓴다(열쇠 자리에 1을 넣는다).
 * 도전 0은 σ·t를 알면 직접 계산할 수 있으므로 가중치로 묶어 거듭제곱 몇 번으로 확인한다.
 *
 * 도전값은 모두가 함께 정한다: 섞을 때 H(nonce)를 걸고, 모두의 약속이 모인 뒤 nonce를 공개해 해시한다.
 * 한 사람이라도 정직하면 아무도 도전값을 미리 알 수 없다(Fiat–Shamir처럼 해시를 거듭 돌려 노릴 수 없어 k가 작아도 된다).
 *
 * σ, t, nonce는 섞기 열쇠 e에서 해시로 정한다. 새로고침해도 같은 증명을 다시 만들 수 있다.
 */

/** 회 수. 거짓 덱이 들키지 않을 확률 2^-16 */
export const SHUFFLE_ROUNDS = 16;
/** 중간 덱 지수 t의 길이(섞기 열쇠와 같은 크기) */
const T_BITS = 320n;

/** 어느 기기가 어느 섞기를 증명하나(해시에 넣어 다른 섞기로 옮겨 쓰지 못하게) */
export interface ShuffleLabel {
  device: number;
  deal: number;
  round: number;
  stage: string;
}

/** 약속: 회마다 중간 덱 Z(base64)와 D(16진) */
export interface ShuffleCommit {
  z: string[][];
  d: string[];
}

export type ShuffleAnswer =
  | { b: 0; sigma: number[]; t: string }
  | { b: 1; tau: number[]; proof: KeyProof };

declare function setTimeout(callback: () => void, ms: number): unknown;
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/* ---------- 수 ↔ 글 ---------- */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 큰 수를 base64로(16진보다 3분의 1 짧다) */
export function toB64(n: bigint): string {
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = hex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [];
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
    const v = (a << 16) | (b << 8) | c;
    const left = bytes.length - i;
    out += B64[(v >> 18) & 63];
    out += B64[(v >> 12) & 63];
    out += left > 1 ? B64[(v >> 6) & 63] : "=";
    out += left > 2 ? B64[v & 63] : "=";
  }
  return out;
}

export function fromB64(text: string): bigint {
  let n = 0n;
  let bits = 0n;
  let pending = 0n;
  for (const ch of text) {
    if (ch === "=") break;
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error("base64가 아니다");
    pending = (pending << 6n) | BigInt(v);
    bits += 6n;
    if (bits >= 8n) {
      bits -= 8n;
      n = (n << 8n) | (pending >> bits);
      pending &= (1n << bits) - 1n;
    }
  }
  return n;
}

/* ---------- 결정적 난수(섞기 열쇠에서) ---------- */

function labelParts(l: ShuffleLabel): (string | number)[] {
  return [l.device, l.deal, l.round, l.stage];
}

/** 섞을 때 거는 nonce. 섞기 열쇠에서 정하므로 새로고침해도 같다 */
export async function shuffleNonce(
  e: bigint,
  l: ShuffleLabel,
): Promise<string> {
  return (await hash(["nonce", e, ...labelParts(l)])).toString(16);
}

export async function nonceCommit(nonce: string): Promise<string> {
  return (await hash(["nc", nonce])).toString(16);
}

async function secretsOf(
  g: SraGroup,
  e: bigint,
  l: ShuffleLabel,
  r: number,
  n: number,
): Promise<{ sigma: number[]; t: bigint }> {
  const h = await hash(["t", e, ...labelParts(l), r]);
  // 곱셈군은 q가 커서 짧은 t(해시 그대로)를 쓴다. 타원곡선은 q가 해시보다 작아, 해시 둘(512비트)을
  // 이어 q 안으로 줄여 고르게 뽑는다(D = g^(e/t)가 e를 드러내지 않게).
  const t =
    g.q > 1n << T_BITS
      ? 1n + (h % (1n << T_BITS))
      : 1n +
        (((h << 256n) | (await hash(["t2", e, ...labelParts(l), r]))) %
          (g.q - 1n));
  const sigma = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Number(
      (await hash(["s", e, ...labelParts(l), r, i])) % BigInt(i + 1),
    );
    [sigma[i], sigma[j]] = [sigma[j] as number, sigma[i] as number];
  }
  return { sigma, t };
}

/* ---------- 약속과 응답 ---------- */

/** 섞은 사람이 남겨 두는 계산(응답할 때 쓴다) */
export interface ShuffleWork {
  commit: ShuffleCommit;
  z: bigint[][];
  sigmas: number[][];
  ts: bigint[];
}

/** 약속을 만든다: 회마다 Z = σ(X^t), D = g^(e/t) */
export async function commitShuffle(
  g: SraGroup,
  l: ShuffleLabel,
  input: readonly bigint[],
  e: bigint,
): Promise<ShuffleWork> {
  const work: ShuffleWork = {
    commit: { z: [], d: [] },
    z: [],
    sigmas: [],
    ts: [],
  };
  for (let r = 0; r < SHUFFLE_ROUNDS; r++) {
    const { sigma, t } = await secretsOf(g, e, l, r, input.length);
    const z: bigint[] = [];
    for (const [j, from] of sigma.entries()) {
      z.push(g.pow(input[from] as bigint, t));
      if (j % 8 === 7) await breathe();
    }
    const d = (e * modInverse(t, g.q)) % g.q;
    work.z.push(z);
    work.sigmas.push(sigma);
    work.ts.push(t);
    work.commit.z.push(z.map(toB64));
    work.commit.d.push(g.pow(g.generator, d).toString(16));
  }
  return work;
}

/** 도전 비트(모두의 nonce와 약속에서). 약속을 해시에 넣어 약속을 바꿔치기하지 못하게 한다 */
export async function challengeBits(
  l: Omit<ShuffleLabel, "device">,
  nonces: readonly string[],
  commitDigests: readonly string[],
): Promise<number[]> {
  const h = await hash([
    "challenge",
    l.deal,
    l.round,
    l.stage,
    ...nonces,
    ...commitDigests,
  ]);
  return Array.from({ length: SHUFFLE_ROUNDS }, (_, r) =>
    Number((h >> BigInt(r)) & 1n),
  );
}

/** 약속의 해시(도전값에 넣는다) */
export async function commitDigest(commit: ShuffleCommit): Promise<string> {
  return (await hash(["commit", JSON.stringify(commit)])).toString(16);
}

/** 도전 1의 문장: Y_i = Z_τ(i)^d 이고 D = g^d */
function linkStatement(
  l: ShuffleLabel,
  r: number,
  z: readonly bigint[],
  output: readonly bigint[],
  tau: readonly number[],
  D: bigint,
): KeyStatement {
  return {
    // 기기·판·회 번호를 해시에 넣는다(다른 섞기·다른 회로 옮겨 쓰지 못하게).
    device: (l.deal * 100 + l.round * 10 + l.device) * 100 + r,
    v: D,
    items: output.map((y, i) => ({
      slot: i,
      input: z[tau[i] as number] as bigint,
      output: y,
      key: 1n,
    })),
  };
}

/** 응답: 도전 0이면 σ·t, 도전 1이면 τ와 Z → Y 증명 */
export async function answerShuffle(
  g: SraGroup,
  l: ShuffleLabel,
  input: readonly bigint[],
  output: readonly bigint[],
  e: bigint,
  work: ShuffleWork,
  bits: readonly number[],
): Promise<ShuffleAnswer[]> {
  // 섞은 순열 π: Y_i = X_π(i)^e. 섞을 때 남기지 않았으므로 X^e를 다시 계산해 맞춘다.
  // 앞사람이 같은 값을 둘 넣었으면(복제) 같은 값끼리 서로 다른 자리를 짝지어 내 증명은 맞게 한다.
  const positions = new Map<bigint, number[]>();
  for (const [i, x] of input.entries()) {
    const key = g.pow(x, e);
    positions.set(key, [...(positions.get(key) ?? []), i]);
    if (i % 8 === 7) await breathe();
  }
  const pi = output.map((y) => positions.get(y)?.shift());
  if (pi.some((i) => i === undefined))
    throw new Error("내 섞기 출력이 입력과 맞지 않는다");
  const answers: ShuffleAnswer[] = [];
  for (let r = 0; r < SHUFFLE_ROUNDS; r++) {
    const sigma = work.sigmas[r] as number[];
    const t = work.ts[r] as bigint;
    if (bits[r] === 0) {
      answers.push({ b: 0, sigma, t: t.toString(16) });
      continue;
    }
    const inverse: number[] = [];
    for (const [j, from] of sigma.entries()) inverse[from] = j;
    const tau = pi.map((i) => inverse[i as number] as number);
    const d = (e * modInverse(t, g.q)) % g.q;
    const st = linkStatement(
      l,
      r,
      work.z[r] as bigint[],
      output,
      tau,
      g.pow(g.generator, d),
    );
    answers.push({ b: 1, tau, proof: await proveKeys(g, st, d) });
    await breathe();
  }
  return answers;
}

/* ---------- 확인 ---------- */

function isPermutation(list: unknown, n: number): list is number[] {
  if (!Array.isArray(list) || list.length !== n) return false;
  const seen = new Set<number>();
  for (const v of list) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

/** 가중치(64비트). 확인하는 값 모두의 해시에서 정한다 */
async function weights(
  parts: readonly (string | number | bigint)[],
  n: number,
) {
  const seed = await hash(parts);
  const out: bigint[] = [];
  for (let i = 0; i < n; i++)
    out.push((await hash([seed, i])) & 0xffff_ffff_ffff_ffffn);
  return out;
}

/**
 * 섞기 증명을 확인한다. 약속·응답 모양이 틀려도 false.
 * `input`은 그 기기가 받은 덱, `output`은 그 기기가 넘긴 덱
 */
export async function verifyShuffle(
  g: SraGroup,
  l: ShuffleLabel,
  input: readonly bigint[],
  output: readonly bigint[],
  commit: ShuffleCommit,
  bits: readonly number[],
  answers: readonly ShuffleAnswer[],
): Promise<boolean> {
  const n = input.length;
  if (
    output.length !== n ||
    !Array.isArray(commit?.z) ||
    !Array.isArray(commit?.d) ||
    !Array.isArray(answers) ||
    commit.z.length !== SHUFFLE_ROUNDS ||
    commit.d.length !== SHUFFLE_ROUNDS ||
    answers.length !== SHUFFLE_ROUNDS
  )
    return false;
  // 넘긴 덱도 부분군 안에 있어야 한다(가중치 묶음이 부분군 밖 성분을 반만 잡는다).
  if (!output.every((y) => g.isElement(y))) return false;
  for (let r = 0; r < SHUFFLE_ROUNDS; r++) {
    const answer = answers[r];
    const zText = commit.z[r];
    if (!answer || !Array.isArray(zText) || zText.length !== n) return false;
    let z: bigint[];
    let D: bigint;
    try {
      z = zText.map(fromB64);
      D = BigInt(`0x${commit.d[r]}`);
    } catch {
      return false;
    }
    if (!z.every((v) => g.isElement(v))) return false;
    if (answer.b !== bits[r]) return false;
    if (answer.b === 0) {
      // Z_j = X_σ(j)^t 를 가중치로 묶어 본다: Π Z_j^w_j = (Π X_σ(j)^w_j)^t
      if (!isPermutation(answer.sigma, n)) return false;
      let t: bigint;
      try {
        t = BigInt(`0x${answer.t}`);
      } catch {
        return false;
      }
      if (t <= 0n || t >= g.q) return false;
      const w = await weights(
        ["zero", ...labelParts(l), r, t, ...answer.sigma, ...zText],
        n,
      );
      let left = g.one;
      let right = g.one;
      for (let j = 0; j < n; j++) {
        left = g.mul(left, g.pow(z[j] as bigint, w[j] as bigint));
        right = g.mul(
          right,
          g.pow(input[answer.sigma[j] as number] as bigint, w[j] as bigint),
        );
      }
      if (left !== g.pow(right, t)) return false;
    } else {
      if (!isPermutation(answer.tau, n)) return false;
      const st = linkStatement(l, r, z, output, answer.tau, D);
      if (!(await verifyKeys(g, st, answer.proof))) return false;
    }
    await breathe();
  }
  return true;
}
