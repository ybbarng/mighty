import { compareBytes } from "./bytes";
import {
  type DrandBeacon,
  drandRandomness,
  drandRoundForClose,
  drandTime,
} from "./drand";
import { drawNumbers, drawSeed, rankOf } from "./draw";
import { merkleRoot } from "./merkle";
import { emptyWinners, RECORD_VERSION, type RoundRecord } from "./record";
import { roundTimes, type Schedule, type ScheduleEntry } from "./schedule";
import { type Ticket, ticketId } from "./ticket";

/**
 * 회차 닫기: 서버(그리고 화면의 기기 안 가짜 서버)가 쓰는 계산.
 * 검사기(verify.ts)는 같은 계산을 다시 해서 기록과 맞춰 본다.
 */

/** 응모권을 id 사전 순으로 정렬한다. 장부의 응모권 목록과 머클 잎이 이 순서다 */
export function sortTickets(tickets: readonly Ticket[]): Ticket[] {
  return tickets
    .map((t) => ({ t, id: ticketId(t) }))
    .sort((a, b) => compareBytes(a.id, b.id))
    .map(({ t }) => t);
}

/** 마감 직후 공개하는 머클 루트 */
export function sealRoot(tickets: readonly Ticket[]): Uint8Array {
  return merkleRoot(sortTickets(tickets).map(ticketId));
}

/**
 * 무효 회차: 루트가 로그에 들어가지 못했거나(0), drand 값이 나온 뒤에 들어갔다.
 * 마감 전에 들어간 시각도 말이 안 되므로 무효다.
 */
export function isVoidRound(closesAt: number, rootLoggedAt: number): boolean {
  if (rootLoggedAt === 0 || rootLoggedAt < closesAt) return true;
  return rootLoggedAt >= drandTime(drandRoundForClose(closesAt));
}

export interface CloseRoundInput {
  schedule: Schedule;
  round: number;
  prev: Uint8Array;
  tickets: readonly Ticket[];
  rootLoggedAt: number;
  /** 정해진 drand 회차의 값. 무효 회차면 없어도 된다 */
  beacon: DrandBeacon | null;
  scheduleChanges?: ScheduleEntry[];
  paid?: Uint8Array[];
}

export function closeRound(input: CloseRoundInput): RoundRecord {
  const { closesAt } = roundTimes(input.schedule, input.round);
  const sorted = sortTickets(input.tickets);
  const ids = sorted.map(ticketId);
  const drandRound = drandRoundForClose(closesAt);
  const base = {
    v: RECORD_VERSION,
    round: input.round,
    prev: input.prev,
    count: sorted.length,
    merkleRoot: merkleRoot(ids),
    rootLoggedAt: input.rootLoggedAt,
    drandRound,
    scheduleChanges: input.scheduleChanges ?? [],
    paid: [...(input.paid ?? [])].sort(compareBytes),
  };
  if (isVoidRound(closesAt, input.rootLoggedAt)) {
    return {
      ...base,
      void: true,
      drandSignature: new Uint8Array(),
      numbers: [],
      bonus: 0,
      winners: emptyWinners(),
    };
  }
  const beacon = input.beacon;
  if (!beacon || beacon.round !== drandRound) {
    throw new Error(`drand ${drandRound}회차 값이 있어야 한다`);
  }
  const draw = drawNumbers(drawSeed(input.round, drandRandomness(beacon)));
  const winners = emptyWinners();
  sorted.forEach((t, i) => {
    const rank = rankOf(draw, t.numbers);
    if (rank) winners[rank].push(ids[i] as Uint8Array);
  });
  return {
    ...base,
    void: false,
    drandSignature: beacon.signature,
    numbers: draw.numbers,
    bonus: draw.bonus,
    winners,
  };
}
