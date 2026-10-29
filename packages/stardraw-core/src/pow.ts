import { argon2id } from "hash-wasm";
import { ByteWriter } from "./bytes";

/**
 * 작업 증명(docs/36 4절): Argon2id로 `문제 값 ‖ 응모권 내용 ‖ n`을 계산해
 * 결과 앞 4바이트(u32)가 목표값보다 작은 n을 찾는다. 평균 시도 수는 2^32 / 목표값.
 * 메모리를 많이 쓰는 계산이라 그래픽카드의 이점이 작다.
 */

export interface PowParams {
  /** KiB */
  memorySize: number;
  iterations: number;
}

/** 공개 규칙의 값. 시험만 작은 값을 넣는다 */
export const POW_PARAMS: PowParams = { memorySize: 16 * 1024, iterations: 1 };

/** 평균 시도 수 → 목표값 */
export function powTargetForTries(tries: number): number {
  if (!(tries >= 1)) throw new Error("평균 시도 수는 1 이상");
  return Math.max(1, Math.min(0xffffffff, Math.floor(2 ** 32 / tries)));
}

/**
 * 한 번 계산. salt는 문제 값(앞 회차 기록 해시, 32바이트)이라 미리 계산할 수 없고,
 * password는 응모권 내용 ‖ n이라 남의 계산을 쓸 수 없다.
 */
export async function powHash(
  challenge: Uint8Array,
  content: Uint8Array,
  nonce: number,
  params: PowParams = POW_PARAMS,
): Promise<Uint8Array> {
  return argon2id({
    password: new ByteWriter().bytes(content).u32(nonce).done(),
    salt: challenge,
    parallelism: 1,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: 32,
    outputType: "binary",
  });
}

export function meetsTarget(hash: Uint8Array, target: number): boolean {
  const head = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0);
  return head < target;
}

export async function checkPow(
  challenge: Uint8Array,
  content: Uint8Array,
  nonce: number,
  target: number,
  params: PowParams = POW_PARAMS,
): Promise<boolean> {
  return meetsTarget(await powHash(challenge, content, nonce, params), target);
}

export interface SolveOptions {
  params?: PowParams;
  /** 시작 n(이어서 풀기) */
  start?: number;
  /** 시도마다 부른다. false를 돌려주면 멈춘다(취소) */
  onTry?: (tries: number) => boolean | undefined;
}

/** 목표값을 넘는 n을 찾는다. 취소되면 null */
export async function solvePow(
  challenge: Uint8Array,
  content: Uint8Array,
  target: number,
  options: SolveOptions = {},
): Promise<number | null> {
  const params = options.params ?? POW_PARAMS;
  for (
    let nonce = options.start ?? 0, tries = 1;
    nonce <= 0xffffffff;
    nonce++, tries++
  ) {
    if (await checkPow(challenge, content, nonce, target, params)) return nonce;
    if (options.onTry?.(tries) === false) return null;
  }
  return null;
}
