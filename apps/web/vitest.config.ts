import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    name: "web",
    // 화면(DOM)·브라우저 저장소가 필요한 시험만 jsdom. 나머지는 파일 맨 위 `// @vitest-environment node`
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // 멈춘 시험을 잡는 안전장치. 가장 긴 온라인 방 시험이 혼자 약 2~4초, 부하 아래 10배까지 느려진다(가장 긴 3.5초 → 35초)(2026-10-30, docs/38)
    testTimeout: 60_000,
  },
});
