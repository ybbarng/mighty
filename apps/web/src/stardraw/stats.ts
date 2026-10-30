import { RANKS, type Rank, type RoundRecord } from "@mighty/stardraw-core";

import { SKY_STARS, type SkyStar, tempWord } from "./sky";

/**
 * 관측 기록(/stardraw/stats): 공개 장부만으로 계산하는 통계(docs/36 11-18).
 * 당첨 번호 6개만 센다(보너스는 따로). 무효 회차는 추첨이 없어 빼고 센다.
 */

export interface ClosedRound {
  record: RoundRecord;
  /** 이 회차 응모권 중 상품 자격을 붙인 장 수 */
  qualified: number;
}

/** 별빛 다섯 갈래(표면 온도가 높은 순서) */
export const STAR_KINDS = [
  "푸른 별",
  "흰 별",
  "노란빛 별",
  "주황빛 별",
  "붉은 별",
] as const;
export type StarKind = (typeof STAR_KINDS)[number];

export interface StarStat {
  star: SkyStar;
  /** 당첨 번호로 뽑힌 횟수 */
  drawn: number;
  /** 보너스로 뽑힌 횟수 */
  bonus: number;
  /** 마지막으로 당첨 번호로 뽑힌 회차(없으면 null) */
  last: number | null;
  /** 마지막으로 뽑힌 뒤 지난 추첨 수(한 번도 없으면 지금까지 추첨 수) */
  asleep: number;
  /** 가장 길게 이어서 뽑힌 추첨 수 */
  streak: number;
}

export interface GroupStat {
  label: string;
  stars: number;
  drawn: number;
  /** 고르게 뽑힐 때의 기대값 */
  expected: number;
}

export interface Stats {
  /** 추첨한 회차 수(무효 제외) */
  draws: number;
  voids: number;
  firstRound: number | null;
  lastRound: number | null;
  entries: number;
  astronauts: number;
  qualified: number;
  /** 회차마다 응모 수(오래된 것부터) */
  entrySeries: { round: number; count: number }[];
  /** 별마다(번호 순) */
  stars: StarStat[];
  /** 한 별이 뽑힐 기대 횟수 = 추첨 수 × 6/45 */
  expected: number;
  kinds: GroupStat[];
  /** 밝은 별 15개 · 가운데 15개 · 어두운 별 15개 */
  brightness: GroupStat[];
  /** 별자리마다(뽑힌 횟수 많은 순) */
  constellations: GroupStat[];
  /** 등수별 누적 당첨 장 수 */
  winners: Record<Rank, number>;
  latestDrand: number | null;
  fairness: Fairness | null;
}

export interface Fairness {
  /** 카이제곱 값(자유도 44) */
  chi2: number;
  /** 이만큼 이상 치우칠 확률(고르게 뽑힐 때) */
  p: number;
  verdict: "even" | "slight" | "skewed";
}

const PER_DRAW = 6;
const STARS = 45;

export function computeStats(rounds: readonly ClosedRound[]): Stats {
  const sorted = [...rounds].sort((a, b) => a.record.round - b.record.round);
  const drawnRounds = sorted.filter((r) => !r.record.void);
  const draws = drawnRounds.length;
  const expected = (draws * PER_DRAW) / STARS;

  const stars: StarStat[] = SKY_STARS.map((star) => ({
    star,
    drawn: 0,
    bonus: 0,
    last: null,
    asleep: draws,
    streak: 0,
  }));
  const run = new Array<number>(STARS).fill(0);
  drawnRounds.forEach(({ record }, i) => {
    const hit = new Set(record.numbers);
    for (const s of stars) {
      const k = s.star.n - 1;
      if (hit.has(s.star.n)) {
        s.drawn++;
        s.last = record.round;
        s.asleep = draws - 1 - i;
        run[k] = (run[k] ?? 0) + 1;
        s.streak = Math.max(s.streak, run[k] ?? 0);
      } else run[k] = 0;
      if (record.bonus === s.star.n) s.bonus++;
    }
  });

  const group = (label: string, members: StarStat[]): GroupStat => ({
    label,
    stars: members.length,
    drawn: members.reduce((t, s) => t + s.drawn, 0),
    expected: members.length * expected,
  });
  const kinds = STAR_KINDS.map((kind) =>
    group(
      kind,
      stars.filter((s) => tempWord(s.star.k) === kind),
    ),
  );
  const brightness = [
    group("밝은 별", stars.slice(0, 15)),
    group("가운데 별", stars.slice(15, 30)),
    group("어두운 별", stars.slice(30)),
  ];
  const cons = new Map<string, StarStat[]>();
  for (const s of stars)
    cons.set(s.star.con, [...(cons.get(s.star.con) ?? []), s]);
  const constellations = [...cons.entries()]
    .map(([con, members]) => group(con, members))
    .sort((a, b) => b.drawn - a.drawn || b.stars - a.stars);

  const winners = Object.fromEntries(RANKS.map((r) => [r, 0])) as Record<
    Rank,
    number
  >;
  for (const { record } of sorted)
    for (const r of RANKS) winners[r] += record.winners[r].length;

  return {
    draws,
    voids: sorted.length - draws,
    firstRound: sorted[0]?.record.round ?? null,
    lastRound: sorted.at(-1)?.record.round ?? null,
    entries: sorted.reduce((t, r) => t + r.record.count, 0),
    astronauts: sorted.reduce((t, r) => t + r.record.registrationCount, 0),
    qualified: sorted.reduce((t, r) => t + r.qualified, 0),
    entrySeries: sorted.map((r) => ({
      round: r.record.round,
      count: r.record.count,
    })),
    stars,
    expected,
    kinds,
    brightness,
    constellations,
    winners,
    latestDrand: drawnRounds.at(-1)?.record.drandRound ?? null,
    fairness: draws > 0 ? fairness(stars, draws) : null,
  };
}

/**
 * 별 45개가 고르게 뽑히는지: 카이제곱 적합도(자유도 44)와 그 p값(윌슨-힐퍼티 근사).
 * 한 회차에 6개를 겹치지 않게 뽑으므로 별마다 분산은 기대값 × (1 − 6/45)로 고친다.
 */
export function fairness(stars: readonly StarStat[], draws: number): Fairness {
  const e = (draws * PER_DRAW) / STARS;
  const variance = e * (1 - PER_DRAW / STARS);
  const chi2 = stars.reduce((t, s) => t + (s.drawn - e) ** 2 / variance, 0);
  const p = chiSquareTail(chi2, STARS - 1);
  return {
    chi2,
    p,
    verdict: p >= 0.05 ? "even" : p >= 0.01 ? "slight" : "skewed",
  };
}

/** 카이제곱 분포의 위쪽 꼬리 확률(윌슨-힐퍼티 근사, 자유도가 크면 충분히 맞다) */
export function chiSquareTail(x: number, k: number): number {
  if (x <= 0) return 1;
  const z = ((x / k) ** (1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - normalCdf(z);
}

function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
