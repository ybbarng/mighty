import { equalBytes, toHex } from "./bytes";
import { RANKS, type Rank } from "./draw";
import type { AffiliationState, OpsState, QualPeriodState } from "./operations";
import { qualVerify, verifyStamps } from "./qualification";
import { emptyWinners } from "./record";
import { TICKET_VERSION_QUAL, type Ticket, ticketQualMessage } from "./ticket";

/**
 * 상품 대상 판정(docs/36 11-13 ②). 문제 문장은 "상품 자격:"으로 시작한다(검사 항목 「소속과 상품 자격」). 검사기·서버·화면이 같은 함수를 쓴다. 장부만으로 계산한다(서버 판단 없음).
 * - 증서가 진짜: 효력이 생긴 기간, 끝나지 않은 소속, 회차 마감이 기간 안, 도장, 자격 서명
 * - 한 회차 한 자격 한 장: 같은 자격 공개 열쇠가 둘 이상이면 그 응모권 모두 상품 대상에서 빠진다(등수는 그대로)
 * - 쓰인 자격 수 ≤ 발급 수: verifyLedger가 회차마다 센다(`countUsed`)
 */

export interface QualRoundResult {
  round: number;
  /** 기간 id(hex) */
  period: string;
  periodNumber: number;
  /** 소속 id(hex) */
  affiliation: string;
  affiliationName: string;
  /** 상품 대상 응모권 id */
  eligible: Uint8Array[];
  /** 같은 자격이 두 장 이상이라 빠진 응모권 수 */
  excluded: number;
  /** 등수별 상품 대상 당첨 응모권 id */
  winners: Record<Rank, Uint8Array[]>;
}

/** 이 회차에 응모권에 붙일 수 있는 자격 기간과 그 소속 */
export function periodsForRound(
  state: OpsState,
  round: number,
  closesAt: number,
): { period: QualPeriodState; affiliation: AffiliationState }[] {
  return state.periods.flatMap((period) => {
    if (period.from > round) return [];
    if (closesAt < period.startsAt || closesAt >= period.endsAt) return [];
    const affiliation = state.affiliations.find((a) =>
      equalBytes(a.id, period.affiliation),
    );
    if (!affiliation || affiliation.from > round) return [];
    if (affiliation.until !== null && affiliation.until <= round) return [];
    return [{ period, affiliation }];
  });
}

/** 응모권 한 장의 증서가 이 회차에 쓸 수 있는지(도장은 따로 묶어 확인). 문제가 없으면 null */
export function checkTicketQualification(
  state: OpsState,
  ticket: Ticket,
  closesAt: number,
): string | null {
  if (ticket.v !== TICKET_VERSION_QUAL || !ticket.qual) return null;
  const open = periodsForRound(state, ticket.round, closesAt).find(
    ({ period }) =>
      equalBytes(period.id, ticket.qual?.cert.periodId ?? new Uint8Array()),
  );
  if (!open) return "이 회차에 쓸 수 있는 자격 기간이 아니다";
  if (
    !qualVerify(
      ticket.qual.cert.qualPub,
      ticketQualMessage(ticket),
      ticket.qual.sig,
    )
  )
    return "자격 서명이 맞지 않는다";
  return null;
}

/**
 * 회차 하나의 상품 대상. tickets·ids는 장부 순서, winners는 그 회차 기록의 당첨자.
 * 증서에 문제가 있는 응모권은 problems에 남기고 상품 대상에서 뺀다
 */
export function judgeRound(
  state: OpsState,
  round: number,
  closesAt: number,
  tickets: readonly Ticket[],
  ids: readonly Uint8Array[],
  winners: Record<Rank, Uint8Array[]>,
): { problems: string[]; results: QualRoundResult[] } {
  const problems: string[] = [];
  const open = periodsForRound(state, round, closesAt);
  const byPeriod = new Map<string, { index: number; qualPub: string }[]>();
  for (let k = 0; k < tickets.length; k++) {
    const t = tickets[k] as Ticket;
    if (t.v !== TICKET_VERSION_QUAL || !t.qual) continue;
    const label = `상품 자격: 응모권 ${toHex(ids[k] as Uint8Array).slice(0, 12)}`;
    const problem = checkTicketQualification(state, t, closesAt);
    if (problem) {
      problems.push(`${label}: ${problem}`);
      continue;
    }
    const key = toHex(t.qual.cert.periodId);
    const list = byPeriod.get(key) ?? [];
    list.push({ index: k, qualPub: toHex(t.qual.cert.qualPub) });
    byPeriod.set(key, list);
  }
  const results: QualRoundResult[] = [];
  for (const { period, affiliation } of open) {
    const key = toHex(period.id);
    const list = byPeriod.get(key) ?? [];
    // 도장: 같은 기간 열쇠라 묶어 확인한다. 틀리면 한 장씩 보고 틀린 것만 뺀다
    let valid = list;
    const items = list.map(({ index }) => {
      const cert = (tickets[index] as Ticket).qual?.cert;
      if (!cert) throw new Error("자격 증서가 없다");
      return cert;
    });
    if (!verifyStamps(period.issuerKey, items)) {
      valid = list.filter((_, i) =>
        verifyStamps(period.issuerKey, [items[i] as (typeof items)[number]]),
      );
      for (const entry of list)
        if (!valid.includes(entry))
          problems.push(
            `상품 자격: 응모권 ${toHex(ids[entry.index] as Uint8Array).slice(0, 12)}: 도장이 기간 열쇠로 확인되지 않는다`,
          );
    }
    const counts = new Map<string, number>();
    for (const { qualPub } of valid)
      counts.set(qualPub, (counts.get(qualPub) ?? 0) + 1);
    const eligible: Uint8Array[] = [];
    let excluded = 0;
    for (const { index, qualPub } of valid) {
      if ((counts.get(qualPub) ?? 0) > 1) excluded++;
      else eligible.push(ids[index] as Uint8Array);
    }
    const prizeWinners = emptyWinners();
    for (const rank of RANKS)
      prizeWinners[rank] = winners[rank].filter((id) =>
        eligible.some((e) => equalBytes(e, id)),
      );
    results.push({
      round,
      period: key,
      periodNumber: period.number,
      affiliation: toHex(affiliation.id),
      affiliationName: affiliation.fields.name,
      eligible,
      excluded,
      winners: prizeWinners,
    });
  }
  return { problems, results };
}

/** 기간마다 응모권에 쓰인 서로 다른 자격 번호(hex)를 모은다 */
export function countUsed(
  used: Map<string, Set<string>>,
  tickets: readonly Ticket[],
): void {
  for (const t of tickets) {
    if (!t.qual) continue;
    const key = toHex(t.qual.cert.periodId);
    const set = used.get(key) ?? new Set<string>();
    set.add(toHex(t.qual.cert.qualPub));
    used.set(key, set);
  }
}
