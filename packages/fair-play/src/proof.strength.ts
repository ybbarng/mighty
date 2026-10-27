import { describe, expect, it } from "vitest";

import { type KeyStatement, proveKeys, verifyKeys } from "./proof";
import {
  combine,
  encodeIndex,
  GROUP_1024,
  GROUP_2048,
  modPow,
  newKey,
  newShortKey,
} from "./sra";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

/** 열쇠 n개를 한 증명으로 묶어 만들고 확인하는 시간(ms) */
describe("열쇠 증명 계산 시간 (pnpm --filter @mighty/fair-play bench)", () => {
  it.each([GROUP_1024, GROUP_2048])(
    "$bits비트",
    async (g) => {
      for (const n of [1, 10, 53]) {
        const u = newKey(g);
        const items = Array.from({ length: n }, (_, slot) => {
          const input = modPow(encodeIndex(g, slot), newKey(g), g.p);
          const key = newShortKey();
          const output = modPow(input, combine(g, [u, key]), g.p);
          return { slot, input, output, key };
        });
        const st: KeyStatement = {
          device: 1,
          v: g.pow(g.generator, u),
          items,
        };
        const t0 = performance.now();
        const proof = await proveKeys(g, st, u);
        const t1 = performance.now();
        expect(await verifyKeys(g, st, proof)).toBe(true);
        const t2 = performance.now();
        console.log(
          `${g.bits}비트 열쇠 ${n}개: 증명 ${Math.round(t1 - t0)}ms, 확인 ${Math.round(t2 - t1)}ms`,
        );
      }
    },
    600_000,
  );
});
