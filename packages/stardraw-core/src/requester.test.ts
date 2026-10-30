import { describe, expect, it } from "vitest";

import { requesterFold, requesterProblem } from "./requester";

describe("확인하는 분 이름", () => {
  it("보통 이름은 받는다", () => {
    for (const name of ["Brice", "철수", "김영희 팀장", "별 보는 사람"])
      expect(requesterProblem(name), name).toBeNull();
  });

  it("비었거나 40자를 넘으면 거절", () => {
    expect(requesterProblem("   ")).toMatch(/1~40자/);
    expect(requesterProblem("가".repeat(41))).toMatch(/1~40자/);
    expect(requesterProblem("가".repeat(40))).toBeNull();
  });

  it("우주국·운영자 행세는 공백·기호·전각·대소문자를 섞어도 거절", () => {
    for (const name of [
      "카노푸스 우주국",
      "우 주 국",
      "우.주.국",
      "국장",
      "김국장",
      "카-노-푸-스",
      "운영자",
      "운영팀",
      "Canopus",
      "C A N O P U S",
      "ｃａｎｏｐｕｓ",
      "KANOPUS office",
    ])
      expect(requesterProblem(name), name).toMatch(/우주국·운영자/);
  });

  it("비교용 꼴은 글자·숫자만 남긴 소문자", () => {
    expect(requesterFold(" Ca-No_PUS! 1 ")).toBe("canopus1");
  });
});
