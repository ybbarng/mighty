import type { Commitment, Reveal } from "./protocol";
import { randomId } from "./transport";

/**
 * 공정한 섞기(commit-reveal). 각자 비밀 값을 만들어 해시만 먼저 알리고, 시작할 때 원래 값을 공개한다.
 * 시드는 모두의 값을 이어 붙인 해시라서, 한 명이라도 정직하면 방장도 덱 순서를 정할 수 없다.
 */
export function newSecret(): string {
  return randomId(32);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 재접속 증명. 받는 사람 연결 아이디에 묶어 엿들은 값을 다른 데서 못 쓰게 한다 */
export function tokenProof(token: string, recipient: string): Promise<string> {
  return sha256Hex(`mighty-token|${token}|${recipient}`);
}

export function commit(secret: string): Promise<string> {
  return sha256Hex(`mighty-commit:${secret}`);
}

export type SeedResult =
  | { ok: true; seed: number }
  | { ok: false; reason: string };

/** 공개된 값이 약속한 해시와 맞는지 확인하고 시드를 만든다. 방장과 참가자가 같은 함수로 검증한다 */
export async function deriveSeed(
  commitments: readonly Commitment[],
  reveals: readonly Reveal[],
): Promise<SeedResult> {
  const bySeat = new Map(reveals.map((r) => [r.seat, r.secret]));
  for (const c of commitments) {
    const secret = bySeat.get(c.seat);
    if (secret === undefined)
      return { ok: false, reason: `${c.seat}번 자리가 값을 공개하지 않았다` };
    if ((await commit(secret)) !== c.hash)
      return { ok: false, reason: `${c.seat}번 자리의 값이 약속과 다르다` };
  }
  const joined = [...commitments]
    .sort((a, b) => a.seat - b.seat)
    .map((c) => bySeat.get(c.seat))
    .join("|");
  const hex = await sha256Hex(`mighty-seed:${joined}`);
  return { ok: true, seed: Number.parseInt(hex.slice(0, 8), 16) };
}
