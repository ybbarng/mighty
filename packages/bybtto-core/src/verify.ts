import {
  ByteWriter,
  compareBytes,
  equalBytes,
  taggedHash,
  toHex,
} from "./bytes";
import {
  type BeaconVerifier,
  drandRandomness,
  drandRoundForClose,
  verifyQuicknetBeacon,
} from "./drand";
import { drawNumbers, drawSeed, RANKS, rankOf } from "./draw";
import { entrantId } from "./keys";
import { inclusionProof, merkleRoot, verifyInclusion } from "./merkle";
import { checkPow, POW_PARAMS, type PowParams } from "./pow";
import {
  genesisHash,
  RECORD_VERSION,
  type RoundRecord,
  recordHash,
} from "./record";
import { isVoidRound } from "./round";
import {
  checkSchedule,
  checkScheduleChange,
  roundTimes,
  type Schedule,
  withChange,
} from "./schedule";
import type { WebAuthnPolicy } from "./signature";
import {
  TICKET_VERSION,
  type Ticket,
  ticketContent,
  ticketId,
  verifyTicketSignature,
} from "./ticket";

/**
 * 장부 검사(docs/36 7절). 누구든 처음 일정표와 회차 기록, 회차별 응모권 목록만으로
 * 처음부터 다시 계산한다. 서버를 믿지 않는다.
 *
 * 작업 증명은 Argon2라 비싸서, 내 응모권과 당첨 응모권은 전부, 나머지는 회차마다
 * 공개 seed로 고른 몇 장만 검사한다(8-1 P2). 전부 검사하려면 powSample을 Infinity로.
 */

export interface VerifyOptions {
  beaconVerifier?: BeaconVerifier;
  powParams?: PowParams;
  /** 회차마다 작업 증명을 검사할 표본 수(내 것·당첨 제외). 기본 8 */
  powSample?: number;
  /** 늘 전부 검사할 내 응모권 id */
  mine?: readonly Uint8Array[];
  /**
   * 머클 루트가 그 시각(rootLoggedAt)에 투명성 로그에 들어갔는지 확인.
   * TODO: Rekor 포함 증명 확인(서버를 만들 때). 없으면 확인하지 않고 skipped에 남긴다.
   */
  rootLogVerifier?: (record: RoundRecord) => Promise<boolean>;
  /** 패스키 서명을 받을 사이트·주소. 기본은 game.byb.kr */
  webauthnPolicy?: WebAuthnPolicy;
}

export interface Problem {
  round: number;
  message: string;
}

export interface VerifyReport {
  problems: Problem[];
  /** 확인하지 않은 항목(확인 수단이 없거나 표본 밖) */
  skipped: string[];
  /** 마지막 기록 해시(다음 회차의 문제 값) */
  head: Uint8Array;
  /** 모든 변경을 반영한 일정표 */
  schedule: Schedule;
  /** 작업 증명을 실제로 검사한 응모권 수 */
  powChecked: number;
}

