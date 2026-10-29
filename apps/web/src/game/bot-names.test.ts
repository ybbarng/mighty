// @vitest-environment node
import { describe, expect, it } from "vitest";

import { botName } from "./bot-names";

describe("컴퓨터 이름", () => {
  it("정해 둔 이름이 없으면 기본 이름을 쓴다", () => {
    expect(botName([], 1)).toBe("민준");
    expect(botName(["", "  "], 2)).toBe("서연");
  });

  it("정해 둔 이름이 있으면 그 이름", () => {
    expect(botName(["철수"], 1)).toBe("철수");
  });

  it("기본 이름보다 자리가 많으면 컴퓨터 n", () => {
    expect(botName([], 7)).toBe("컴퓨터 7");
  });
});
