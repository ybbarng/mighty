import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "engine",
    environment: "node",
    // 무작위 대국·컴퓨터 탐색 시험은 계산이 많다. 다른 시험과 동시에 돌거나 느린 기기에서도
    // 결과가 같도록 상한은 멈춘 시험을 잡는 안전장치로만 둔다(CLAUDE.md flaky 규칙).
    testTimeout: 60_000,
  },
});
