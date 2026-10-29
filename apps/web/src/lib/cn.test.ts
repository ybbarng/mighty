// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("뒤에 온 Tailwind 클래스가 앞의 충돌하는 클래스를 덮는다", () => {
    expect(cn("p-2", false && "hidden", "p-4")).toBe("p-4");
  });
});
