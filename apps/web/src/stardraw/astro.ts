/**
 * 우주국 소개의 하늘 그림 계산(순수 함수). 적경·적위(J2000, 도) → 어느 곳·어느 때의 고도·방위,
 * 남중 시각, 대기 굴절, 대기 질량과 그에 따른 어두워짐. 세차(2000년부터 수십 년에 0.5° 안쪽)는 그림에서 보이지 않아 넣지 않는다.
 *
 * - 그리니치 평균 항성시: IAU 1982 식(Meeus, 『Astronomical Algorithms』 12.4)
 * - 굴절: Sæmundsson 식(참 고도 → 겉보기 고도, 1986), 10°C·1010hPa 기준
 * - 대기 질량: Kasten & Young(1989)
 */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const wrap360 = (d: number) => ((d % 360) + 360) % 360;

export interface Place {
  name: string;
  lat: number;
  /** 동경(+) */
  lon: number;
}

/** 마라도(제주 남쪽 끝, 우리나라 가장 남쪽 땅) */
export const MARADO: Place = { name: "마라도", lat: 33.1144, lon: 126.2669 };
/** 서울(시청 근처) */
export const SEOUL: Place = { name: "서울", lat: 37.5665, lon: 126.978 };

/** 유닉스 시각(ms) → 율리우스일 */
export function julianDay(ms: number): number {
  return ms / 86_400_000 + 2_440_587.5;
}

/** 그리니치 평균 항성시(도) */
export function gmst(ms: number): number {
  const jd = julianDay(ms);
  const t = (jd - 2_451_545.0) / 36_525;
  return wrap360(
    280.460_618_37 +
      360.985_647_366_29 * (jd - 2_451_545.0) +
      0.000_387_933 * t * t -
      (t * t * t) / 38_710_000,
  );
}

/** 지방 항성시(도) */
export function lst(ms: number, lon: number): number {
  return wrap360(gmst(ms) + lon);
}

export interface Horizontal {
  /** 참 고도(도, 굴절 전) */
  alt: number;
  /** 방위(도, 북 0 → 동 90 → 남 180 → 서 270) */
  az: number;
}

/** 적경·적위 → 고도·방위 */
export function toHorizontal(
  ra: number,
  dec: number,
  place: Place,
  ms: number,
): Horizontal {
  const h = rad(wrap360(lst(ms, place.lon) - ra));
  const φ = rad(place.lat);
  const δ = rad(dec);
  const sinAlt =
    Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // 남쪽에서 잰 방위를 북 기준으로 바꾼다
  const azS = Math.atan2(
    Math.sin(h),
    Math.cos(h) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ),
  );
  return { alt: deg(alt), az: wrap360(deg(azS) + 180) };
}

/** 남중(가장 높이 뜰 때) 참 고도: 90 − 위도 + 적위(남반구 하늘의 별, 북쪽 위도에서) */
export function transitAltitude(dec: number, lat: number): number {
  return 90 - Math.abs(lat - dec);
}

/** 대기 굴절(도): 참 고도 → 겉보기 고도에 더할 값. 지평선 아래 몇 도까지만 뜻이 있다 */
export function refraction(alt: number): number {
  if (alt < -2) return 0;
  return 1.02 / Math.tan(rad(alt + 10.3 / (alt + 5.11))) / 60;
}

/** 겉보기 고도(굴절 포함) */
export function apparentAltitude(alt: number): number {
  return alt + refraction(alt);
}

/** 대기 질량(천정 = 1, 지평선 ≈ 38). 겉보기 고도로 */
export function airmass(apparentAlt: number): number {
  const z = 90 - Math.max(0, apparentAlt);
  return 1 / (Math.cos(rad(z)) + 0.505_72 * (96.079_95 - z) ** -1.6364);
}

/** 맑은 바닷가 하늘의 V 띠 소광 계수(등급 / 대기 질량). 해수면 관측의 흔한 값 0.2~0.3 가운데 */
export const EXTINCTION_V = 0.25;

/** 대기에 흡수돼 어두워지는 정도(등급) */
export function extinction(apparentAlt: number, k = EXTINCTION_V): number {
  return k * airmass(apparentAlt);
}

/**
 * 그날 밤 그 곳에서 별이 남중하는 순간(ms). `dayMs`가 든 날 정오(한국 시각)부터 하루 안에서 찾는다.
 * 항성일(23시간 56분 4초)마다 한 번이라 정확히 하나다
 */
export function transitAfterNoon(
  ra: number,
  place: Place,
  dayMs: number,
): number {
  const KST = 9 * 3_600_000;
  const day = Math.floor((dayMs + KST) / 86_400_000) * 86_400_000 - KST;
  const noon = day + 12 * 3_600_000;
  // 시간각이 0이 될 때까지 남은 항성 시간(도) → 평균 시간
  const toGo = wrap360(ra - lst(noon, place.lon));
  return noon + (toGo / 360.985_647_366_29) * 86_400_000;
}
