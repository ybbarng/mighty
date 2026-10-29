import data from "./sky-data.json";

/**
 * 하늘의 별 따기 응모판(네모 하늘) 데이터(docs/36 11-3).
 * 번호 1~45는 서울에서 보이는 가장 밝은 실제 별 45개(밝은 순서)다.
 * 좌표는 `scripts/build-stardraw-sky.mjs`로 한 번 계산해 고정한 값이다(0~1, 왼쪽 위가 0).
 */

export interface SkyStar {
  n: number;
  /** 한글 이름(예: "베텔게우스") */
  ko: string;
  /** 영어 고유 이름 */
  name: string;
  /** 별자리 한글 이름(예: "오리온자리") */
  con: string;
  /** 바이어 부호(예: "α") */
  bayer: string;
  /** 적경·적위(도) */
  ra: number;
  dec: number;
  /** 겉보기 등급 */
  mag: number;
  /** 표면 온도(K) */
  k: number;
  x: number;
  y: number;
  /** 흥미로운 한 줄 */
  fact: string;
}

export interface SkyLine {
  /** 별자리 한글 이름 */
  con: string;
  /** 꺾은선 점(0~1) */
  pts: [number, number][];
}

export const SKY_STARS: readonly SkyStar[] = data.stars as SkyStar[];
export const SKY_LINES: readonly SkyLine[] = data.lines as SkyLine[];

export function starOf(n: number): SkyStar {
  const s = SKY_STARS[n - 1];
  if (!s || s.n !== n) throw new Error(`없는 별 번호: ${n}`);
  return s;
}

/** 로또 공 색 구간: 1~10 노랑, 11~20 파랑, 21~30 빨강, 31~40 회색, 41~45 초록 */
export function ballColor(n: number): string {
  if (n <= 10) return "#f6c343";
  if (n <= 20) return "#5aa8e8";
  if (n <= 30) return "#ef6a5a";
  if (n <= 40) return "#a7adb8";
  return "#6cc58a";
}

const TEMP_STOPS: readonly [number, [number, number, number]][] = [
  [3000, [255, 170, 120]],
  [4500, [255, 205, 150]],
  [6000, [255, 240, 220]],
  [8000, [235, 240, 255]],
  [12000, [205, 220, 255]],
  [30000, [170, 195, 255]],
];

/** 표면 온도 → 별 색(붉은 별 ~ 푸른 별) */
export function tempColor(k: number): [number, number, number] {
  const first = TEMP_STOPS[0] as (typeof TEMP_STOPS)[number];
  if (k <= first[0]) return first[1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [k1, c1] = TEMP_STOPS[i] as (typeof TEMP_STOPS)[number];
    if (k <= k1) {
      const [k0, c0] = TEMP_STOPS[i - 1] as (typeof TEMP_STOPS)[number];
      const t = (k - k0) / (k1 - k0);
      return c0.map((v, j) => Math.round(v + ((c1[j] as number) - v) * t)) as [
        number,
        number,
        number,
      ];
    }
  }
  return (TEMP_STOPS.at(-1) as (typeof TEMP_STOPS)[number])[1];
}

export function tempWord(k: number): string {
  if (k < 4000) return "붉은 별";
  if (k < 5500) return "주황빛 별";
  if (k < 7000) return "노란빛 별";
  if (k < 10000) return "흰 별";
  return "푸른 별";
}

/** 등급 → 그릴 반지름(판 너비 360px 기준). 밝을수록 크다 */
export function starRadius(mag: number): number {
  return Math.max(2.2, 3.4 * 10 ** ((-0.4 * (mag - 2.2)) / 2.4));
}

/** 별 하나를 부르는 말: "7 베텔게우스 · 오리온자리" */
export function starLabel(s: SkyStar): string {
  return `${s.n} ${s.ko} · ${s.con}`;
}
