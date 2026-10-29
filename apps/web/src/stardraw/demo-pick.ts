import type { Draw, Rank } from "@mighty/stardraw-core";

/**
 * 데모 전용: 미리 본 당첨 번호로 "이번엔 n등"이 되는 번호 6개를 고른다(진짜 게임에는 없는 기능).
 * 1등 6개, 2등 5개 + 보너스, 3등 5개 + 다른 1개, 4등 4개, 5등 3개, 낙첨은 하나도 안 맞게.
 */
export function demoPick(
  draw: Pick<Draw, "numbers" | "bonus">,
  rank: Rank | null,
): number[] {
  const others = Array.from({ length: 45 }, (_, i) => i + 1).filter(
    (n) => !draw.numbers.includes(n) && n !== draw.bonus,
  );
  const hits = rank === null ? 0 : ([6, 5, 5, 4, 3] as const)[rank - 1];
  const out = draw.numbers.slice(0, hits);
  if (rank === 2) out.push(draw.bonus);
  for (const n of others) {
    if (out.length >= 6) break;
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}
