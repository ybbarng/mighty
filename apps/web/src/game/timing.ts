/** 덱 섞기 두 번(갈라졌다 합치기)에 걸리는 시간 */
export const SHUFFLE_MS = 900;
/** 카드 한 장이 날아가는 시간 */
export const FLIGHT_MS = 300;

/** 원작처럼 2장·3장·3장·2장 묶음으로 나눈다(6마 2·3·3, 7마 2·3·2) */
const PACKET_PATTERN = [2, 3, 3, 2];

/** 한 사람이 받는 묶음 크기들 */
export function dealPackets(handSize: number): number[] {
  const packets: number[] = [];
  let left = handSize;
  for (let i = 0; left > 0; i++) {
    const size = Math.min(PACKET_PATTERN[i % PACKET_PATTERN.length] ?? 2, left);
    packets.push(size);
    left -= size;
  }
  return packets;
}

/** 묶음 안에서 카드 사이 간격 */
const IN_PACKET_MS = 35;

/**
 * 나눠 주기 순서와 시간. 선부터 한 사람씩 묶음을 주고, 한 바퀴 돌면 다음 묶음으로 간다.
 * `flights[k]`는 덱 맨 위에서 k번째로 나가는 카드가 갈 사람(선부터 센 순서)과 출발 시각.
 */
export function dealPlan(
  handSize: number,
  players: number,
): { flights: { player: number; delay: number }[]; duration: number } {
  const packets = dealPackets(handSize);
  // 묶음 수가 많아도 1.5초 남짓에 끝나게 묶음 사이 간격을 줄인다.
  const gap = Math.min(
    150,
    Math.max(70, 1500 / Math.max(1, packets.length * players)),
  );
  const flights: { player: number; delay: number }[] = [];
  let at = 0;
  for (const size of packets) {
    for (let player = 0; player < players; player++) {
      for (let c = 0; c < size; c++)
        flights.push({ player, delay: at + c * IN_PACKET_MS });
      at += gap;
    }
  }
  const last = flights.at(-1)?.delay ?? 0;
  return { flights, duration: SHUFFLE_MS + last + FLIGHT_MS };
}

/** 기기에서 움직임 줄이기를 켰는가. 켜져 있으면 섞고 나눠 주는 연출을 건너뛴다 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
