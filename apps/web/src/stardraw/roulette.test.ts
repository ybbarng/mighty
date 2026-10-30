// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  planRoulette,
  ROULETTE_TIMING,
  rouletteAt,
  sweepOrder,
} from "./roulette";

describe("추첨 룰렛: 미리 정한 칸 수로 정확히 당첨 별에서 멈춘다", () => {
  // 나온 차례(작은 수부터가 아니다), 7번째는 보너스
  const order = [27, 3, 44, 11, 38, 19, 7];
  const plan = planRoulette(order);
  const { spinMs } = ROULETTE_TIMING;

  it("바퀴마다 멈추는 순간 불빛은 정확히 그 바퀴의 당첨 별이고, 멈춘 별은 켜진 채 남는다", () => {
    plan.stops.forEach((s, i) => {
      // 멈추기 바로 전 칸: 마지막 칸이 목표 별
      const end = rouletteAt(plan, s.at + spinMs - 0.001);
      expect(end.step).toBe(s.steps);
      expect(end.cursor).toBe(order[i]);
      // 멈춘 뒤: 그 별까지 켜진 채
      const after = rouletteAt(plan, s.at + spinMs);
      expect(after.fixed).toEqual(order.slice(0, i + 1));
      expect(after.cursor).toBeNull();
    });
    const last = rouletteAt(plan, plan.totalMs);
    expect(last.done).toBe(true);
    expect(last.fixed).toEqual(order);
  });

  it("이미 뽑힌 별은 다음 바퀴에서 건너뛰고, 바퀴마다 적어도 minSteps칸 지나되 두 바퀴는 넘지 않는다", () => {
    plan.stops.forEach((s, i) => {
      expect(s.ring).toHaveLength(45 - i);
      for (const n of order.slice(0, i)) expect(s.ring).not.toContain(n);
      expect(s.steps).toBeGreaterThanOrEqual(ROULETTE_TIMING.minSteps);
      expect(s.steps).toBeLessThan(ROULETTE_TIMING.minSteps + s.ring.length);
      // 도는 동안 불빛은 뽑힌 별에 가지 않는다
      for (let t = s.at; t < s.at + spinMs; t += 7) {
        const f = rouletteAt(plan, t);
        if (f.cursor !== null)
          expect(order.slice(0, i)).not.toContain(f.cursor);
      }
    });
  });

  it("처음엔 빠르고 끝으로 갈수록 느리다(칸이 바뀌는 간격이 늘어난다)", () => {
    const s = plan.stops[0];
    if (!s) throw new Error("바퀴가 없다");
    const stepAt = (ms: number) => rouletteAt(plan, s.at + ms).step;
    const early = stepAt(300) - stepAt(0);
    const late = stepAt(spinMs - 1) - stepAt(spinMs - 301);
    expect(early).toBeGreaterThan(late * 5);
  });

  it("불빛은 정해진 차례(지금은 1→45)로 돈다", () => {
    expect(sweepOrder()).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    const s = plan.stops[0];
    if (!s) throw new Error("바퀴가 없다");
    const seen: number[] = [];
    for (let t = s.at; t < s.at + spinMs; t += 1) {
      const c = rouletteAt(plan, t).cursor;
      if (c !== null && c !== seen.at(-1)) seen.push(c);
    }
    // 이웃한 두 칸은 차례에서도 이웃(45 다음은 1)
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i - 1] as number;
      const b = seen[i] as number;
      expect(b === a + 1 || (a === 45 && b === 1)).toBe(true);
    }
  });

  it("전체는 약 32초", () => {
    expect(plan.totalMs).toBeGreaterThan(29_000);
    expect(plan.totalMs).toBeLessThan(35_000);
  });

  it("멈출 별이 바로 다음 칸이어도 불빛이 충분히 지나간다", () => {
    // 첫 바퀴는 1부터 돌므로 2를 뽑으면 거리 1
    const near = planRoulette([2, 3, 4, 5, 6, 7, 8]);
    for (const s of near.stops)
      expect(s.steps).toBeGreaterThanOrEqual(ROULETTE_TIMING.minSteps);
    const end = rouletteAt(near, (near.stops[0]?.at ?? 0) + spinMs - 0.001);
    expect(end.cursor).toBe(2);
  });
});
