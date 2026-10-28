/*
 * 판 게임의 개인 시간(docs/24): 기본 시간 + 초읽기.
 * 시계는 엔진 상태에 두고, 수마다 그 수에 쓴 시간(`spent`)을 행동에 실어 깎는다.
 * 그래서 기록을 다시 두면 시계도 똑같이 나오고(판 끝 검증), 엔진은 지금 시각을 모른다(순수 함수).
 */

/** 고르는 시간 규칙 */
export type TimePreset = "none" | "fast" | "normal";

export interface TimeControl {
  /** 기본 시간(ms) */
  base: number;
  /** 초읽기 한 번의 길이(ms) */
  byoyomi: number;
  /** 초읽기 횟수 */
  periods: number;
}

export const TIME_PRESETS: Record<Exclude<TimePreset, "none">, TimeControl> = {
  fast: { base: 3 * 60_000, byoyomi: 30_000, periods: 3 },
  normal: { base: 10 * 60_000, byoyomi: 30_000, periods: 3 },
};

export const TIME_PRESET_NAMES: Record<TimePreset, string> = {
  none: "시간 없음",
  fast: "빠른 3분",
  normal: "보통 10분",
};

/** 규칙 문자열 끝에 붙이는 글자(없으면 시간 없음) */
const PRESET_CODES: Record<Exclude<TimePreset, "none">, string> = {
  fast: "t1",
  normal: "t2",
};

export function encodeTimePreset(preset: TimePreset): string {
  return preset === "none" ? "" : `-${PRESET_CODES[preset]}`;
}

/** 규칙 문자열 끝의 `-t1` 같은 꼬리를 읽는다. 없으면 시간 없음 */
export function decodeTimePreset(tail: string | undefined): TimePreset | null {
  if (!tail) return "none";
  const found = (
    Object.keys(PRESET_CODES) as Exclude<TimePreset, "none">[]
  ).find((p) => `-${PRESET_CODES[p]}` === tail);
  return found ?? null;
}

/** 한 사람의 남은 시간 */
export interface PlayerClock {
  /** 남은 기본 시간(ms) */
  main: number;
  /** 남은 초읽기 횟수 */
  periods: number;
}

export function startClock(control: TimeControl): PlayerClock {
  return { main: control.base, periods: control.periods };
}

/**
 * 한 수에 `spent`ms를 썼을 때의 남은 시간. 기본 시간을 먼저 쓰고, 넘친 만큼은 초읽기로 센다.
 * 초읽기 안에 두면 그 횟수는 남고(다음 수에 다시 30초), 넘을 때마다 한 번씩 줄어든다.
 * 초읽기를 다 쓰면 `flagged`(시간패)
 */
export function spendTime(
  clock: PlayerClock,
  spent: number,
  control: TimeControl,
): { clock: PlayerClock; flagged: boolean } {
  const used = Math.max(0, spent);
  if (used <= clock.main)
    return { clock: { ...clock, main: clock.main - used }, flagged: false };
  const over = used - clock.main;
  // 초읽기 한 번 안에 두면 줄지 않는다. 넘긴 초읽기마다 하나씩 줄어든다.
  const lost = Math.floor(over / control.byoyomi);
  const periods = clock.periods - lost;
  if (periods <= 0) return { clock: { main: 0, periods: 0 }, flagged: true };
  return { clock: { main: 0, periods }, flagged: false };
}

/** 이 사람이 지금부터 쓸 수 있는 시간(이만큼 지나면 시간패) */
export function timeLeft(clock: PlayerClock, control: TimeControl): number {
  return clock.main + clock.periods * control.byoyomi;
}
