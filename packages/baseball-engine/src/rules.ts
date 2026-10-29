import {
  decodeTimePreset,
  encodeTimePreset,
  type TimePreset,
} from "@mighty/engine";

export const PLAYER_COUNT = 2;

/**
 * 방식(docs/34 1절).
 * - duel 서로 맞히기: 둘 다 비밀 수를 정하고 번갈아 상대 수를 맞힌다
 * - puzzle 퍼즐: 0번 자리가 1번 자리(컴퓨터)의 수만 맞힌다. 혼자 하기에서만 쓴다
 */
export type Mode = "duel" | "puzzle";

export interface BaseballRules {
  /** 비밀 수 자릿수 */
  digits: 3 | 4;
  /** 0을 쓸 수 있나(없으면 1~9) */
  zero: boolean;
  mode: Mode;
  /**
   * 공정 규칙: 먼저 맞히는 쪽(선)이 맞히면 후공에게 한 번 더 기회를 준다.
   * 그 기회에 후공도 맞히면 비긴다. 끄면 먼저 맞힌 사람이 바로 이긴다
   */
  fair: boolean;
  /** 먼저 이 판 수만큼 이기면 게임이 끝난다(1~5). 퍼즐은 1 */
  winsToFinish: number;
  /** 개인 시간(맞힐 차례에만 간다, docs/24). 없으면 시간 없음 */
  time?: TimePreset;
}

export const STANDARD_RULES: BaseballRules = {
  digits: 3,
  zero: false,
  mode: "duel",
  fair: true,
  winsToFinish: 1,
};

/** 퍼즐(컴퓨터 수만 맞히기) 기본 규칙 */
export const PUZZLE_RULES: BaseballRules = {
  ...STANDARD_RULES,
  mode: "puzzle",
};

/*
 * 숫자야구 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `b1-` + 자릿수(3·4) + 0 쓰기(z 씀 / n 안 씀) + 방식(d 서로 / p 퍼즐) + 공정(f 켬 / x 끔)
 *       + 이길 판 수(1~5) + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 세 자리·1~9·서로·공정·한 판 `b1-3ndf1`, 네 자리·0 씀·빠른 시간이면 `b1-4zdf1-t1`
 */
export function encodeBaseballRules(rules: BaseballRules): string {
  return `b1-${rules.digits}${rules.zero ? "z" : "n"}${rules.mode === "duel" ? "d" : "p"}${rules.fair ? "f" : "x"}${rules.winsToFinish}${encodeTimePreset(rules.time ?? "none")}`;
}

export function decodeBaseballRules(
  text: string,
): { ok: true; rules: BaseballRules } | { ok: false; reason: string } {
  const match = /^b1-([34])([zn])([dp])([fx])([1-5])(-t\d)?$/.exec(text.trim());
  if (!match)
    return { ok: false, reason: "숫자야구 규칙 문자열 형식이 아니다" };
  const [, digits, zero, mode, fair, wins, tail] = match;
  const time = decodeTimePreset(tail);
  if (time === null) return { ok: false, reason: "모르는 시간 규칙이다" };
  if (mode === "p" && wins !== "1")
    return { ok: false, reason: "퍼즐은 한 판만 한다" };
  return {
    ok: true,
    rules: {
      digits: Number(digits) as 3 | 4,
      zero: zero === "z",
      mode: mode === "d" ? "duel" : "puzzle",
      fair: fair === "f",
      winsToFinish: Number(wins),
      ...(time === "none" ? {} : { time }),
    },
  };
}

/** 비밀 수를 정하는 자리들. 퍼즐은 컴퓨터(1번)만 정한다 */
export function secretHolders(rules: BaseballRules): number[] {
  return rules.mode === "duel" ? [0, 1] : [1];
}

/** 쓸 수 있는 숫자들 */
export function digitPool(rules: Pick<BaseballRules, "zero">): string[] {
  return (rules.zero ? "0123456789" : "123456789").split("");
}
