import { type Card, nextFloat, type RngState } from "@mighty/engine";

/**
 * 고수 컴퓨터의 성향. 많이 해 본 사람도 저마다 버릇이 있고, 늘 똑같이 두지 않는다.
 * 실력(남의 패 추측, 끝까지 수 읽기)은 같고 판단 기준과 실수 버릇만 다르다.
 */
export interface Persona {
  /** 화면·로그에 쓰는 이름 */
  name: string;
  /**
   * 출마 기준: 같은 추측 판끼리 비교해 출마가 포기(프렌드·야당)보다 평균 이만큼(판당 돈)
   * 나아야 나선다.
   * 낮을수록 공격적이다
   */
  bidMargin: number;
  /**
   * 낮은 잡카드(기루다·점수 카드·A·K가 아닌 카드)를 기억할 확률.
   * 사람은 기루다와 큰 카드는 세지만 작은 카드는 다 외우지 못한다
   */
  memory: number;
  /** 이 차이(판당 돈) 안의 수는 비슷하다고 보고 정석(중수의 수)을 따른다 */
  closeMargin: number;
  /** 비슷한 수들 가운데 정석이 아닌 수를 고를 확률. 매번 똑같이 두지 않게 한다 */
  whim: number;
}

/** 무난하게 둔다 */
export const STEADY: Persona = {
  name: "보통",
  bidMargin: 0.4,
  memory: 0.75,
  closeMargin: 0.15,
  whim: 0.1,
};

/** 공약을 잘 걸고, 기억은 덜 꼼꼼하다 */
export const BOLD: Persona = {
  name: "공격형",
  bidMargin: 0.1,
  memory: 0.6,
  closeMargin: 0.2,
  whim: 0.15,
};

/** 확실할 때만 나서고, 카드를 꼼꼼히 센다 */
export const CAREFUL: Persona = {
  name: "신중형",
  bidMargin: 0.8,
  memory: 0.9,
  closeMargin: 0.1,
  whim: 0.05,
};

export const PERSONAS: readonly Persona[] = [STEADY, BOLD, CAREFUL];

/**
 * 자리마다 성향을 정한다. 컴퓨터 하나가 모든 자리를 맡으므로 자리 번호로 고른다.
 * 0번(보통 사람 자리)부터 보통·공격형·신중형·공격형·보통… 순서로 돌아간다.
 */
export function personaForSeat(seat: number): Persona {
  const order = [STEADY, BOLD, CAREFUL, BOLD, STEADY, CAREFUL, BOLD];
  return order[seat % order.length] as Persona;
}

/** 문자열에서 0~1 사이 값을 늘 같게 만든다(같은 판 안에서는 같은 카드를 계속 잊고 있게) */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * 이 자리가 이번 판에 잊은 카드. 같은 판·같은 자리면 늘 같은 카드를 잊는다
 * (한 턴에는 잊었다가 다음 턴에 다시 떠올리는 일이 없게).
 */
export function forgets(
  persona: Persona,
  seat: number,
  round: number,
  card: Card,
): boolean {
  return hash01(`${persona.name}:${seat}:${round}:${card}`) >= persona.memory;
}

/** 확률 p로 참 */
export function chance(rng: RngState, p: number): boolean {
  return p > 0 && nextFloat(rng) < p;
}
