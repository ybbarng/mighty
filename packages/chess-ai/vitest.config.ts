import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "chess-ai",
    environment: "node",
    // 봇끼리 여러 판을 두는 세기 비교는 오래 걸려 `pnpm bench`로 따로 돌린다.
    exclude: ["**/node_modules/**", "**/*.strength.ts"],
  },
});
