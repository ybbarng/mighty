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
  /** 마감 여유(초). 화면·터미널은 closesAt - closeMargin부터 응모를 막는다 */
  closeMargin: number;
  /** 작업 증명 목표값(argon 결과 앞 4바이트가 이것보다 작아야 한다, pow.ts) */
  powTarget: number;
  /** 새 열쇠 등록의 작업 증명 목표값(응모권보다 훨씬 무겁게, docs/36 5절) */
  registerPowTarget: number;
}

export interface Schedule {
  /** 1회차가 열리는 시각 */
  epoch: number;
  /** fromRound 오름차순, 첫 줄은 fromRound 1 */
  entries: ScheduleEntry[];
  /**
   * 시험 운영 장부. genesis 꼬리표가 달라(record.ts) 정식 장부와 응모권·등록·증명이 섞일 수 없다.
   * 정식 장부는 이 칸이 없다
   */
  ledger?: "trial";
  /**
   * 시험 장부에서 옮겨 온 패스키 등록(docs/36 11-6). 목록은 장부의 genesis 파일에 공개하고,
   * 여기에는 수와 등록 id 머클 루트(hex)만 둔다. genesis 해시에 들어가 1회차 전에 고정된다
   */
  carried?: { count: number; root: string };
}

/** 회차 k가 정해지려면 앞 회차 기록(drand 뒤)이 있어야 해서 회차는 10분보다 짧을 수 없다 */
export const MIN_ROUND_LENGTH = 600;
/** 일정 변경은 이만큼 뒤에 시작하는 회차부터 */
export const SCHEDULE_NOTICE = 24 * 60 * 60;

export interface RoundTimes {
  round: number;
  opensAt: number;
  closesAt: number;
  /** 화면·터미널이 응모를 막는 시각 */
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
  return null;
}

export function checkSchedule(schedule: Schedule): string | null {
  if (!Number.isInteger(schedule.epoch) || schedule.epoch < 0)
    return "epoch는 0 이상 정수";
  if (schedule.ledger !== undefined && schedule.ledger !== "trial")
    return "장부 종류는 시험(trial)이거나 없어야 한다";
  if (schedule.carried !== undefined) {
    const { count, root } = schedule.carried;
    if (!Number.isInteger(count) || count < 1 || count > 0xffffffff)
      return "옮긴 등록 수는 1 이상 정수";
    if (!/^[0-9a-f]{64}$/.test(root)) return "옮긴 등록 루트는 32바이트 hex";
    if (schedule.ledger === "trial")
      return "시험 장부에는 등록을 옮겨 오지 않는다";
  }
  const first = schedule.entries[0];
  if (first?.fromRound !== 1) return "첫 줄은 1회차부터";
  let prev = 0;
  for (const entry of schedule.entries) {
    const problem = checkScheduleEntry(entry);
    if (problem) return problem;
    if (entry.fromRound <= prev) return "fromRound는 늘어나야 한다";
    prev = entry.fromRound;
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
 * 새 줄은 맨 뒤에 붙고, 효력은 그 회차 마감 + 24시간 뒤에 시작하는 회차부터다.
 * 이미 응모받는 회차의 시각은 바뀌지 않는다.
 */
export function checkScheduleChange(
  schedule: Schedule,
  change: ScheduleEntry,
  decidedInRound: number,
): string | null {
  const problem = checkScheduleEntry(change);
  if (problem) return problem;
  const last = schedule.entries.at(-1);
  if (last && change.fromRound <= last.fromRound)
    return "새 줄은 마지막 줄보다 뒤 회차부터";
  const decidedAt = roundTimes(schedule, decidedInRound).closesAt;
  // 새 줄이 붙어도 fromRound가 열리는 시각은 앞 줄들로 정해져 그대로다
  const startsAt = roundTimes(schedule, change.fromRound).opensAt;
  if (startsAt < decidedAt + SCHEDULE_NOTICE) {
    return "일정 변경은 24시간 뒤에 시작하는 회차부터";
  }
  return null;
}

export function withChange(
  schedule: Schedule,
  change: ScheduleEntry,
): Schedule {
  return { epoch: schedule.epoch, entries: [...schedule.entries, change] };
}
