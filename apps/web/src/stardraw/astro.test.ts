import { describe, expect, it } from "vitest";

import {
  airmass,
  apparentAltitude,
  extinction,
  gmst,
  MARADO,
  refraction,
  SEOUL,
  toHorizontal,
  transitAfterNoon,
  transitAltitude,
} from "./astro";

// 카노푸스(BSC HR 2326, J2000)
const CANOPUS = { ra: 95.9879, dec: -52.6958 };

describe("항성시", () => {
  it("J2000.0(2000-01-01 12:00 UT)의 그리니치 평균 항성시는 280.4606°", () => {
    expect(gmst(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(280.460_62, 4);
  });

  // Meeus 예제 12.a: 1987-04-10 0h UT → 13h10m46.3668s = 197.693195°
  it("Meeus 예제 12.a", () => {
    expect(gmst(Date.UTC(1987, 3, 10))).toBeCloseTo(197.693_195, 3);
  });
});

describe("카노푸스 남중 고도", () => {
  it("마라도: 참 고도 약 4.19°, 굴절을 더하면 약 4.4°", () => {
    const alt = transitAltitude(CANOPUS.dec, MARADO.lat);
    expect(alt).toBeCloseTo(4.19, 2);
    expect(apparentAltitude(alt)).toBeCloseTo(4.37, 1);
  });

  it("서울: 참 고도는 지평선 바로 아래(약 −0.26°), 굴절로 지평선에 겨우 걸친다", () => {
    const alt = transitAltitude(CANOPUS.dec, SEOUL.lat);
    expect(alt).toBeCloseTo(-0.26, 2);
    expect(apparentAltitude(alt)).toBeGreaterThan(0);
    expect(apparentAltitude(alt)).toBeLessThan(0.5);
  });

  it("남중 순간의 계산된 고도·방위가 이론값과 맞는다(방위 정남)", () => {
    const t = transitAfterNoon(CANOPUS.ra, MARADO, Date.UTC(2027, 0, 1));
    const h = toHorizontal(CANOPUS.ra, CANOPUS.dec, MARADO, t);
    expect(h.alt).toBeCloseTo(4.19, 2);
    expect(h.az).toBeCloseTo(180, 1);
  });
});

describe("대기", () => {
  it("천정의 대기 질량은 1, 지평선은 약 38", () => {
    expect(airmass(90)).toBeCloseTo(1, 2);
    expect(airmass(0)).toBeGreaterThan(37);
    expect(airmass(0)).toBeLessThan(39);
  });

  it("굴절은 지평선에서 약 0.5°, 45°에서 1분 남짓", () => {
    expect(refraction(0)).toBeCloseTo(0.48, 1);
    expect(refraction(45) * 60).toBeCloseTo(1, 0);
  });

  it("고도 4.4°의 카노푸스는 맑은 바닷가에서 약 3등급 어두워진다", () => {
    const dim = extinction(4.37);
    expect(dim).toBeGreaterThan(2.5);
    expect(dim).toBeLessThan(3.5);
  });
});
