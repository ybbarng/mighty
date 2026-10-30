import type { ByteReader, ByteWriter } from "./bytes";
import { DRAND_DELAY } from "./drand";

/**
 * 일정표: 회차 시각은 이것만으로 계산된다(docs/36 11-1).
 * 회차 id는 차례 번호(1, 2, 3, …)라 회차 길이가 바뀌어도 이어진다.
 * 모든 시각은 유닉스 초다.
 */

export interface ScheduleEntry {
  /** 이 회차부터 적용 */
  fromRound: number;
  /** 회차 길이(초) */
  length: number;
  /** 마감 여유(초). 화면은 closesAt - closeMargin부터 응모를 막는다 */
  closeMargin: number;
  /** 작업 증명 목표값(argon 결과 앞 4바이트가 이것보다 작아야 한다, pow.ts) */
  powTarget: number;
  /** 새 열쇠 등록의 작업 증명 목표값(응모권보다 훨씬 무겁게, docs/36 5절) */
  registerPowTarget: number;
  /**
   * 운영 단계(docs/36 11-6). 서버 장부는 시험 단계로 시작해 일정 바꾸기 한 줄로 정식 단계에 들어가고,
   * 사슬은 끝까지 하나다. 단계가 없는 일정표(기기 안 연습 장부)는 모든 줄에 없다
   */
  phase?: Phase;
}

export type Phase = "trial" | "live";

export interface Schedule {
  /** 1회차가 열리는 시각 */
  epoch: number;
  /** fromRound 오름차순, 첫 줄은 fromRound 1 */
  entries: ScheduleEntry[];
}

/** 회차 k가 정해지려면 앞 회차 기록(drand 뒤)이 있어야 해서 회차는 10분보다 짧을 수 없다 */
export const MIN_ROUND_LENGTH = 600;
/**
 * 예고 회차 수(일정 변경·운영 기록). 회차 k 기록에 실린 것은 k+1(이미 응모받는 중)·k+2·k+3 동안 장부에
 * 보인 뒤 k+4부터 효력이 생긴다. 2026-10-31 전에는 "마감 + 24시간"이었고, 그때 실린 기록은 모두
 * 이 규칙보다 늦게 효력이 생기므로 이 규칙으로 검사해도 통과한다(docs/36 11-1)
 */
export const NOTICE_ROUNDS = 3;

/** 회차 decidedInRound 기록에 실리는 일정 변경·운영 기록의 가장 이른 효력 회차 */
export function earliestNoticeRound(decidedInRound: number): number {
  return decidedInRound + NOTICE_ROUNDS + 1;
}

export interface RoundTimes {
  round: number;
  opensAt: number;
  closesAt: number;
  /** 화면이 응모를 막는 시각 */
  entryDeadline: number;
  entry: ScheduleEntry;
}

export function checkScheduleEntry(entry: ScheduleEntry): string | null {
  const { fromRound, length, closeMargin, powTarget, registerPowTarget } =
    entry;
  if (!Number.isInteger(fromRound) || fromRound < 1)
    return "fromRound는 1 이상 정수";
  if (!Number.isInteger(length) || length < MIN_ROUND_LENGTH) {
    return `회차 길이는 ${MIN_ROUND_LENGTH}초 이상 정수`;
  }
  if (
    !Number.isInteger(closeMargin) ||
    closeMargin < 0 ||
    closeMargin >= length
  ) {
    return "마감 여유는 0 이상, 회차 길이보다 작은 정수";
  }
  if (!Number.isInteger(powTarget) || powTarget < 1 || powTarget > 0xffffffff) {
    return "작업 증명 목표값은 1~2^32-1 정수";
  }
  if (
    !Number.isInteger(registerPowTarget) ||
    registerPowTarget < 1 ||
    registerPowTarget > 0xffffffff
  ) {
    return "등록 작업 증명 목표값은 1~2^32-1 정수";
  }
  if (
    entry.phase !== undefined &&
    entry.phase !== "trial" &&
    entry.phase !== "live"
  )
    return "단계는 trial이거나 live";
  return null;
}

