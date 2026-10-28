import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "baduk-engine",
    environment: "node",
  },
});
