import { describe, expect, it } from "vitest";

import { dealPackets, dealPlan } from "./timing";

describe("나눠 주기 순서", () => {
  it("원작처럼 5마는 2·3·3·2, 6마는 2·3·3, 7마는 2·3·2장씩 묶어 준다", () => {
    expect(dealPackets(10)).toEqual([2, 3, 3, 2]);
    expect(dealPackets(8)).toEqual([2, 3, 3]);
    expect(dealPackets(7)).toEqual([2, 3, 2]);
  });

  it("선부터 한 사람씩 묶음을 주고 한 바퀴 돌면 다음 묶음", () => {
    const { flights } = dealPlan(10, 5);
    expect(flights).toHaveLength(50);
    // 첫 바퀴: 0번 2장, 1번 2장, …
    expect(flights.slice(0, 4).map((f) => f.player)).toEqual([0, 0, 1, 1]);
    // 둘째 바퀴의 첫 묶음은 다시 0번이 3장
    expect(flights.slice(10, 13).map((f) => f.player)).toEqual([0, 0, 0]);
    // 모든 사람이 10장씩
    for (let p = 0; p < 5; p++)
      expect(flights.filter((f) => f.player === p)).toHaveLength(10);
    // 나가는 시각은 순서대로다
    for (let k = 1; k < flights.length; k++)
      expect(flights[k]?.delay).toBeGreaterThanOrEqual(
        flights[k - 1]?.delay ?? 0,
      );
  });
});
