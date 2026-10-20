/** 덱 섞기 두 번(갈라졌다 합치기)에 걸리는 시간 */
export const SHUFFLE_MS = 900;
/** 카드 한 장이 날아가는 시간 */
export const FLIGHT_MS = 300;

/** 나눠 주기 연출 시간. 장수가 많아도 1초 남짓에 끝나게 한 장 간격을 줄인다 */
export function dealTiming(total: number): {
  perCard: number;
  duration: number;
} {
  const perCard = Math.min(30, Math.max(14, 1100 / Math.max(1, total)));
  return { perCard, duration: SHUFFLE_MS + total * perCard + FLIGHT_MS };
}

/** 기기에서 움직임 줄이기를 켰는가. 켜져 있으면 섞고 나눠 주는 연출을 건너뛴다 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
