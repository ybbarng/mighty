/**
 * 회차 방의 진행 단계(docs/36 11-23). 시각은 모두 서버 시각(ms)이다.
 * 응모 받는 중 → 마감 → 추첨 15초 전 안내 → 10초 전 카운트다운 → 생방송 추첨 → 추첨 뒤
 */
export type RoomPhase =
  | "open"
  | "closed"
  | "announce"
  | "count"
  | "live"
  | "after";

/** 안내를 시작하는 때(추첨 연출 시작 몇 ms 전) */
export const ANNOUNCE_MS = 15_000;
/** 카운트다운을 시작하는 때 */
export const COUNT_MS = 10_000;

export function roomPhase(
  now: number,
  entryDeadline: number,
  showStart: number,
  showLength: number,
): RoomPhase {
  const toShow = showStart - now;
  if (Math.floor(now / 1000) < entryDeadline) return "open";
  if (toShow > ANNOUNCE_MS) return "closed";
  if (toShow > COUNT_MS) return "announce";
  if (toShow > 0) return "count";
  return now < showStart + showLength ? "live" : "after";
}
