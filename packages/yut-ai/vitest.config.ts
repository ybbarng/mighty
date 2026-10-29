import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "yut-ai",
    environment: "node",
    // 컴퓨터끼리 끝까지 두는 시험은 계산이 많다. 다른 시험과 동시에 돌거나 느린 기기에서도
    // 결과가 같도록 상한은 멈춘 시험을 잡는 안전장치로만 둔다(CLAUDE.md flaky 규칙).
    testTimeout: 30_000,
    // 봇끼리 수백 판을 두는 세기 비교는 오래 걸려 `pnpm bench`로 따로 돌린다.
    exclude: ["**/node_modules/**", "**/*.strength.ts"],
  },
});
