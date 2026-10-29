import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/** 실제 정적 빌드(out/)를 띄워 화면 크기별로 한 판을 끝까지 해 본다 */
export default defineConfig({
  testDir: "e2e",
  // 멈춤을 빨리 드러내는 안전장치. 가장 긴 보통 시험이 이 기계에서 약 14초(2026-10-30, docs/38).
  // 여러 탭 멘탈 포커처럼 무거운 시험은 파일 안에서 따로 정한다
  timeout: 90_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // 연출(섞기·나눠 주기·던지기·말 움직임 등)을 실제 시간으로 기다리지 않는다.
    // 연출이 있는 길을 보는 시험만 `emulateMedia({ reducedMotion: "no-preference" })`로 켠다.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    { name: "phone-portrait", use: { ...devices["Pixel 7"] } },
    { name: "phone-landscape", use: { ...devices["Pixel 7 landscape"] } },
  ],
  webServer: {
    command: `pnpm exec serve out -l ${PORT} --no-port-switching`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
