import { ByteWriter, compareBytes, taggedHash } from "./bytes";
import {
  type DrandBeacon,
  drandRandomness,
  drandRoundForClose,
  drandTime,
} from "./drand";
import { drawNumbers, drawSeed, rankOf } from "./draw";
import { merkleRoot } from "./merkle";
import { type Nickname, sortNicknames } from "./nickname";
import { emptyWinners, RECORD_VERSION, type RoundRecord } from "./record";
import {
  type KeyRegistration,
  registrationId,
  sortRegistrations,
} from "./registration";
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

/** 응모권 목록의 머클 루트 */
export function sealRoot(tickets: readonly Ticket[]): Uint8Array {
  return merkleRoot(sortTickets(tickets).map(ticketId));
}

/** 열쇠 등록 목록의 머클 루트 */
export function registrationRoot(
  registrations: readonly KeyRegistration[],
): Uint8Array {
  return merkleRoot(sortRegistrations(registrations).map(registrationId));
}

/**
 * 마감 직후 투명성 로그(Rekor)에 올리는 봉인 값. 응모권 목록과 열쇠 등록 목록을 함께 묶는다.
 * 등록도 drand 전에 고정돼야, 결과를 본 뒤 당첨 응모권의 등록을 빼서 무효로 만들 수 없다.
 * taggedHash("bybtto/seal/v1", round(u32) ‖ count(u32) ‖ merkleRoot ‖ registrationCount(u32) ‖ registrationRoot)
 */
export function sealDigest(
  r: Pick<
    RoundRecord,
    "round" | "count" | "merkleRoot" | "registrationCount" | "registrationRoot"
  >,
): Uint8Array {
  return taggedHash(
    "bybtto/seal/v1",
    new ByteWriter()
      .u32(r.round)
      .u32(r.count)
      .fixed(r.merkleRoot, 32)
      .u32(r.registrationCount)
      .fixed(r.registrationRoot, 32)
      .done(),
  );
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
  /** 이 회차에 들어간 열쇠 등록 */
  registrations?: readonly KeyRegistration[];
  rootLoggedAt: number;
  /** 정해진 drand 회차의 값. 무효 회차면 없어도 된다 */
  beacon: DrandBeacon | null;
  scheduleChanges?: ScheduleEntry[];
  /** 지난 회차 당첨자가 낸 별명 */
  nicknames?: readonly Nickname[];
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
    registrationCount: input.registrations?.length ?? 0,
    registrationRoot: registrationRoot(input.registrations ?? []),
    rootLoggedAt: input.rootLoggedAt,
    drandRound,
    scheduleChanges: input.scheduleChanges ?? [],
    nicknames: sortNicknames(input.nicknames ?? []),
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
