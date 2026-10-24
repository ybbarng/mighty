import {
  type Card,
  nextFloat,
  type RngState,
  rankPower,
  suitOf,
} from "@mighty/engine";
import { isHeart, QUEEN_OF_SPADES } from "@mighty/hearts-engine";

/**
 * 하트 고수의 성향. 실력(남의 패 추측, 끝까지 수 읽기)은 같고 버릇만 다르다.
 * 마이티 고수의 성향(`@mighty/ai`의 `Persona`)과 같은 생각이다.
 */
export interface HeartsPersona {
  name: string;
  /** 낮은 클로버·다이아·스페이드(J 아래)를 기억할 확률. 하트와 높은 카드는 늘 센다 */
  memory: number;
  /** 이 차이(판당 점수) 안의 수는 비슷하다고 보고 정석(중수의 수)을 따른다 */
  closeMargin: number;
  /** 비슷한 수들 가운데 정석이 아닌 수를 고를 확률 */
  whim: number;
}

export const HEARTS_STEADY: HeartsPersona = {
  name: "보통",
  memory: 0.75,
  closeMargin: 0.3,
  whim: 0.1,
};

export const HEARTS_BOLD: HeartsPersona = {
  name: "과감형",
  memory: 0.6,
  closeMargin: 0.4,
  whim: 0.15,
};

export const HEARTS_CAREFUL: HeartsPersona = {
  name: "신중형",
  memory: 0.9,
  closeMargin: 0.2,
  whim: 0.05,
};

/** 자리마다 성향. 0번(보통 사람 자리)부터 보통·과감형·신중형·과감형 */
export function heartsPersonaForSeat(seat: number): HeartsPersona {
  const order = [HEARTS_STEADY, HEARTS_BOLD, HEARTS_CAREFUL, HEARTS_BOLD];
  return order[seat % order.length] as HeartsPersona;
}

/** 하트 사람이 늘 세는 카드: 하트, ♠Q, J 이상 */
export function isMemorable(card: Card): boolean {
  return (
    isHeart(card) ||
    card === QUEEN_OF_SPADES ||
    (suitOf(card) !== null && rankPower(card) >= rankPower("SJ"))
  );
}

function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** 이번 판에 이 카드를 잊었는가. 같은 판·같은 자리면 늘 같다 */
export function forgets(
  persona: HeartsPersona,
  seat: number,
  round: number,
  card: Card,
): boolean {
  return hash01(`${persona.name}:${seat}:${round}:${card}`) >= persona.memory;
}

export function chance(rng: RngState, p: number): boolean {
  return p > 0 && nextFloat(rng) < p;
}
