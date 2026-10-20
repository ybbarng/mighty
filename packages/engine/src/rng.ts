/**
 * 상태 안에 넣어 둘 수 있는 난수 생성기(mulberry32).
 * 상태가 숫자 하나라 JSON으로 저장·전송할 수 있고, 같은 시드면 같은 판이 나온다.
 */
export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** 0 이상 1 미만의 수를 꺼내고 `rng`를 다음 상태로 바꾼다. */
export function nextFloat(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RngState, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive);
}

/** Fisher-Yates로 제자리에서 섞는다. */
export function shuffleInPlace<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}
