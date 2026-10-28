import { describe, expect, it } from "vitest";

import { findYak, handSum, handValue, naturalPpongMonths } from "./hand";

describe("손패 계산", () => {
  it("카드 값은 달 숫자다", () => {
    expect(handSum(["01g", "12d", "08a"])).toBe(21);
  });

  it("같은 달 석 장(자연뽕)은 합에 세지 않는다", () => {
    expect(handValue(["09a", "09r", "09p", "02p", "03p"])).toBe(5);
    expect(naturalPpongMonths(["09a", "09r", "09p", "02p"])).toEqual([9]);
    // 두 장은 그대로 센다.
    expect(handValue(["09a", "09r", "02p"])).toBe(20);
  });
});

describe("여섯 장 약", () => {
  it("또이또이: 두 장씩 세 쌍, 석 장씩 두 쌍은 0점", () => {
    expect(findYak(["01g", "01r", "05a", "05p", "09a", "09p"])).toEqual({
      kind: "ttoi",
      value: 0,
    });
    expect(findYak(["03g", "03r", "03p", "07a", "07r", "07p"])).toEqual({
      kind: "ttoi",
      value: 0,
    });
  });

  it("네 장 또이: −50점", () => {
    expect(findYak(["06a", "06r", "06p", "06q", "07a", "07r"])?.kind).toBe(
      "fourPair",
    );
  });

  it("줄: 여섯 달이 이어지면 합만큼 뺀다", () => {
    expect(findYak(["03g", "04a", "05r", "06p", "07q", "08g"])).toEqual({
      kind: "straight",
      value: -33,
    });
    // 한 달이 빠지면 줄이 아니다.
    expect(findYak(["03g", "04a", "05r", "06p", "07q", "09a"])).toBeNull();
  });

  it("10 부족과 60 이상은 −100점이고, 줄보다 좋다", () => {
    // 1·1·2·2·3·1은 또이또이가 아니다(석 장 + 두 장 + 한 장).
    expect(findYak(["01g", "01r", "01p", "02a", "02r", "03g"])).toEqual({
      kind: "under10",
      value: -100,
    });
    expect(findYak(["12g", "12a", "12r", "11g", "11d", "10a"])).toEqual({
      kind: "over60",
      value: -100,
    });
    // 1~6월 줄(21)은 10 부족이 아니다.
    expect(findYak(["01g", "02a", "03r", "04p", "05q", "06a"])?.value).toBe(
      -21,
    );
  });

  it("여섯 장이 아니면 약이 없다", () => {
    expect(findYak(["01g", "01r", "05a", "05p", "09a"])).toBeNull();
  });
});
