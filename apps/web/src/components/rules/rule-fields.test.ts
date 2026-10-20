import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { BOOL_GROUPS, DEAL_MISS_FIELDS } from "./rule-fields";

describe("규칙 설정 화면", () => {
  it("켜고 끄는 옵션을 빠짐없이 보여 준다", () => {
    const rules = presetRules("standard5");
    const booleanKeys = Object.entries(rules)
      .filter(([, v]) => typeof v === "boolean")
      .map(([k]) => k)
      // 원작에서도 진행 코드가 쓰지 않는 옵션이라 화면에 두지 않는다(04 문서 7.3절).
      .filter((k) => k !== "revealFriendOnScore");
    const shown = BOOL_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(shown)).toEqual(new Set(booleanKeys));
    expect(shown).toHaveLength(new Set(shown).size);
  });

  it("딜미스 옵션 8개를 모두 보여 준다", () => {
    const keys = Object.keys(presetRules("standard5").dealMiss);
    expect(new Set(DEAL_MISS_FIELDS.map((f) => f.key))).toEqual(new Set(keys));
  });
});
