import { ByteReader, ByteWriter, taggedHash } from "./bytes";
import { RANKS, type Rank } from "./draw";
import { type Nickname, readNickname, writeNickname } from "./nickname";
import type { Schedule, ScheduleEntry } from "./schedule";
import { PICK_COUNT } from "./ticket";

/**
 * 회차 기록(docs/36 4절). 기록 해시가 다음 회차의 `prev`이자 작업 증명 문제 값이다.
 * 1회차의 prev는 처음 일정표로 만든 genesis 해시라, 처음 일정표도 체인에 묶인다.
 *
 * 고정 바이너리 형식:
 *   v(u8) ‖ round(u32) ‖ prev(32) ‖ count(u32) ‖ merkleRoot(32)
 *   ‖ registrationCount(u32) ‖ registrationRoot(32) ‖ rootLoggedAt(u64)
 *   ‖ void(u8) ‖ drandRound(u64) ‖ drandSig(bytes) ‖ numbers(6) ‖ bonus(u8)
 *   ‖ 등수 1~5마다 [개수(u32) ‖ 응모권 id(32) × 개수]
 *   ‖ 일정 변경 [개수(u16) ‖ (fromRound, length, closeMargin, powTarget, registerPowTarget 각 u32) × 개수]
 *   ‖ 별명 [개수(u16) ‖ (round u32 ‖ 응모권 id(32) ‖ 별명(text) ‖ 서명) × 개수]
 * 무효 회차는 numbers 0 6개, bonus 0, 당첨 없음, drandSig 빈 바이트다.
 */

export const RECORD_VERSION = 1;

export interface RoundRecord {
  v: number;
  round: number;
  prev: Uint8Array;
  count: number;
  merkleRoot: Uint8Array;
  /** 이 회차에 들어간 열쇠 등록 수와 등록 id 머클 루트(registration.ts) */
  registrationCount: number;
  registrationRoot: Uint8Array;
  /** 머클 루트가 투명성 로그(Rekor)에 들어간 시각. 0이면 올리지 못함 */
  rootLoggedAt: number;
  /** 루트가 drand보다 늦게 기록돼 당첨 없이 끝난 회차(docs/36 11-1) */
  void: boolean;
  drandRound: number;
  /** 무효 회차는 빈 바이트 */
  drandSignature: Uint8Array;
  /** 무효 회차는 [] */
  numbers: number[];
  /** 무효 회차는 0 */
  bonus: number;
  /** 등수별 당첨 응모권 id(사전 순) */
  winners: Record<Rank, Uint8Array[]>;
  /** 이 회차에 정한 일정 변경(24시간 뒤 효력) */
  scheduleChanges: ScheduleEntry[];
  /** 이 회차까지 사이에 당첨자가 남긴 별명(지난 회차 당첨 응모권, nickname.ts) */
  nicknames: Nickname[];
}

export function emptyWinners(): Record<Rank, Uint8Array[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [] };
}

export function genesisHash(schedule: Schedule): Uint8Array {
  const w = new ByteWriter().u64(schedule.epoch).u16(schedule.entries.length);
  for (const e of schedule.entries) writeEntry(w, e);
  return taggedHash("stardraw/genesis/v1", w.done());
}

function writeEntry(w: ByteWriter, e: ScheduleEntry): void {
  w.u32(e.fromRound)
    .u32(e.length)
    .u32(e.closeMargin)
    .u32(e.powTarget)
    .u32(e.registerPowTarget);
}

function writeIds(w: ByteWriter, ids: readonly Uint8Array[]): void {
  w.u32(ids.length);
  for (const id of ids) w.fixed(id, 32);
}

export function encodeRecord(r: RoundRecord): Uint8Array {
  const w = new ByteWriter()
    .u8(r.v)
    .u32(r.round)
    .fixed(r.prev, 32)
    .u32(r.count)
    .fixed(r.merkleRoot, 32)
    .u32(r.registrationCount)
    .fixed(r.registrationRoot, 32)
    .u64(r.rootLoggedAt)
    .u8(r.void ? 1 : 0)
    .u64(r.drandRound)
    .bytes(r.drandSignature);
  const numbers = r.void ? new Array<number>(PICK_COUNT).fill(0) : r.numbers;
  w.fixed(Uint8Array.from(numbers), PICK_COUNT).u8(r.void ? 0 : r.bonus);
  for (const rank of RANKS) writeIds(w, r.winners[rank]);
  w.u16(r.scheduleChanges.length);
  for (const e of r.scheduleChanges) writeEntry(w, e);
  w.u16(r.nicknames.length);
  for (const n of r.nicknames) writeNickname(w, n);
  return w.done();
}

function readIds(r: ByteReader): Uint8Array[] {
  const n = r.u32();
  const ids: Uint8Array[] = [];
  for (let i = 0; i < n; i++) ids.push(r.fixed(32));
  return ids;
}

export function decodeRecord(bytes: Uint8Array): RoundRecord {
  const r = new ByteReader(bytes);
  const v = r.u8();
  if (v !== RECORD_VERSION) throw new Error(`모르는 기록 판: ${v}`);
  const round = r.u32();
  const prev = r.fixed(32);
  const count = r.u32();
  const merkleRoot = r.fixed(32);
  const registrationCount = r.u32();
  const registrationRoot = r.fixed(32);
  const rootLoggedAt = r.u64();
  const isVoid = r.u8() === 1;
  const drandRound = r.u64();
  const drandSignature = r.bytes();
  const rawNumbers = Array.from(r.fixed(PICK_COUNT));
  const bonus = r.u8();
  const winners = emptyWinners();
  for (const rank of RANKS) winners[rank] = readIds(r);
  const changes: ScheduleEntry[] = [];
  const changeCount = r.u16();
  for (let i = 0; i < changeCount; i++) {
    changes.push({
      fromRound: r.u32(),
      length: r.u32(),
      closeMargin: r.u32(),
      powTarget: r.u32(),
      registerPowTarget: r.u32(),
    });
  }
  const nicknames: Nickname[] = [];
  const nicknameCount = r.u16();
  for (let i = 0; i < nicknameCount; i++) nicknames.push(readNickname(r));
  r.end();
  return {
    v,
    round,
    prev,
    count,
    merkleRoot,
    registrationCount,
    registrationRoot,
    rootLoggedAt,
    void: isVoid,
    drandRound,
    drandSignature,
    numbers: isVoid ? [] : rawNumbers,
    bonus,
    winners,
    scheduleChanges: changes,
    nicknames,
  };
}

export function recordHash(r: RoundRecord): Uint8Array {
  return taggedHash("stardraw/record/v1", encodeRecord(r));
}
