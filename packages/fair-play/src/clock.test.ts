import { describe, expect, it } from "vitest";

import { ManualClock } from "./clock";

describe("시험용 시계", () => {
  it("옮기기 전에는 아무 일도 부르지 않는다", () => {
    const clock = new ManualClock();
    const fired: string[] = [];
    clock.after(10, () => fired.push("a"));
    expect(fired).toEqual([]);
    expect(clock.pending()).toBe(1);
  });

  it("옮긴 만큼 닿은 일만 시각 순서대로 부른다", () => {
    const clock = new ManualClock();
    const fired: string[] = [];
    clock.after(30, () => fired.push("c"));
    clock.after(10, () => fired.push("a"));
    clock.after(50, () => fired.push("late"));
    clock.advance(30);
    expect(fired).toEqual(["a", "c"]);
    expect(clock.now()).toBe(30);
  });

  it("부른 일이 새로 건 일도 옮긴 범위 안이면 부른다", () => {
    const clock = new ManualClock();
    const fired: number[] = [];
    clock.after(10, () => {
      fired.push(clock.now());
      clock.after(10, () => fired.push(clock.now()));
    });
    clock.advance(25);
    expect(fired).toEqual([10, 20]);
  });

  it("끈 일은 부르지 않는다", () => {
    const clock = new ManualClock();
    const fired: string[] = [];
    const cancel = clock.after(10, () => fired.push("a"));
    cancel();
    clock.advance(100);
    expect(fired).toEqual([]);
  });
});
