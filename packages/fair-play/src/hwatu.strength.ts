import { describe, expect, it } from "vitest";

import { network } from "./device-fixture";
import { HWATU_CARDS, hwatuLayout } from "./hwatu-table";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

/** 인원별 흔한 나누기(손패·바닥): 맞고, 3명 고스톱·민화투, 4명 민화투, 5명 나이롱뽕 */
const SHAPES: Record<number, { hand: number; floor: number }> = {
  2: { hand: 10, floor: 8 },
  3: { hand: 7, floor: 6 },
  4: { hand: 5, floor: 8 },
  5: { hand: 5, floor: 0 },
};

/**
 * 화투 48장 멘탈 포커 계산 시간(r255, 한 기기에서 모든 사람 몫을 계산한다).
 * - 나눠 받기: 섞기 사슬(사람마다 섞기 + 다시 잠그기)과 열쇠 공개가 끝나 모두 자기 카드와 바닥을 연 때
 * - 증명까지: 섞기 증명(약속·응답·확인)까지 모두 끝난 때
 * - 한 사람 몫: 한 기기가 한 무거운 계산(섞기·다시 잠그기·섞기 증명 약속·응답)의 합
 */
describe("화투 멘탈 포커 계산 시간 (pnpm --filter @mighty/fair-play bench)", () => {
  it.each([2, 3, 4, 5])(
    "%i명",
    async (n) => {
      const ids = Array.from({ length: n }, (_, i) => i);
      const net = network(ids);
      const shape = SHAPES[n] as { hand: number; floor: number };
      const layout = hwatuLayout(
        ids.map(() => shape.hand),
        shape.floor,
      );
      const own = new Map<number, number>();
      for (const d of net.devices)
        d.on("timing", (_deal, what, ms) => {
          if (what !== "begin") own.set(d.id, (own.get(d.id) ?? 0) + ms);
        });
      const t0 = performance.now();
      const owners = new Map<number, number>();
      layout.hands.forEach((slots, seat) => {
        for (const s of slots) owners.set(s, seat);
      });
      for (const s of layout.floor) owners.set(s, -1);
      for (const d of net.devices) {
        d.start(1, ids, HWATU_CARDS);
        d.assign(1, owners);
      }
      // 모두 자기 카드와 바닥을 열 때까지(증명 계산은 뒤에서 돈다)
      const dealt = () =>
        net.devices.every(
          (d) =>
            d.myCards(1).size === shape.hand &&
            layout.floor.every((s) => d.open(1, s) !== null),
        );
      while (!dealt()) await new Promise<void>((r) => setTimeout(() => r(), 0));
      const t1 = performance.now();
      await net.settle();
      const t2 = performance.now();
      const seen = new Set(
        net.devices.flatMap((d) => [...d.myCards(1).values()]),
      );
      expect(seen.size).toBe(n * shape.hand);
      const perDevice = Math.max(...own.values());
      console.log(
        `${n}명(손패 ${shape.hand}·바닥 ${shape.floor}): 나눠 받기 ${Math.round(t1 - t0)}ms, 증명까지 ${Math.round(t2 - t0)}ms, 한 사람 몫(가장 큰) ${Math.round(perDevice)}ms`,
      );
    },
    600_000,
  );
});

declare function setTimeout(callback: () => void, ms: number): unknown;
