/*
 * 고스톱 규칙(docs/28). 맞고(2명)와 고스톱(3명)을 함께 다룬다.
 */

/** 국진(9월 열끗)을 어떻게 세나. best: 열끗과 쌍피 가운데 점수가 더 나는 쪽 / animal: 늘 열끗 */
export type GukjinRule = "best" | "animal";

export interface GostopRules {
  /** 2명 맞고, 3명 고스톱 */
  players: 2 | 3;
  /** 이만큼 판을 하면 게임이 끝난다(1~20) */
  rounds: number;
  gukjin: GukjinRule;
}

export const MATGO_RULES: GostopRules = {
  players: 2,
  rounds: 3,
  gukjin: "best",
};

export const GOSTOP3_RULES: GostopRules = {
  players: 3,
  rounds: 3,
  gukjin: "best",
};

export const MAX_ROUNDS = 20;

/** 고·스톱을 물을 수 있는 점수: 맞고 7점, 3명 3점 */
export function goThreshold(rules: GostopRules): number {
  return rules.players === 2 ? 7 : 3;
}

/** 손패·바닥 장수: 맞고 10장·8장, 3명 7장·6장 */
export function dealSizes(rules: GostopRules): { hand: number; floor: number } {
  return rules.players === 2 ? { hand: 10, floor: 8 } : { hand: 7, floor: 6 };
}

/** 총통(처음 받은 손패에 같은 달 넉 장)으로 이기면 받는 점수 */
export const CHONGTONG_POINTS = 10;

/** 진 사람의 피가 이보다 적으면 피박 */
export const PIBAK_UNDER = 5;

/** 이긴 사람의 열끗이 이만큼이면 멍박(멍텅구리) */
export const MEONGBAK_ANIMALS = 7;

/*
 * 고스톱 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `g1-` + 인원(2·3) + 국진 글자(b 좋은 쪽 / a 열끗) + 판 수(1~20).
 * 예: 맞고 3판 `g1-2b3`, 3명 5판 국진은 열끗만 `g1-3a5`
 */
export function encodeGostopRules(rules: GostopRules): string {
  return `g1-${rules.players}${rules.gukjin === "best" ? "b" : "a"}${rules.rounds}`;
}

export function decodeGostopRules(
  text: string,
): { ok: true; rules: GostopRules } | { ok: false; reason: string } {
  const match = /^g1-([23])([ba])([1-9]\d?)$/.exec(text.trim());
  if (!match) return { ok: false, reason: "고스톱 규칙 문자열 형식이 아니다" };
  const [, players, gukjin, rounds] = match;
  const count = Number(rounds);
  if (count > MAX_ROUNDS)
    return { ok: false, reason: `판 수는 ${MAX_ROUNDS}판까지다` };
  return {
    ok: true,
    rules: {
      players: players === "2" ? 2 : 3,
      rounds: count,
      gukjin: gukjin === "b" ? "best" : "animal",
    },
  };
}