/** 줄을 하나 더 붙여도 단계 규칙에 맞는지: 단계는 모든 줄에 있거나 모두 없고, 정식 뒤로 시험은 없다 */
function checkPhaseAfter(
  prev: ScheduleEntry | undefined,
  next: ScheduleEntry,
): string | null {
  if (!prev) return null;
  if ((prev.phase === undefined) !== (next.phase === undefined))
    return "단계는 모든 줄에 있거나 모두 없어야 한다";
  if (prev.phase === "live" && next.phase === "trial")
    return "정식 단계 뒤로 시험 단계를 둘 수 없다(장부는 다시 시작하지 않는다)";
  return null;
}

export function checkSchedule(schedule: Schedule): string | null {
  if (!Number.isInteger(schedule.epoch) || schedule.epoch < 0)
    return "epoch는 0 이상 정수";
  const first = schedule.entries[0];
  if (first?.fromRound !== 1) return "첫 줄은 1회차부터";
  let prev: ScheduleEntry | undefined;
  for (const entry of schedule.entries) {
    const problem = checkScheduleEntry(entry) ?? checkPhaseAfter(prev, entry);
    if (problem) return problem;
    if (prev && entry.fromRound <= prev.fromRound)
      return "fromRound는 늘어나야 한다";
    prev = entry;
  }
  return null;
}

/** 회차 k의 시각 */
export function roundTimes(schedule: Schedule, round: number): RoundTimes {
  if (!Number.isInteger(round) || round < 1)
    throw new Error(`회차 번호가 아니다: ${round}`);
  let opensAt = schedule.epoch;
  const entries = schedule.entries;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as ScheduleEntry;
    const next = entries[i + 1];
    const until = next ? Math.min(next.fromRound, round) : round;
    opensAt += (until - entry.fromRound) * entry.length;
    if (!next || round < next.fromRound) {
      const closesAt = opensAt + entry.length;
      return {
        round,
        opensAt,
        closesAt,
        entryDeadline: closesAt - entry.closeMargin,
        entry,
      };
    }
  }
  throw new Error("일정표가 비어 있다");
}

/**
 * 추첨이 회차 길이의 배수 시각에 오게 맞춘 일정인지(docs/36 3절).
 * 마감은 추첨 5분 전이라 1시간 회차는 "매시 정각 추첨 · 55분 마감", 10분 회차는 x:05 마감 · x:10 추첨이 된다
 */
export function isAlignedEpoch(epoch: number, length: number): boolean {
  return (epoch + DRAND_DELAY) % length === 0;
}

/** 시각 now 뒤 첫 맞춘 마감이 1회차 마감이 되는 epoch. 1회차는 이미 열려 있을 수 있다 */
export function alignedEpoch(now: number, length: number): number {
  let close = Math.floor((now + DRAND_DELAY) / length) * length - DRAND_DELAY;
  if (close <= now) close += length;
  return close - length;
}

/** 마감 뒤 도착한 응모에 돌려주는 말. 시각은 서버 시계(한국 시각) */
export function closedMessage(receivedAt: number): string {
  const kst = new Date((receivedAt + 9 * 3600) * 1000)
    .toISOString()
    .slice(11, 19);
  return `마감됐어요(서버 시각 ${kst})`;
}

/** 시각 t에 응모받는 회차(opensAt ≤ t < closesAt). 1회차 전이면 null */
export function roundAt(schedule: Schedule, t: number): number | null {
  if (t < schedule.epoch) return null;
  let opensAt = schedule.epoch;
  const entries = schedule.entries;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as ScheduleEntry;
    const next = entries[i + 1];
    const segmentEnd = next
      ? opensAt + (next.fromRound - entry.fromRound) * entry.length
      : Infinity;
    if (t < segmentEnd)
      return entry.fromRound + Math.floor((t - opensAt) / entry.length);
    opensAt = segmentEnd;
  }
  return null;
}

