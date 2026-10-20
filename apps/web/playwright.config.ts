import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/** 실제 정적 빌드(out/)를 띄워 화면 크기별로 한 판을 끝까지 해 본다 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
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
