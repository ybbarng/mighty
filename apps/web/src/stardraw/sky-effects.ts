import type { Clock } from "@mighty/fair-play";

/**
 * 응모판 하늘의 반짝임과 유성 시간표(star.byb.kr `ui/skyEffects`와 같은 느낌).
 * 프레임마다 확률을 굴리는 대신 `Clock` 타이머로 같은 평균 간격을 낸다. 그리기는 화면 몫이다.
 * - 번호 별: 평균 약 1초에 하나, 0.25~0.7초 동안
 * - 별자리 선의 어두운 별: 평균 약 1.5초에 하나, 0.4~0.9초 동안(더 약하게)
 * - 유성: 처음 2.5초 뒤, 그 뒤 8~22초마다, 0.7~1.1초 동안
 */

export const STAR_TWINKLE_MEAN_MS = 1040;
export const FAINT_TWINKLE_MEAN_MS = 1500;

export interface Twinkle {
  /** 번호 별(1~45 번호) 또는 어두운 별(꼭짓점 차례 번호) */
  kind: "star" | "faint";
  index: number;
  start: number;
  duration: number;
}

export interface Meteor {
  /** 0~1 좌표 */
  x: number;
  y: number;
  /** 진행 방향 단위 벡터 */
  dx: number;
  dy: number;
  /** 판 너비에 대한 비율 */
  distance: number;
  tail: number;
  start: number;
  duration: number;
}

export interface SkyEffectsOptions {
  clock: Clock;
  /** 번호 별 수 */
  stars: number;
  /** 어두운 별 수 */
  faints: number;
  random?: () => number;
  /** 새 효과가 생겼을 때 */
  onEffect?: () => void;
}

export interface SkyEffects {
  /** 지금 살아 있는 반짝임 */
  twinkles(): readonly Twinkle[];
  meteor(): Meteor | null;
  /** 이 별을 지금 반짝이게(고를 때) */
  flash(kind: Twinkle["kind"], index: number, duration?: number): void;
  stop(): void;
}

export function startSkyEffects(options: SkyEffectsOptions): SkyEffects {
  const { clock } = options;
  const random = options.random ?? Math.random;
  const rand = (a: number, b: number) => a + random() * (b - a);
  /** 지수 분포 간격(평균 mean): 고르게 흩어진 사건 */
  const gap = (mean: number) => -Math.log(1 - random()) * mean;
  let twinkles: Twinkle[] = [];
  let meteor: Meteor | null = null;
  const stops: (() => void)[] = [];
  let stopped = false;

  const prune = () => {
    const now = clock.now();
    twinkles = twinkles.filter((t) => now < t.start + t.duration);
    if (meteor && now >= meteor.start + meteor.duration) meteor = null;
  };

  const add = (t: Twinkle) => {
    prune();
    if (twinkles.some((x) => x.kind === t.kind && x.index === t.index)) return;
    twinkles.push(t);
    options.onEffect?.();
  };

  const loop = (mean: number, fire: () => void) => {
    const schedule = () => {
      if (stopped) return;
      stops.push(
        clock.after(gap(mean), () => {
          fire();
          schedule();
        }),
      );
    };
    schedule();
  };

  if (options.stars > 0)
    loop(STAR_TWINKLE_MEAN_MS, () =>
      add({
        kind: "star",
        index: 1 + Math.floor(random() * options.stars),
        start: clock.now(),
        duration: rand(250, 700),
      }),
    );
  if (options.faints > 0)
    loop(FAINT_TWINKLE_MEAN_MS, () =>
      add({
        kind: "faint",
        index: Math.floor(random() * options.faints),
        start: clock.now(),
        duration: rand(400, 900),
      }),
    );

  const nextMeteor = (delay: number) => {
    if (stopped) return;
    stops.push(
      clock.after(delay, () => {
        const angle = rand(0.15, 0.85) * Math.PI;
        meteor = {
          x: rand(0.05, 0.95),
          y: rand(0, 0.4),
          dx: Math.cos(angle),
          dy: Math.sin(angle),
          distance: rand(0.35, 0.6),
          tail: 0.18,
          start: clock.now(),
          duration: rand(700, 1100),
        };
        options.onEffect?.();
        nextMeteor(rand(8000, 22000));
      }),
    );
  };
  nextMeteor(2500);

  return {
    twinkles: () => {
      prune();
      return twinkles;
    },
    meteor: () => {
      prune();
      return meteor;
    },
    flash: (kind, index, duration = 700) =>
      add({ kind, index, start: clock.now(), duration }),
    stop: () => {
      stopped = true;
      for (const s of stops) s();
      twinkles = [];
      meteor = null;
    },
  };
}

/** 반짝임 세기 0→1→0: 빠르게 밝아지고 조금 더 천천히 돌아온다 */
export function flashCurve(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return Math.sin(Math.PI * x ** 0.6) ** 2;
}

/** 지금 이 별의 반짝임 세기(0~1) */
export function twinkleLevel(
  twinkles: readonly Twinkle[],
  kind: Twinkle["kind"],
  index: number,
  now: number,
): number {
  let level = 0;
  for (const t of twinkles)
    if (t.kind === kind && t.index === index && now >= t.start)
      level = Math.max(level, flashCurve((now - t.start) / t.duration));
  return level;
}
