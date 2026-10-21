/** 덱 섞기 두 번(갈라졌다 합치기)에 걸리는 시간 */
export const SHUFFLE_MS = 1600;
/** 나눠 주는 카드(묶음)가 덱에서 손까지 날아가는 시간 */
export const FLIGHT_MS = 320;
/** 다 나눈 뒤 잠시 쉬는 시간 */
export const SETTLE_MS = 400;

/** 원작처럼 2장·3장·3장·2장 묶음으로 나눈다(6마 2·3·3, 7마 2·3·2) */
const PACKET_PATTERN = [2, 3, 3, 2];

/** 한 사람이 받는 묶음 크기들. `pattern`이 없으면 마이티(2·3·3·2) */
export function dealPackets(
  handSize: number,
  pattern: readonly number[] = PACKET_PATTERN,
): number[] {
  const packets: number[] = [];
  let left = handSize;
  for (let i = 0; left > 0; i++) {
    const size = Math.min(pattern[i % pattern.length] ?? 2, left);
    packets.push(size);
    left -= size;
  }
  return packets;
}

/** 묶음 안에서 카드 사이 간격. 짧게 두어 한 묶음이 겹쳐 날아가는 것처럼 보이게 한다 */
const IN_PACKET_MS = 35;
/** 묶음이 도착하고 다음 묶음이 출발하기까지 */
const PACKET_PAUSE_MS = 40;

/**
 * 나눠 주기 순서와 시간. 선부터 한 사람씩 묶음을 주고, 한 바퀴 돌면 다음 묶음으로 간다.
 * `flights[k]`는 덱 맨 위에서 k번째로 나가는 카드가 갈 사람(선부터 센 순서)과 출발 시각.
 */
export function dealPlan(
  handSize: number,
  players: number,
  pattern?: readonly number[],
): { flights: { player: number; delay: number }[]; duration: number } {
  const packets = dealPackets(handSize, pattern);
  // 원작(MFSM_Server, PlayerHuman::OnDeal)은 묶음 하나를 날리고 도착할 때까지 기다린 뒤 다음 묶음을 날린다.
  const flights: { player: number; delay: number }[] = [];
  let at = 0;
  for (const size of packets) {
    for (let player = 0; player < players; player++) {
      for (let c = 0; c < size; c++)
        flights.push({ player, delay: at + c * IN_PACKET_MS });
      at += (size - 1) * IN_PACKET_MS + FLIGHT_MS + PACKET_PAUSE_MS;
    }
  }
  const last = flights.at(-1)?.delay ?? 0;
  return {
    flights,
    duration: SHUFFLE_MS + last + FLIGHT_MS + SETTLE_MS,
  };
}

/** 기기에서 움직임 줄이기를 켰는가. 켜져 있으면 섞고 나눠 주는 연출을 건너뛴다 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
