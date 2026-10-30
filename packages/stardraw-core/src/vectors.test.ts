import { describe, expect, it } from "vitest";
import { TEST_VECTORS } from "./vectors";

// 공개 시험 값(검증하기 페이지에 그대로 실린다)이 이 패키지의 계산과 같은지
describe("공개 시험 값", () => {
  for (const group of TEST_VECTORS) {
    for (const v of group.vectors) {
      it(`${group.title}: ${v.title} (${v.input})`, async () => {
        expect(await v.compute()).toBe(v.expected);
      });
    }
  }
});
