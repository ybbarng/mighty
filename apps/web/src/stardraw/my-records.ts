import {
  drandTime,
  type Rank,
  type RoundRecord,
  rankOf,
  type Schedule,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";

import { countsFor, type EarnedAward, earnedAwards } from "./awards";

/**
 * 「내 기록」(docs/36 11-19 「기념 서류」, 11-23): 공개 장부와 내 공개 열쇠만으로 계산한다.
 * 당첨 내역(1~5등), 관측 수첩의 별 도장(4등), 당첨증(1~3등), 기념 서류(훈장 포함)를 한 번에 만든다.
 * 기념 서류처럼 정식 회차만 센다(단계가 없는 연습 장부는 모두). 추첨을 아직 열어 보지 않은 회차는 빼서
 * 정답이 먼저 새지 않게 한다(spoiler.ts). 등록증에는 아무것도 표시하지 않는다(사용자 2026-10-31)
 */

/** 당첨 한 건(응모권 하나) */
export interface WinEntry {
  round: number;
  rank: Rank;
  ticket: Ticket;
  /** 일련번호(64자) */
  id: string;
  record: RoundRecord;
  /** 그 회차 추첨 시각(초) */
  at: number;
  /** 맞은 내 별(당첨 번호에 든 것, 오름차순) */
  hits: number[];
}

export interface MyRecords {
  /** 모든 당첨(최근 회차부터) */
  wins: WinEntry[];
  /** 등수별 당첨 수 */
  counts: Record<Rank, number>;
  /** 관측 수첩의 별 도장: 4등(오래된 것부터, 수첩은 첫 장부터 찬다) */
  stamps: WinEntry[];
  /** 당첨증: 1~3등(최근부터) */
  certificates: WinEntry[];
  /** 기념 서류(훈장 포함, 받은 차례) */
  awards: EarnedAward[];
}

export interface MyRecordsInput {
  schedule: Schedule;
  closed: readonly { record: RoundRecord; tickets: readonly Ticket[] }[];
  /** 내 우주인 공개 열쇠들 */
  myPubs: readonly Uint8Array[];
  registeredRound: number | null;
  /** 지금(초) */
  now: number;
  sealed?: (round: number) => boolean;
  /** 일련번호 계산(시험이 가짜 응모권으로 바꿔 넣는다) */
  idOf?: (t: Ticket) => string;
}

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function myRecords(input: MyRecordsInput): MyRecords {
  const isMine = (t: Ticket) => input.myPubs.some((p) => same(p, t.pub));
  const idOf = input.idOf ?? ((t: Ticket) => toHex(ticketId(t)));
  const wins: WinEntry[] = [];
  for (const { record, tickets } of input.closed) {
    if (record.void || !countsFor(input.schedule, record.round)) continue;
    if (input.sealed?.(record.round)) continue;
    for (const ticket of tickets) {
      if (!isMine(ticket)) continue;
      const rank = rankOf(record, ticket.numbers);
      if (rank === null) continue;
      wins.push({
        round: record.round,
        rank,
        ticket,
        id: idOf(ticket),
        record,
        at: drandTime(record.drandRound),
        hits: [...ticket.numbers]
          .filter((n) => record.numbers.includes(n))
          .sort((a, b) => a - b),
      });
    }
  }
  wins.sort((a, b) => b.round - a.round || a.rank - b.rank);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<Rank, number>;
  for (const w of wins) counts[w.rank]++;
  const tickets = new Map(
    input.closed.map((c) => [c.record.round, c.tickets] as const),
  );
  const awards = earnedAwards({
    schedule: input.schedule,
    records: input.closed.map((c) => c.record),
    tickets,
    myPubs: input.myPubs,
    registeredRound: input.registeredRound,
    now: input.now,
    ...(input.sealed ? { sealed: input.sealed } : {}),
  });
  return {
    wins,
    counts,
    stamps: wins.filter((w) => w.rank === 4).reverse(),
    certificates: wins.filter((w) => w.rank <= 3),
    awards,
  };
}

/**
 * 처음 받은 순간 알림에 쓰는 표시: 기념 서류와 당첨증. 별 도장(4등)은 자주 나와 알리지 않는다.
 * 지갑에 "본 것"으로 남긴 표시와 비교해 새로 생긴 것만 알린다
 */
export function recordKeys(r: MyRecords): string[] {
  return [
    ...r.awards.map((a) => `a:${a.id}:${a.step ?? ""}`),
    ...r.certificates.map((c) => `c:${c.id}`),
  ];
}

const GRADE_ORDER = { star: 0, gold: 1, silver: 2, bronze: 3 } as const;

/**
 * 건네받는 연출에서 보여 줄 하나: 새로 받은 것 가운데 훈장 → 당첨증 → 등급이 높은 서류 → 최근 것 차례.
 * 여러 개를 받아도 하나만 건네고 나머지는 「내 기록」에서 본다(연출이 길어지지 않게)
 */
export function newestRecord(
  r: MyRecords,
  fresh: readonly string[],
): { award: EarnedAward | null; win: WinEntry | null } {
  const isNew = new Set(fresh);
  const awards = r.awards
    .filter((a) => isNew.has(`a:${a.id}:${a.step ?? ""}`))
    .sort(
      (a, b) =>
        Number(b.form === "medal") - Number(a.form === "medal") ||
        GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
        b.at - a.at,
    );
  const medal = awards.find((a) => a.form === "medal");
  if (medal) return { award: medal, win: null };
  const cert = r.certificates.find((c) => isNew.has(`c:${c.id}`));
  if (cert) return { award: null, win: cert };
  return { award: awards[0] ?? null, win: null };
}