/**
 * 회차 `decidedInRound`의 기록에 넣는 일정 변경이 규칙에 맞는지.
 * 새 줄은 맨 뒤에 붙고, 효력은 3회차 예고 뒤(decidedInRound + 4회차)부터다.
 * 이미 응모받는 회차의 시각은 바뀌지 않는다.
 */
export function checkScheduleChange(
  schedule: Schedule,
  change: ScheduleEntry,
  decidedInRound: number,
): string | null {
  const last = schedule.entries.at(-1);
  const problem = checkScheduleEntry(change) ?? checkPhaseAfter(last, change);
  if (problem) return problem;
  if (last && change.fromRound <= last.fromRound)
    return "새 줄은 마지막 줄보다 뒤 회차부터";
  const earliest = earliestNoticeRound(decidedInRound);
  if (change.fromRound < earliest)
    return `일정 변경은 ${NOTICE_ROUNDS}회차 예고 뒤(${earliest}회차)부터`;
  return null;
}

export function withChange(
  schedule: Schedule,
  change: ScheduleEntry,
): Schedule {
  return { epoch: schedule.epoch, entries: [...schedule.entries, change] };
}

/** 회차의 운영 단계. 단계가 없는 일정표면 null */
export function phaseOf(schedule: Schedule, round: number): Phase | null {
  return roundTimes(schedule, round).entry.phase ?? null;
}

/** 정식 단계 첫 회차(사슬 회차 번호). 아직 정식 단계가 없으면 null */
export function liveStart(schedule: Schedule): number | null {
  return schedule.entries.find((e) => e.phase === "live")?.fromRound ?? null;
}

export interface DisplayRound {
  phase: Phase | null;
  /** 단계 안에서 센 번호(정식 단계 첫 회차가 1) */
  number: number;
  /** "정식 3회", "시험 12회", 단계가 없으면 "12회" */
  label: string;
}

/**
 * 사람에게 보이는 회차 번호(docs/36 11-6). 데이터의 기준은 늘 사슬 회차 번호(round)이고,
 * 화면·검사기·검증 페이지는 이 함수 하나로 "정식 n회"·"시험 n회"를 보인다
 */
export function displayRound(schedule: Schedule, round: number): DisplayRound {
  const phase = phaseOf(schedule, round);
  if (phase === null) return { phase, number: round, label: `${round}회` };
  const start =
    phase === "live"
      ? (liveStart(schedule) as number)
      : (schedule.entries.find((e) => e.phase === "trial")?.fromRound ?? 1);
  const number = round - start + 1;
  return {
    phase,
    number,
    label: `${phase === "live" ? "정식" : "시험"} ${number}회`,
  };
}

/** 단계: 0 없음, 1 시험, 2 정식 */
const PHASE_CODE = { trial: 1, live: 2 } as const;

/**
 * 일정표 한 줄의 바이트(genesis 해시, 회차 기록의 일정 변경, 운영 기록의 일정 바꾸기가 같이 쓴다):
 * fromRound ‖ length ‖ closeMargin ‖ powTarget ‖ registerPowTarget(각 u32) ‖ 단계(u8)
 */
export function writeScheduleEntry(w: ByteWriter, e: ScheduleEntry): void {
  w.u32(e.fromRound)
    .u32(e.length)
    .u32(e.closeMargin)
    .u32(e.powTarget)
    .u32(e.registerPowTarget)
    .u8(e.phase ? PHASE_CODE[e.phase] : 0);
}

export function readScheduleEntry(r: ByteReader): ScheduleEntry {
  const entry: ScheduleEntry = {
    fromRound: r.u32(),
    length: r.u32(),
    closeMargin: r.u32(),
    powTarget: r.u32(),
    registerPowTarget: r.u32(),
  };
  const phase = r.u8();
  if (phase === 1) entry.phase = "trial";
  else if (phase === 2) entry.phase = "live";
  else if (phase !== 0) throw new Error(`모르는 단계: ${phase}`);
  return entry;
}