export async function verifyLedger(
  genesis: Schedule,
  records: readonly RoundRecord[],
  ticketsByRound: readonly (readonly Ticket[])[],
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  const problems: Problem[] = [];
  const skipped: string[] = [];
  const scheduleProblem = checkSchedule(genesis);
  if (scheduleProblem) {
    return {
      problems: [{ round: 0, message: `처음 일정표: ${scheduleProblem}` }],
      skipped,
      head: new Uint8Array(32),
      schedule: genesis,
      powChecked: 0,
    };
  }
  const beaconVerifier = options.beaconVerifier ?? verifyQuicknetBeacon;
  const mine = new Set((options.mine ?? []).map(toHex));
  let schedule = genesis;
  let head = genesisHash(genesis);
  let powChecked = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i] as RoundRecord;
    const tickets = ticketsByRound[i] ?? [];
    const round = i + 1;
    const fail = (message: string) => problems.push({ round, message });

    if (record.v !== RECORD_VERSION) fail(`모르는 기록 판 ${record.v}`);
    if (record.round !== round)
      fail(`회차 번호가 ${round}여야 하는데 ${record.round}다`);
    if (!equalBytes(record.prev, head))
      fail("앞 기록 해시와 이어지지 않는다(장부가 바뀌었다)");

    // 1. 응모권: 판, 회차, 정렬, 서명, 1인 1장
    const ids = tickets.map(ticketId);
    const entrants = new Set<string>();
    for (let k = 0; k < tickets.length; k++) {
      const t = tickets[k] as Ticket;
      const id = ids[k] as Uint8Array;
      if (t.v !== TICKET_VERSION) fail(`응모권 ${short(id)}: 모르는 판`);
      if (t.round !== round)
        fail(`응모권 ${short(id)}: 다른 회차(${t.round})의 응모권`);
      if (k > 0 && compareBytes(ids[k - 1] as Uint8Array, id) >= 0) {
        fail("응모권 목록이 id 순서가 아니거나 같은 응모권이 두 번 있다");
      }
      const who = toHex(entrantId(t.pub));
      if (entrants.has(who))
        fail(`응모권 ${short(id)}: 같은 열쇠가 이 회차에 두 장 냈다`);
      entrants.add(who);
      if (!(await verifyTicketSignature(t, options.webauthnPolicy)))
        fail(`응모권 ${short(id)}: 서명이 맞지 않는다`);
    }

    // 2. 응모 수와 머클 루트
    if (record.count !== tickets.length)
      fail(`응모 수가 ${tickets.length}인데 기록은 ${record.count}`);
    if (!equalBytes(record.merkleRoot, merkleRoot(ids)))
      fail("응모권 목록으로 만든 머클 루트가 기록과 다르다");

    // 3. drand 회차, 무효 규칙, 서명, 당첨 번호, 등수
    const { closesAt, entry } = roundTimes(schedule, round);
    if (record.drandRound !== drandRoundForClose(closesAt))
      fail("정해진 drand 회차가 아니다");
    const shouldBeVoid = isVoidRound(closesAt, record.rootLoggedAt);
    if (record.void !== shouldBeVoid) {
      fail(
        shouldBeVoid
          ? "루트 기록 시각으로는 무효 회차인데 추첨했다"
          : "무효가 아닌데 무효로 처리했다",
      );
    }
    if (options.rootLogVerifier) {
      if (!(await options.rootLogVerifier(record)))
        fail("머클 루트의 투명성 로그 기록을 확인할 수 없다");
    } else {
      skipped.push(`${round}회차: 머클 루트 로그 시각(확인 수단 없음)`);
    }

    let sampleSeed = taggedHash("bybtto/sample/v1", record.merkleRoot, head);
    if (!record.void) {
      const beacon = {
        round: record.drandRound,
        signature: record.drandSignature,
      };
      if (!beaconVerifier(beacon)) fail("drand 서명이 맞지 않는다");
      const randomness = drandRandomness(beacon);
      sampleSeed = taggedHash("bybtto/sample/v1", randomness);
      const draw = drawNumbers(drawSeed(round, randomness));
      if (
        draw.numbers.join() !== record.numbers.join() ||
        draw.bonus !== record.bonus
      ) {
        fail(
          `당첨 번호가 규칙대로가 아니다(규칙: ${draw.numbers.join(",")} + ${draw.bonus})`,
        );
      }
      for (const rank of RANKS) {
        const expected = tickets.flatMap((t, k) =>
          rankOf(draw, t.numbers) === rank ? [ids[k] as Uint8Array] : [],
        );
        if (!sameIds(expected, record.winners[rank]))
          fail(`${rank}등 당첨자 목록이 규칙대로가 아니다`);
      }
    } else if (RANKS.some((rank) => record.winners[rank].length > 0)) {
      fail("무효 회차에 당첨자가 있다");
    }

    // 4. 작업 증명: 내 것·당첨은 전부, 나머지는 표본
    const always = new Set(mine);
    for (const rank of RANKS)
      for (const id of record.winners[rank]) always.add(toHex(id));
    const sample = pickSample(
      sampleSeed,
      tickets.length,
      options.powSample ?? 8,
    );
    for (let k = 0; k < tickets.length; k++) {
      const id = ids[k] as Uint8Array;
      if (!always.has(toHex(id)) && !sample.has(k)) continue;
      const t = tickets[k] as Ticket;
      powChecked++;
      const ok = await checkPow(
        record.prev,
        ticketContent(t),
        t.nonce,
        entry.powTarget,
        options.powParams ?? POW_PARAMS,
      );
      if (!ok) fail(`응모권 ${short(id)}: 작업 증명이 맞지 않는다`);
    }
    const unchecked =
      tickets.length -
      ids.filter((id, k) => always.has(toHex(id)) || sample.has(k)).length;
    if (unchecked > 0)
      skipped.push(`${round}회차: 작업 증명 ${unchecked}장(표본 밖)`);

    // 5. 일정 변경
    for (const change of record.scheduleChanges) {
      const problem = checkScheduleChange(schedule, change, round);
      if (problem) fail(`일정 변경: ${problem}`);
      else schedule = withChange(schedule, change);
    }

    head = recordHash(record);
  }

  return { problems, skipped, head, schedule, powChecked };
}

/** 공개 seed로 n장 중 k장을 고른다(검사기마다 같은 표본) */
export function pickSample(
  seed: Uint8Array,
  n: number,
  k: number,
): Set<number> {
  const picked = new Set<number>();
  if (k >= n) {
    for (let i = 0; i < n; i++) picked.add(i);
    return picked;
  }
  for (let j = 0; picked.size < k; j++) {
    const h = taggedHash(
      "bybtto/sample-pick/v1",
      seed,
      new ByteWriter().u32(j).done(),
    );
    picked.add(new DataView(h.buffer, h.byteOffset, 4).getUint32(0) % n);
  }
  return picked;
}

/** 내 응모권이 그 회차 목록(머클 루트)에 들어 있는지 증명 만들기 */
export function proveMembership(
  tickets: readonly Ticket[],
  mineId: Uint8Array,
) {
  const ids = tickets.map(ticketId);
  const index = ids.findIndex((id) => equalBytes(id, mineId));
  if (index < 0) return null;
  return { index, size: ids.length, proof: inclusionProof(ids, index) };
}

export function verifyMembership(
  mineId: Uint8Array,
  membership: { index: number; size: number; proof: Uint8Array[] },
  root: Uint8Array,
): boolean {
  return verifyInclusion(
    mineId,
    membership.index,
    membership.size,
    membership.proof,
    root,
  );
}

function sameIds(a: readonly Uint8Array[], b: readonly Uint8Array[]): boolean {
  return (
    a.length === b.length &&
    a.every((id, i) => equalBytes(id, b[i] as Uint8Array))
  );
}

function short(id: Uint8Array): string {
  return toHex(id).slice(0, 12);
}
