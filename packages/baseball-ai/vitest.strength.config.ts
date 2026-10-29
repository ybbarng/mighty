import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "baseball-ai-strength",
    environment: "node",
    include: ["src/**/*.strength.ts"],
    testTimeout: 1_800_000,
  },
});
