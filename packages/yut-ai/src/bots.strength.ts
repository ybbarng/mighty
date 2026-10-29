import { createRng } from "@mighty/engine";
import { createYutScenario, STANDARD_RULES, viewOf } from "@mighty/yut-engine";
import { describe, expect, it } from "vitest";

import {
  type YutBot,
  yutBeginnerBot,
  yutExpertBot,
  yutIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

// 패키지 tsconfig는 DOM 타입이 없어 쓰는 것만 적어 둔다(다른 게임 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };

/** 두 봇이 자리를 바꿔 가며 n판. 앞 봇이 이긴 판 수 */
function duel(a: YutBot, b: YutBot, n: number): number {
  let won = 0;
  for (let i = 0; i < n; i++) {
    const aSeat = i % 2;
    const bots = aSeat === 0 ? [a, b] : [b, a];
    const state = playGame(bots, STANDARD_RULES, 1000 + i);
    if (state.result?.side === aSeat) won += 1;
  }
  return won;
}

describe("세기 비교(1:1 기본 규칙)", () => {
  it("중수가 입문을 이긴다", () => {
    const n = 1000;
    const won = duel(yutIntermediateBot, yutBeginnerBot, n);
    console.log(`중수 대 입문: ${won}승 ${n - won}패`);
    expect(won).toBeGreaterThan(n * 0.55);
  });

  it("고수가 중수를 이긴다", () => {
    const n = 600;
    const won = duel(yutExpertBot, yutIntermediateBot, n);
    console.log(`고수 대 중수: ${won}승 ${n - won}패`);
    expect(won).toBeGreaterThan(n * 0.52);
  });

  it("고수 한 수는 휴대폰에서도 1초 안쪽(노트북에서 수십 ms)", () => {
    // 말이 많이 나와 있고 결과가 셋 모인, 따져 볼 수가 많은 장면
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: 3 },
        { side: 0, point: 7 },
        { side: 0, point: 22 },
        { side: 1, point: 5 },
        { side: 1, point: 12 },
        { side: 1, point: 17 },
      ],
      pending: [4, 3, 2],
    });
    const view = viewOf(scene, 0);
    const start = performance.now();
    for (let i = 0; i < 20; i++) yutExpertBot.decide(view, createRng(i));
    const each = (performance.now() - start) / 20;
    console.log(`고수 한 수: ${each.toFixed(1)}ms`);
    expect(each).toBeLessThan(200);
  });
});
