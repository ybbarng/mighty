import { describe, expect, it } from "vitest";

import {
  allNumbers,
  candidatesFor,
  commitmentOf,
  derivedSecret,
  fixedKey,
  isPossibleScore,
  isValidNumber,
  score,
  seatKey,
} from "./numbers";
import {
  decodeBaseballRules,
  encodeBaseballRules,
  STANDARD_RULES,
} from "./rules";
import { sha256Hex } from "./sha256";

describe("SHA-256(동기)", () => {
  it("표준 시험 값과 같다", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("여러 길이(블록 경계 포함)와 한글에서 node:crypto로 미리 잰 값과 같다", () => {
    const cases: [string, string][] = [
      [
        "a".repeat(55),
        "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
      ],
      [
        "a".repeat(56),
        "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
      ],
      [
        "a".repeat(64),
        "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
      ],
      [
        "a".repeat(119),
        "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb",
      ],
      [
        "nb1|382|0123456789abcdef0123456789abcdef",
        "228bdb24d1cad7ba9066afa1837ddd36f736621fb317c12a09d6274be20929c3",
      ],
      [
        "숫자야구 약속",
        "e6cc9d4655822a62ff340b1892031ca2b32dc54bc1a0fb7b6161c897dc991f26",
      ],
    ];
    for (const [text, hex] of cases) expect(sha256Hex(text)).toBe(hex);
  });
});

describe("수와 판정", () => {
  it("스트라이크는 자리와 숫자, 볼은 숫자만 맞는 것", () => {
    expect(score("123", "123")).toEqual({ strikes: 3, balls: 0 });
    expect(score("123", "132")).toEqual({ strikes: 1, balls: 2 });
    expect(score("123", "456")).toEqual({ strikes: 0, balls: 0 });
    expect(score("4567", "7654")).toEqual({ strikes: 0, balls: 4 });
    expect(score("4567", "4518")).toEqual({ strikes: 2, balls: 0 });
  });

  it("규칙에 맞는 수: 자릿수, 겹치지 않음, 0은 쓸 때만", () => {
    expect(isValidNumber("382", STANDARD_RULES)).toBe(true);
    expect(isValidNumber("388", STANDARD_RULES)).toBe(false);
    expect(isValidNumber("302", STANDARD_RULES)).toBe(false);
    expect(isValidNumber("302", { digits: 3, zero: true })).toBe(true);
    expect(isValidNumber("3821", STANDARD_RULES)).toBe(false);
    expect(isValidNumber(382, STANDARD_RULES)).toBe(false);
  });

  it("나올 수 있는 답만 받는다(2S 1B는 없다)", () => {
    expect(isPossibleScore({ strikes: 2, balls: 1 }, 3)).toBe(false);
    expect(isPossibleScore({ strikes: 3, balls: 1 }, 4)).toBe(false);
    expect(isPossibleScore({ strikes: 1, balls: 3 }, 4)).toBe(true);
    expect(isPossibleScore({ strikes: 2, balls: 2 }, 3)).toBe(false);
    expect(isPossibleScore({ strikes: -1, balls: 0 }, 3)).toBe(false);
    expect(isPossibleScore({ strikes: 0.5, balls: 0 }, 3)).toBe(false);
  });

  it("모든 수의 개수", () => {
    expect(allNumbers({ digits: 3, zero: false })).toHaveLength(504);
    expect(allNumbers({ digits: 3, zero: true })).toHaveLength(720);
    expect(allNumbers({ digits: 4, zero: false })).toHaveLength(3024);
    expect(allNumbers({ digits: 4, zero: true })).toHaveLength(5040);
  });

  it("단서와 어긋나지 않는 후보만 남는다", () => {
    const clues = [
      { guess: "123", ...score("749", "123") },
      { guess: "456", ...score("749", "456") },
      { guess: "789", ...score("749", "789") },
    ];
    const left = candidatesFor(STANDARD_RULES, clues);
    expect(left).toContain("749");
    for (const n of left)
      for (const c of clues)
        expect(score(n, c.guess)).toEqual({
          strikes: c.strikes,
          balls: c.balls,
        });
  });
});

describe("약속과 컴퓨터 비밀", () => {
  it("약속은 비밀과 소금이 하나라도 다르면 달라진다", () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const other = "f123456789abcdef0123456789abcdef";
    expect(commitmentOf("382", salt)).toMatch(/^[0-9a-f]{64}$/);
    expect(commitmentOf("382", salt)).not.toBe(commitmentOf("383", salt));
    expect(commitmentOf("382", salt)).not.toBe(commitmentOf("382", other));
  });

  it("같은 재료·같은 판이면 같은 비밀, 판이 바뀌면 다른 비밀. 늘 규칙에 맞는다", () => {
    const rules = { digits: 4 as const, zero: true };
    const key = seatKey(42, 1);
    expect(derivedSecret(key, 1, rules)).toEqual(derivedSecret(key, 1, rules));
    const seen = new Set<string>();
    for (let round = 1; round <= 30; round++) {
      const { secret, salt } = derivedSecret(key, round, rules);
      expect(isValidNumber(secret, rules)).toBe(true);
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
      seen.add(secret);
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(seatKey(42, 0)).not.toBe(seatKey(42, 1));
  });

  it("정해 둔 재료는 그 비밀을 낸다(튜토리얼 장면)", () => {
    expect(derivedSecret(fixedKey("749"), 1, STANDARD_RULES).secret).toBe(
      "749",
    );
  });
});

describe("규칙 문자열", () => {
  it("만들고 다시 읽으면 같다", () => {
    const cases = [
      STANDARD_RULES,
      {
        digits: 4 as const,
        zero: true,
        mode: "duel" as const,
        fair: false,
        winsToFinish: 3,
        time: "fast" as const,
      },
      { ...STANDARD_RULES, mode: "puzzle" as const },
    ];
    for (const rules of cases) {
      const code = encodeBaseballRules(rules);
      expect(decodeBaseballRules(code)).toEqual({ ok: true, rules });
    }
    expect(encodeBaseballRules(STANDARD_RULES)).toBe("b1-3ndf1");
  });

  it("틀린 문자열은 거절한다", () => {
    expect(decodeBaseballRules("o1-s1").ok).toBe(false);
    expect(decodeBaseballRules("b1-5ndf1").ok).toBe(false);
    expect(decodeBaseballRules("b1-3ndf1-t9").ok).toBe(false);
    expect(decodeBaseballRules("b1-3npf2").ok).toBe(false);
  });
});
