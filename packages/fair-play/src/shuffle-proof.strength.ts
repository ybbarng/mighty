import { fullDeck } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { encodedDeck, Party } from "./protocol";
import {
  answerShuffle,
  challengeBits,
  commitShuffle,
  verifyShuffle,
} from "./shuffle-proof";
import { GROUP_1024, GROUP_2048 } from "./sra";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

/** 53장 섞기 증명 하나를 만들고(약속·응답) 확인하는 시간(ms) */
describe("섞기 증명 계산 시간 (pnpm --filter @mighty/fair-play bench)", () => {
  it.each([GROUP_1024, GROUP_2048])(
    "$bits비트",
    async (g) => {
      const party = new Party(1, g);
      const input = encodedDeck(g, fullDeck());
      const output = await party.lockAndShuffle(input, "shuffle");
      const e = party.passKey("shuffle") as bigint;
      const label = { device: 1, deal: 1, round: 0, stage: "shuffle" };
      const t0 = performance.now();
      const work = await commitShuffle(g, label, input, e);
      const t1 = performance.now();
      const bits = await challengeBits(label, ["a", "b"], []);
      const answers = await answerShuffle(
        g,
        label,
        input,
        output,
        e,
        work,
        bits,
      );
      const t2 = performance.now();
      expect(
        await verifyShuffle(
          g,
          label,
          input,
          output,
          work.commit,
          bits,
          answers,
        ),
      ).toBe(true);
      const t3 = performance.now();
      const size =
        JSON.stringify(work.commit).length + JSON.stringify(answers).length;
      console.log(
        `${g.bits}비트: 약속 ${Math.round(t1 - t0)}ms, 응답 ${Math.round(t2 - t1)}ms, 확인 ${Math.round(t3 - t2)}ms, 메시지 ${Math.round(size / 1024)}KB`,
      );
    },
    600_000,
  );
});
