import { type HeartsRules, WINDOWS_RULES } from "./rules";

/*
 * 하트 규칙 문자열. 친구에게 보내거나 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `h1-` + 글자 다섯 개 + 넘기는 장수 + `-` + 끝 점수. 예: 윈도우 하트 `h1-cobxf3-100`
 *   1. 넘기기   c 돌아가며 / l 왼쪽만 / n 안 넘김
 *   2. 문 슛    o 다른 사람 +26 / s 내 점수 −26 / x 없음
 *   3. 하트 깨기 b 있음 / x 없음
 *   4. ♠Q가 하트를 깸 q 깸 / x 안 깸
 *   5. 첫 턴 점수 카드 f 금지 / p 허용
 *   6. ◆J −10  j 있음 / (생략) 없음 — 다섯째 뒤에 j를 붙인다
 */

export type DecodeResult =
  | { ok: true; rules: HeartsRules }
  | { ok: false; reason: string };

export function encodeHeartsRules(rules: HeartsRules): string {
  const passing = { cycle: "c", left: "l", none: "n" }[rules.passing];
  const moon = { others: "o", self: "s", off: "x" }[rules.moon];
  return [
    "h1-",
    passing,
    moon,
    rules.heartsBreak ? "b" : "x",
    rules.queenBreaksHearts ? "q" : "x",
    rules.firstTrickPoints ? "p" : "f",
    rules.jackOfDiamonds ? "j" : "",
    String(rules.passCount),
    "-",
    String(rules.endScore),
  ].join("");
}

export function decodeHeartsRules(text: string): DecodeResult {
  const match = /^h1-([cln])([osx])([bx])([qx])([fp])(j?)(\d)-(\d{2,4})$/.exec(
    text.trim(),
  );
  if (!match) return { ok: false, reason: "하트 규칙 문자열 형식이 아니다" };
  const [, passing, moon, breakFlag, queen, first, jack, count, end] = match;
  const endScore = Number(end);
  const passCount = Number(count);
  if (endScore < 10) return { ok: false, reason: "끝 점수가 너무 작다" };
  if (passCount < 1 || passCount > 4)
    return { ok: false, reason: "넘기는 장수는 1~4장이다" };
  return {
    ok: true,
    rules: {
      passing: passing === "c" ? "cycle" : passing === "l" ? "left" : "none",
      passCount,
      moon: moon === "o" ? "others" : moon === "s" ? "self" : "off",
      heartsBreak: breakFlag === "b",
      queenBreaksHearts: queen === "q",
      firstTrickPoints: first === "p",
      jackOfDiamonds: jack === "j",
      endScore,
    },
  };
}

export const WINDOWS_RULE_CODE = encodeHeartsRules(WINDOWS_RULES);
