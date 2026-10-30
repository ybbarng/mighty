import { describe, expect, it } from "vitest";

import { celebrationPlan, constellationOf, METEOR_COUNT } from "./celebrate";
import { starOf } from "./sky";

describe("당첨 축하: 나만의 별자리", () => {
  it("맞은 별을 모두 한 번씩 켜고 별 수보다 하나 적은 선으로 잇는다", () => {
    const stars = [7, 1, 24, 13, 40, 2];
    const c = constellationOf(stars);
    expect([...c.order].sort((a, b) => a - b)).toEqual(
      [...stars].sort((a, b) => a - b),
    );
    expect(c.edges).toHaveLength(stars.length - 1);
    // 선은 이미 켜진 별에서 새로 켜지는 별로 이어진다
    c.edges.forEach(([from, to], i) => {
      expect(c.order.slice(0, i + 1)).toContain(from);
      expect(c.order[i + 1]).toBe(to);
    });
  });

  it("가장 왼쪽 별에서 시작하고 같은 별이면 늘 같은 모양이다", () => {
    const stars = [5, 9, 30];
    const a = constellationOf(stars);
    const b = constellationOf([...stars].reverse());
    expect(a).toEqual(b);
    const leftmost = Math.min(...stars.map((n) => starOf(n).x));
    expect(starOf(a.order[0] as number).x).toBe(leftmost);
  });

  it("빈 목록은 아무것도 그리지 않는다", () => {
    expect(constellationOf([])).toEqual({ order: [], edges: [] });
  });
});

describe("당첨 축하: 등수별 크기", () => {
  it("별똥별은 3등부터, 1등이 가장 많고 직인은 1~3등만", () => {
    expect(METEOR_COUNT[5]).toBe(0);
    expect(METEOR_COUNT[4]).toBe(0);
    expect(METEOR_COUNT[3]).toBeGreaterThan(0);
    expect(METEOR_COUNT[2]).toBeGreaterThan(METEOR_COUNT[3]);
    expect(METEOR_COUNT[1]).toBeGreaterThan(METEOR_COUNT[2]);
    expect(celebrationPlan(5, [1, 2, 3]).sealAt).toBeNull();
    expect(celebrationPlan(4, [1, 2, 3, 4]).sealAt).toBeNull();
    expect(celebrationPlan(3, [1, 2, 3, 4, 5]).sealAt).not.toBeNull();
  });

  it("별이 다 켜진 뒤 선을 긋고, 직인은 별자리가 다 생긴 뒤에 찍힌다", () => {
    const p = celebrationPlan(1, [1, 2, 3, 4, 5, 6]);
    const lastStar = Math.max(...p.starAt);
    expect(Math.min(...p.lineAt)).toBeGreaterThan(lastStar);
    expect(p.sealAt).toBeGreaterThan(Math.max(...p.lineAt));
    expect(p.meteors).toHaveLength(METEOR_COUNT[1]);
    for (const m of p.meteors) expect(m.at).toBeGreaterThanOrEqual(p.sparkleAt);
    // 같은 입력이면 별똥별 자리도 같다
    expect(celebrationPlan(1, [1, 2, 3, 4, 5, 6])).toEqual(p);
  });
});
