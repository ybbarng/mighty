import { generateSigner, type Signer } from "./keys";
import type { PowParams } from "./pow";
import type { Schedule } from "./schedule";
import { makeTicket, type Ticket } from "./ticket";

/**
 * 시험용 도구(index에서 내보내지 않는다).
 * 작업 증명은 규칙의 16MB 대신 가장 작은 메모리로 돌리고, 목표값을 넉넉히 둬 몇 번 만에 풀린다.
 */

export const TEST_POW: PowParams = { memorySize: 8, iterations: 1 };
/** 평균 2번 만에 풀린다 */
export const EASY_TARGET = 2 ** 31;

// 2026-10-29 15:00 KST
export const TEST_EPOCH = 1793253600;

export const HOURLY: Schedule = {
  epoch: TEST_EPOCH,
  entries: [
    { fromRound: 1, length: 3600, closeMargin: 60, powTarget: EASY_TARGET },
  ],
};

export async function signers(n: number): Promise<Signer[]> {
  return Promise.all(Array.from({ length: n }, () => generateSigner()));
}

export async function ticketFor(
  signer: Signer,
  round: number,
  numbers: number[],
  challenge: Uint8Array,
): Promise<Ticket> {
  const t = await makeTicket(signer, round, numbers, challenge, EASY_TARGET, {
    params: TEST_POW,
  });
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

/** 48바이트 가짜 drand 서명(시험은 서명 확인을 바꿔 끼운다) */
export function fakeSignature(seed: number): Uint8Array {
  return Uint8Array.from({ length: 48 }, (_, i) => (seed * 31 + i * 7) & 255);
}
