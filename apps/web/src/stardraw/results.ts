import {
  drandRandomness,
  drawNumbers,
  drawSeed,
  RANKS,
  type Rank,
  type RoundRecord,
  rankOf,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import type { QualMark } from "./qual-judge";

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

/**
 * 화면에 보일 상품 대상(docs/36 11-13): 자격 증서를 붙였고 같은 회차에 같은 자격이 한 장뿐인 응모권.
 * 증서·도장·발급 수 확인은 검사기(verifyLedger)가 한다. 여기서는 장부에 실린 응모권만으로 센다
 */
/**
 * 소속 표시 판정. marks(qual-judge의 규칙 패키지 판정)를 주면 그것을 따른다(도장·자격 서명·기간까지 확인).
 * 주지 않으면 증서가 붙었는지와 중복만 본다(장부 기간 정보를 아직 받지 못한 때)
 */
export function prizeEligible(
  tickets: readonly Ticket[],
  marks?: ReadonlyMap<string, QualMark>,
): {
  /** 상품 대상 응모권 id(hex) */
  eligible: Set<string>;
  /** 같은 자격이 두 장 이상이라 빠진 응모권 수 */
  excluded: number;
  /** 자격 증서를 붙인 응모권이 있는지 */
  any: boolean;
} {
  if (marks) {
    const eligible = new Set<string>();
    let excluded = 0;
    for (const [id, m] of marks) {
      if (m.kind === "yes") eligible.add(id);
      else if (m.kind === "dup") excluded++;
    }
    return { eligible, excluded, any: tickets.some((t) => t.qual) };
  }
  const counts = new Map<string, number>();
  const key = (t: Ticket) =>
    t.qual
      ? `${toHex(t.qual.cert.periodId)}:${toHex(t.qual.cert.qualPub)}`
      : "";
  for (const t of tickets)
    if (t.qual) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);
  const eligible = new Set<string>();
  let excluded = 0;
  for (const t of tickets) {
    if (!t.qual) continue;
    if ((counts.get(key(t)) ?? 0) > 1) excluded++;
    else eligible.add(toHex(ticketId(t)));
  }
  return { eligible, excluded, any: counts.size > 0 };
}
