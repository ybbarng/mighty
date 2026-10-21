import { describe, expect, it } from "vitest";

import { finalAudit, Party, playSlot, shuffleAndDeal } from "./protocol";
import { GROUP_1024, GROUP_2048 } from "./sra";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

const OWNERS = Array.from({ length: 53 }, (_, s) =>
  s < 50 ? Math.floor(s / 10) : -1,
);

/** 5명 섞기·나눠 주기, 카드 50장 내기, 판 끝 확인에 걸리는 시간(ms) */
describe("멘탈 포커 계산 시간 (pnpm --filter @mighty/fair-play bench)", () => {
  it.each([GROUP_1024, GROUP_2048])(
    "$bits비트",
    (g) => {
      const t0 = performance.now();
      const parties = [0, 1, 2, 3, 4].map((seat) => new Party(seat, g, 53));
      const deal = shuffleAndDeal(g, parties, OWNERS);
      const t1 = performance.now();
      for (let slot = 0; slot < 50; slot++)
        playSlot(deal, parties, Math.floor(slot / 10), slot);
      const t2 = performance.now();
      expect(finalAudit(deal, parties).ok).toBe(true);
      const t3 = performance.now();
      console.log(
        `${g.bits}비트: 섞고 나누기 ${Math.round(t1 - t0)}ms, 50장 내기 ${Math.round(t2 - t1)}ms, 판 끝 확인 ${Math.round(t3 - t2)}ms`,
      );
    },
    600_000,
  );
});
