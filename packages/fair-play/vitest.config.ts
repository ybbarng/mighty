import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "fair-play",
    environment: "node",
    // 암호 계산이 많아 다른 시험과 함께 돌면 CPU가 바쁘다. 결과가 기기 속도에 따라 달라지지 않게
    // 상한은 멈춘 시험을 잡는 안전장치로만 둔다(CLAUDE.md flaky 규칙).
    testTimeout: 180_000,
    // 봇끼리 수백 판을 두는 세기 비교는 오래 걸려 `pnpm bench`로 따로 돌린다.
    exclude: ["**/node_modules/**", "**/*.strength.ts"],
  },
});
