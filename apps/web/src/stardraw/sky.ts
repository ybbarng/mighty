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

/**
 * 번호 공 색: 그 별의 빛깔(표면 온도, `tempWord`와 같은 구간)을 공처럼 진하게 한 다섯 색.
 * 하늘 그림의 별빛(`tempColor`)은 실제처럼 옅어서 공으로는 서로 구별되지 않는다
 */
export function ballColor(n: number): string {
  const k = starOf(n).k;
  if (k < 4000) return "#e5533d";
  if (k < 5500) return "#f08a2c";
  if (k < 7000) return "#f4c542";
  if (k < 10000) return "#e9edf5";
  return "#5b8def";
}

/** 별빛 색의 채도를 얼마나 낮출지(0이면 흑체 색 그대로, 1이면 흰색). 실제 별은 눈에 아주 옅은 색으로만 보인다 */
const STAR_PALE = 0.3;

/**
 * 표면 온도 → 별빛 색(흑체 근사, 채도를 낮춘 sRGB). 붉은 별 ~ 푸른 별.
 * 흑체 색은 Tanner Helland의 근사식(1000~40000 K)을 쓰고, 흰색 쪽으로 STAR_PALE만큼 섞는다.
 */
export function tempColor(k: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b =
    t >= 66
      ? 255
      : t <= 19
        ? 0
        : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const pale = (v: number) => {
    const c = Math.min(255, Math.max(0, v));
    return Math.round(c + (255 - c) * STAR_PALE);
  };
  return [pale(r), pale(g), pale(b)];
}

export function tempWord(k: number): string {
  if (k < 4000) return "붉은 별";
  if (k < 5500) return "주황빛 별";
  if (k < 7000) return "노란빛 별";
  if (k < 10000) return "흰 별";
  return "푸른 별";
}

/**
 * 등급 → 고리·번호 공 자리를 정하는 반지름(판 너비 360px 기준). 밝을수록 조금 크다.
 * 별 그림 자체는 이보다 훨씬 작은 점과 빛 번짐이다(sky-draw.ts). 누르는 자리도 이 값으로 정한다.
 */
export function starRadius(mag: number): number {
  return Math.max(2.4, 2.6 * 10 ** ((-0.4 * (mag - 2.2)) / 4));
}

/** 별 하나를 부르는 말: "7 베텔게우스 · 오리온자리" */
export function starLabel(s: SkyStar): string {
  return `${s.n} ${s.ko} · ${s.con}`;
}
