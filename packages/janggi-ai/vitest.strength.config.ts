import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "janggi-ai-strength",
    environment: "node",
    include: ["src/**/*.strength.ts"],
    testTimeout: 1_800_000,
  },
});
