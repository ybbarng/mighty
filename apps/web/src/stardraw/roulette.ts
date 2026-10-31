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
  /** 멈출 별이 이 칸 수보다 가까우면 한 바퀴를 더 돈다(불빛이 거의 안 움직이고 멈추지 않게) */
  minSteps: number;
}

/**
 * 한 번 멈춤 약 4.5초, 전체 약 32초. 불빛을 눈으로 따라갈 수 있게 덧바퀴 없이 멈출 별까지만 돈다
 * (사용자: 룰렛이 너무 빨리 돈다, 2026-10-30)
 */
export const ROULETTE_TIMING: RouletteTiming = {
  leadMs: 600,
  spinMs: 3600,
  holdMs: 900,
  laps: 0,
  minSteps: 15,
};

/**
 * 실시간 추첨(회차 방)의 룰렛: 별 하나마다 약 6.7초(켜지는 순간 방에서 반응할 틈), 공 7개면 약 46초,
 * 앞의 15초 안내·10초 카운트다운과 합쳐 1분 안팎(2026-10-31 사용자). 혼자 보는 다시 보기는 ROULETTE_TIMING(약 33초)을 쓴다:
 * 함께 반응할 사람이 없고, 결과를 다시 확인하려는 것이라 짧은 편이 낫다
 */
export const LIVE_ROULETTE_TIMING: RouletteTiming = {
  leadMs: 1500,
  spinMs: 4500,
  holdMs: 2200,
  laps: 0,
  minSteps: 15,
};

/**
 * 실시간 추첨이 시작되는 시각 = 추첨 시각(drand 회차 시각) + 이만큼. drand 값과 서버의 회차 기록이 몇 초 뒤에 오므로
 * 모두가 같은 기준으로 조금 늦게 시작한다(결과가 확실히 와 있게). 카운트다운의 0초가 이 시각이다
 */
export const LIVE_LEAD_MS = 6000;

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
    const near = distance < timing.minSteps ? ring.length : 0;
    stops.push({
      target,
      ring,
      start,
      steps: distance + near + timing.laps * ring.length,
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

/** 빠르게 시작해 점점 느려지는 곡선(0~1 → 0~1). 출발이 너무 급하지 않게 제곱 */
function easeOut(u: number): number {
  return 1 - (1 - u) ** 2;
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
      // 반올림: 마지막 칸(당첨 별)에 멈추기 조금 전에 닿아 잠깐 머문다
      const step = Math.min(s.steps, Math.round(easeOut(u) * s.steps));
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
