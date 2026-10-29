// @vitest-environment node
import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { cardTipText } from "./terms";

const rules = presetRules("standard5");

describe("카드 툴팁 문구", () => {
  it("같은 무늬에서 아직 안 나온 더 높은 카드를 보여 준다", () => {
    // ♥10, ♥Q가 나왔고 ♥J·K·A는 아직이다(선배 글의 예).
    expect(cardTipText("H9", rules, "S", new Set(["H10", "HQ"]))).toBe(
      "♥9 (A K J)",
    );
  });

  it("더 높은 카드가 다 나왔으면 최고패", () => {
    expect(cardTipText("HQ", rules, "S", new Set(["HA", "HK"]))).toBe(
      "♥Q (최고패)",
    );
  });

  it("마이티는 높은 카드로 치지 않고, 마이티·조커는 이름만", () => {
    // 기루다 ♥이면 마이티는 ♠A다. ♠K 위에는 마이티를 빼면 아무것도 없다.
    expect(cardTipText("SK", rules, "H", new Set())).toBe("♠K (최고패)");
    expect(cardTipText("SA", rules, "H", new Set())).toBe("마이티");
    expect(cardTipText("JK", rules, "H", new Set())).toBe("조커");
  });
});
