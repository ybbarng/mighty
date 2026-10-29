import {
  drandRandomness,
  drawNumbers,
  drawSeed,
  RANKS,
  type Rank,
  type RoundRecord,
  rankOf,
  type Ticket,
} from "@mighty/stardraw-core";

/** 추첨 연출에 쓸, 공이 나온 차례(앞 6개 당첨 번호, 7번째 보너스). 기록의 drand 값으로 다시 계산한다 */
export function drawOrder(record: RoundRecord): number[] {
  if (record.void) return [];
  return drawNumbers(
    drawSeed(
      record.round,
      drandRandomness({
        round: record.drandRound,
        signature: record.drandSignature,
      }),
    ),
  ).order;
}

/** 내 응모권 등수(무효 회차·낙첨은 null) */
export function myRank(record: RoundRecord, ticket: Ticket): Rank | null {
  if (record.void) return null;
  return rankOf(record, ticket.numbers);
}

/** 등수별 당첨 응모권 수 */
export function winnerCounts(record: RoundRecord): Record<Rank, number> {
  return Object.fromEntries(
    RANKS.map((r) => [r, record.winners[r].length]),
  ) as Record<Rank, number>;
}

export const RANK_RULE: Record<Rank, string> = {
  1: "6개 모두",
  2: "5개 + 보너스",
  3: "5개",
  4: "4개",
  5: "3개",
};
