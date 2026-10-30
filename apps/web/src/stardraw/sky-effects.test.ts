// @vitest-environment node
import { createRng, nextFloat } from "@mighty/engine";
import { ManualClock } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";

import { flashCurve, startSkyEffects, twinkleLevel } from "./sky-effects";

function effects() {
  const clock = new ManualClock();
  const rng = createRng(7);
  let count = 0;
  const fx = startSkyEffects({
    clock,
    stars: 45,
    faints: 300,
    random: () => nextFloat(rng),
    onEffect: () => count++,
  });
  return { clock, fx, events: () => count };
}

describe("하늘 효과 시간표", () => {
  it("10분 동안 번호 별은 1초에 한 번쯤, 어두운 별은 1.5초에 한 번쯤 반짝인다", () => {
    const { clock, fx } = effects();
    let stars = 0;
    let faints = 0;
    const seen = new Set<string>();
    for (let t = 0; t < 600_000; t += 100) {
      clock.advance(100);
      for (const tw of fx.twinkles()) {
        const key = `${tw.kind}${tw.index}@${tw.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (tw.kind === "star") stars++;
        else faints++;
      }
    }
    // 평균 577번·400번(겹친 별은 건너뛰어 조금 적다). 씨앗이 고정이라 늘 같은 값이 나온다
    expect(stars).toBeGreaterThan(450);
    expect(stars).toBeLessThan(650);
    expect(faints).toBeGreaterThan(300);
    expect(faints).toBeLessThan(480);
    fx.stop();
  });

  it("유성은 2.5초 뒤 처음 지나가고, 그 뒤는 8~22초마다", () => {
    const { clock, fx } = effects();
    const starts: number[] = [];
    for (let t = 0; t < 120_000; t += 100) {
      clock.advance(100);
      const m = fx.meteor();
      if (m && starts.at(-1) !== m.start) starts.push(m.start);
    }
    expect(starts[0]).toBe(2500);
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] as number) - (starts[i - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(8000);
      expect(gap).toBeLessThanOrEqual(22000);
    }
    expect(starts.length).toBeGreaterThan(4);
    fx.stop();
  });

  it("멈추면 타이머가 남지 않는다", () => {
    const { clock, fx } = effects();
    fx.stop();
    expect(clock.pending()).toBe(0);
    expect(fx.twinkles()).toEqual([]);
  });

  it("고른 별은 곧바로 반짝이고, 세기는 0→1→0", () => {
    const { clock, fx } = effects();
    fx.flash("star", 7, 700);
    expect(twinkleLevel(fx.twinkles(), "star", 7, clock.now())).toBe(0);
    expect(
      twinkleLevel(fx.twinkles(), "star", 7, clock.now() + 200),
    ).toBeGreaterThan(0.5);
    expect(flashCurve(1)).toBeLessThan(1e-9);
    fx.stop();
  });
});

describe("영수증 하늘: 내 별끼리만 겹쳐 반짝인다", () => {
  it("반짝임은 목록 안의 별에서만 나오고, 여러 개가 동시에 빛나며, 별똥별은 없다", () => {
    const clock = new ManualClock();
    const rng = createRng(11);
    const mine = [3, 9, 21, 27, 33, 41];
    const fx = startSkyEffects({
      clock,
      stars: 0,
      faints: 0,
      pool: mine,
      starMeanMs: 450,
      starDuration: [700, 1500],
      meteors: false,
      random: () => nextFloat(rng),
    });
    let most = 0;
    for (let t = 0; t < 60_000; t += 50) {
      clock.advance(50);
      const now = fx.twinkles();
      for (const tw of now) {
        expect(tw.kind).toBe("star");
        expect(mine).toContain(tw.index);
      }
      most = Math.max(most, now.length);
      expect(fx.meteor()).toBeNull();
    }
    expect(most).toBeGreaterThanOrEqual(3);
    fx.stop();
  });
});
