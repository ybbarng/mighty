import { describe, expect, it } from "vitest";

import { presetRules } from "./presets";
import { type ScoreInput, scoreRound } from "./scoring";

const standard = presetRules("standard5");

/** 5마, 주공 0번, 프렌드 1번, 모두 100에서 시작. 여당 득점은 주공에게, 야당 득점은 2번에게 몰아 둔다. */
function input(
  overrides: Partial<ScoreInput> & { ruling: number; opposition?: number },
): ScoreInput {
  const { ruling, opposition = 20 - ruling, ...rest } = overrides;
  return {
    rules: standard,
    goal: { kiruda: "D", score: 15 },
    players: [0, 1, 2, 3, 4],
    declarer: 0,
    friend: 1,
    noFriendDeclared: false,
    scoredBySeat: [ruling, 0, opposition, 0, 0],
    discardedPoints: 0,
    money: [100, 100, 100, 100, 100],
    ...rest,
  };
}

describe("기본 이동량", () => {
  it("나무위키 예시: 섯다리 15에 19장이면 8, 주공 +16, 프렌드 +8, 야당 각자 -8", () => {
    const result = scoreRound(input({ ruling: 19 }));
    expect(result.rulingWon).toBe(true);
    expect(result.moved).toBe(8);
    expect(result.money).toEqual([116, 108, 92, 92, 92]);
  });

  it("공약에 못 미치면 야당이 이기고 `목-득`만큼 받는다", () => {
    const result = scoreRound(input({ ruling: 12 }));
    expect(result.rulingWon).toBe(false);
    expect(result.moved).toBe(3);
    expect(result.money).toEqual([94, 97, 103, 103, 103]);
  });

  it("버린 카드의 점수는 여당 득점으로 친다", () => {
    const result = scoreRound(
      input({ ruling: 14, opposition: 4, discardedPoints: 2 }),
    );
    expect(result.rulingPoints).toBe(16);
    expect(result.rulingWon).toBe(true);
  });

  it("신촌 5마: 버린 카드의 점수는 야당 득점", () => {
    const rules = presetRules("sinchon5");
    const result = scoreRound(
      input({ rules, ruling: 14, opposition: 4, discardedPoints: 2 }),
    );
    expect(result.rulingPoints).toBe(14);
    expect(result.oppositionPoints).toBe(6);
  });

  it.each([
    ["risk40", 7],
    ["call", 6],
    ["eyeForEye", 4],
    ["modifiedEyeForEye", 5],
    ["base10", 9],
    ["base13", 6],
    ["baseMin", 6],
  ] as const)(
    "여당 승리 계산 %s: 15 공약에 19장이면 %d",
    (winScoring, moved) => {
      const result = scoreRound(
        input({ rules: { ...standard, winScoring }, ruling: 19 }),
      );
      expect(result.moved).toBe(moved);
    },
  );

  it("toothForTooth: 최소 공약에도 못 미치면 더 많이 잃는다", () => {
    const rules = { ...standard, loseScoring: "toothForTooth" as const };
    expect(scoreRound(input({ rules, ruling: 14 })).moved).toBe(1);
    // (15-13) + (13-10)×2
    expect(scoreRound(input({ rules, ruling: 10 })).moved).toBe(8);
  });
});

describe("배수", () => {
  it("런(20장)은 2배", () => {
    const result = scoreRound(input({ ruling: 20 }));
    expect(result.moved).toBe(18);
    expect(result.multipliers).toEqual(["run"]);
  });

  it("노기루다로 이기면 2배", () => {
    const result = scoreRound(
      input({ goal: { kiruda: "NT", score: 15 }, ruling: 19 }),
    );
    expect(result.moved).toBe(16);
    expect(result.multipliers).toEqual(["noKiruda"]);
  });

  it("백런: 야당이 공약 수 이상 가져가면 2배 (대전 6마식 규칙)", () => {
    const rules = { ...standard, doubleForReverseRun: true };
    const result = scoreRound(input({ rules, ruling: 5, opposition: 15 }));
    expect(result.moved).toBe(20);
    expect(result.multipliers).toEqual(["reverseRun"]);
  });

  it("런 고정액 20", () => {
    const rules = { ...standard, staticRun: true };
    expect(scoreRound(input({ rules, ruling: 20 })).moved).toBe(20);
  });
});

describe("분배", () => {
  it("노프렌드면 주공이 야당 4명분을 모두 받는다", () => {
    const result = scoreRound(
      input({ friend: null, noFriendDeclared: true, ruling: 19 }),
    );
    expect(result.money).toEqual([132, 92, 92, 92, 92]);
  });

  it("돈의 합은 늘 그대로다", () => {
    for (const ruling of [0, 7, 12, 15, 19, 20]) {
      const result = scoreRound(input({ ruling }));
      expect(result.money.reduce((a, b) => a + b, 0)).toBe(500);
    }
  });

  it("0 밑으로 내려가지 않는다. 여당이 이기면 모자란 만큼 주공이 덜 받는다", () => {
    const result = scoreRound(
      input({ ruling: 20, money: [100, 100, 10, 100, 100] }),
    );
    expect(result.money[2]).toBe(0);
    expect(result.money.reduce((a, b) => a + b, 0)).toBe(410);
  });
});
