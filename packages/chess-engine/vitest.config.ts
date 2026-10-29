import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "chess-engine",
    environment: "node",
    // 멈춘 시험을 잡는 안전장치. 평소 시험 하나 1초 안쪽, 부하 아래 10배까지 느려진다(docs/38)
    testTimeout: 30_000,
  },
});
