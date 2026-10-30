/**
 * 추첨 룰렛(docs/36 11-3): 모든 별을 끈 하늘에서 불빛이 정해진 차례로 별 하나씩 켰다 끄며 돌다가
 * 점점 느려져(ease-out) 정확히 이번 당첨 별에서 멈춘다. 멈춘 별은 켜진 채 남고, 다음 바퀴는 이미 뽑힌 별을 건너뛴다.
 * 6번 멈춘 뒤 7번째는 보너스. 멈추는 차례는 실제 로또처럼 "나온 차례"(drawNumbers의 order) 그대로다.
 *
 * 화면이 늦게 그려져도(rAF 지연) 결과가 흔들리지 않게, 바퀴마다 칸 수와 속도 곡선을 미리 계산해 두고
 * "지난 시간 → 지금 불빛이 있는 별"을 순수 함수로 고른다. 시간이 끝나면 늘 목표 별이다.
 */

/** 불빛이 도는 차례(별 번호). 나중에 하늘을 왼쪽→오른쪽으로 쓸고 지나가는 차례로 바꾸려면 여기만 고친다 */
export function sweepOrder(): number[] {
  return Array.from({ length: 45 }, (_, i) => i + 1);
}

export interface RouletteTiming {
  /** 하늘이 꺼지고 첫 바퀴가 시작하기까지 */
  leadMs: number;
  /** 한 번 도는 시간(빨리 돌다 멈출 때까지) */
  spinMs: number;
  /** 멈춘 뒤 다음 바퀴까지 쉬는 시간 */
  holdMs: number;
  /** 바퀴마다 적어도 이만큼 한 바퀴를 더 돈다 */
  laps: number;
}

/** 한 번 멈춤 약 2.9초, 전체 약 21초 */
export const ROULETTE_TIMING: RouletteTiming = {
  leadMs: 600,
  spinMs: 2400,
  holdMs: 500,
  laps: 1,
};

export interface RouletteStop {
  /** 멈출 별 */
  target: number;
  /** 이 바퀴에서 도는 별들(이미 뽑힌 별을 뺀 차례) */
  ring: number[];
  /** ring에서 처음 불빛이 켜질 자리 */
  start: number;
  /** 도는 칸 수(마지막 칸이 target) */
  steps: number;
  /** 바퀴 시작 시각(ms, 추첨 시작부터) */
  at: number;
}

export interface RoulettePlan {
  stops: RouletteStop[];
  timing: RouletteTiming;
  /** 마지막 멈춤까지 걸리는 시간 */
  totalMs: number;
}

/** 나온 차례(앞 6개 당첨, 7번째 보너스)로 바퀴마다 칸 수를 미리 정한다 */
export function planRoulette(
  order: readonly number[],
  timing: RouletteTiming = ROULETTE_TIMING,
  sweep: readonly number[] = sweepOrder(),
): RoulettePlan {
  const stops: RouletteStop[] = [];
  const taken: number[] = [];
  // 첫 바퀴는 차례의 처음부터, 다음 바퀴는 앞에서 멈춘 별 다음부터 돈다
  let after: number | null = null;
  order.forEach((target, i) => {
    const ring = sweep.filter((n) => !taken.includes(n));
    let start = 0;
    if (after !== null) {
      const at = sweep.indexOf(after);
      // 앞에서 멈춘 별(이제 ring에 없다) 다음에 오는 첫 별
      const next = ring.findIndex((n) => sweep.indexOf(n) > at);
      start = next === -1 ? 0 : next;
    }
    const goal = ring.indexOf(target);
    if (goal === -1) throw new Error(`도는 차례에 없는 별 ${target}`);
    const distance = (goal - start + ring.length) % ring.length;
    stops.push({
      target,
      ring,
      start,
      steps: distance + timing.laps * ring.length,
      at: timing.leadMs + i * (timing.spinMs + timing.holdMs),
    });
    taken.push(target);
    after = target;
  });
  const last = stops.at(-1);
  return {
    stops,
    timing,
    totalMs: last ? last.at + timing.spinMs : 0,
  };
}

export interface RouletteFrame {
  /** 멈춰서 켜진 채 남은 별(나온 차례) */
  fixed: number[];
  /** 지금 불빛이 지나는 별(돌고 있지 않으면 null) */
  cursor: number | null;
  /** 지금 도는(또는 막 멈춘) 바퀴 번호, 아직 시작 전이면 -1 */
  stop: number;
  /** 이 바퀴에서 지난 칸 수(틱 소리를 칸마다 낸다) */
  step: number;
  /** 모두 멈췄는지 */
  done: boolean;
}

/** 빠르게 시작해 점점 느려지는 곡선(0~1 → 0~1) */
function easeOut(u: number): number {
  return 1 - (1 - u) ** 3;
}

/** 추첨 시작부터 t(ms) 지났을 때의 모습. t가 같으면 늘 같다 */
export function rouletteAt(plan: RoulettePlan, t: number): RouletteFrame {
  const fixed: number[] = [];
  const { spinMs } = plan.timing;
  for (let i = 0; i < plan.stops.length; i++) {
    const s = plan.stops[i] as RouletteStop;
    if (t < s.at)
      return { fixed, cursor: null, stop: i - 1, step: 0, done: false };
    const u = (t - s.at) / spinMs;
    if (u < 1) {
      const step = Math.min(s.steps, Math.floor(easeOut(u) * s.steps));
      const cursor = s.ring[(s.start + step) % s.ring.length] ?? null;
      return { fixed, cursor, stop: i, step, done: false };
    }
    fixed.push(s.target);
  }
  return {
    fixed,
    cursor: null,
    stop: plan.stops.length - 1,
    step: 0,
    done: true,
  };
}
