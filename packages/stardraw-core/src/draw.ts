import { ByteWriter, taggedHash } from "./bytes";
import { MAX_NUMBER, PICK_COUNT } from "./ticket";

/**
 * 당첨 번호(docs/36 4절).
 * seed = taggedHash("stardraw/seed/v1", round(u32) ‖ drand 난수)
 * 머클 루트·응모 수처럼 운영자가 바꿀 수 있는 값은 seed에 넣지 않는다(8-1 O4).
 *
 * 뽑기: SHA-256(seed ‖ i(u32))를 i = 0, 1, 2, …로 이어 바이트를 하나씩 읽는다.
 * 225(= 45 × 5) 이상은 버리고(거절 표본, 치우침 없음) b % 45 + 1을 번호로 쓴다.
 * 이미 나온 번호는 건너뛰고 7개가 될 때까지 읽는다. 앞 6개가 당첨 번호, 7번째가 보너스.
 */

const ACCEPT_BELOW = Math.floor(256 / MAX_NUMBER) * MAX_NUMBER;

export function drawSeed(round: number, randomness: Uint8Array): Uint8Array {
  return taggedHash(
    "stardraw/seed/v1",
    new ByteWriter().u32(round).fixed(randomness, 32).done(),
  );
}

export interface Draw {
  /** 나온 차례 그대로(추첨 연출에 쓴다) */
  order: number[];
  /** 당첨 번호 6개, 오름차순 */
  numbers: number[];
  bonus: number;
}

export function drawNumbers(seed: Uint8Array): Draw {
  const order: number[] = [];
  for (let i = 0; order.length < PICK_COUNT + 1; i++) {
    const block = taggedHash(
      "stardraw/draw/v1",
      seed,
      new ByteWriter().u32(i).done(),
    );
    for (const b of block) {
      if (b >= ACCEPT_BELOW) continue;
      const n = (b % MAX_NUMBER) + 1;
      if (order.includes(n)) continue;
      order.push(n);
      if (order.length === PICK_COUNT + 1) break;
    }
  }
  return {
    order,
    numbers: order.slice(0, PICK_COUNT).sort((a, b) => a - b),
    bonus: order[PICK_COUNT] as number,
  };
}

/** 6/45 로또와 같은 등수: 1등 6개, 2등 5개 + 보너스, 3등 5개, 4등 4개, 5등 3개 */
export type Rank = 1 | 2 | 3 | 4 | 5;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5];

export function rankOf(
  draw: Pick<Draw, "numbers" | "bonus">,
  picked: readonly number[],
): Rank | null {
  const hits = picked.filter((n) => draw.numbers.includes(n)).length;
  if (hits === 6) return 1;
  if (hits === 5) return picked.includes(draw.bonus) ? 2 : 3;
  if (hits === 4) return 4;
  if (hits === 3) return 5;
  return null;
}
