import { describe, expect, it } from "vitest";

import { SKY_LINES, SKY_STARS, starOf, tempColor } from "./sky";

describe("네모 하늘 데이터", () => {
  it("별 45개, 번호는 1~45 차례이고 밝은 순서다", () => {
    expect(SKY_STARS).toHaveLength(45);
    SKY_STARS.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      if (i > 0)
        expect(s.mag).toBeGreaterThanOrEqual(
          (SKY_STARS[i - 1] as (typeof SKY_STARS)[number]).mag,
        );
    });
    expect(starOf(1).ko).toBe("시리우스");
    expect(starOf(7).ko).toBe("베텔게우스");
    expect(starOf(45).ko).toBe("데네볼라");
  });

  it("모든 별에 이름·별자리·한 줄 문구가 있다", () => {
    for (const s of SKY_STARS) {
      expect(s.ko.length).toBeGreaterThan(0);
      expect(s.con).toMatch(/자리$/);
      expect(s.fact.length).toBeGreaterThan(10);
    }
  });

  it("별은 판 안에 있고, 손가락으로 누를 틈이 있다", () => {
    for (const s of SKY_STARS) {
      expect(s.x).toBeGreaterThanOrEqual(0.05);
      expect(s.x).toBeLessThanOrEqual(0.95);
      expect(s.y).toBeGreaterThanOrEqual(0.05);
      expect(s.y).toBeLessThanOrEqual(0.92);
    }
    let closest = Infinity;
    for (let i = 0; i < SKY_STARS.length; i++)
      for (let j = i + 1; j < SKY_STARS.length; j++) {
        const a = SKY_STARS[i] as (typeof SKY_STARS)[number];
        const b = SKY_STARS[j] as (typeof SKY_STARS)[number];
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    // 판 너비 360px에서 30px쯤
    expect(closest).toBeGreaterThan(0.08);
  });

  it("별자리 선은 판 안의 꺾은선이다", () => {
    expect(SKY_LINES.length).toBeGreaterThan(100);
    for (const line of SKY_LINES) {
      expect(line.pts.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of line.pts) {
        expect(x).toBeGreaterThan(-0.05);
        expect(x).toBeLessThan(1.05);
        expect(y).toBeGreaterThan(-0.05);
        expect(y).toBeLessThan(1.05);
      }
    }
  });

  it("붉은 별은 붉고 푸른 별은 푸르다", () => {
    const [r1, , b1] = tempColor(starOf(7).k);
    const [r2, , b2] = tempColor(starOf(5).k);
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
  });
});
