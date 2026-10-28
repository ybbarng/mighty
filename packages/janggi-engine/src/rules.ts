/** 판: 가로 9줄 × 세로 10줄의 교차점 */
export const WIDTH = 9;
export const HEIGHT = 10;
export const CELLS = WIDTH * HEIGHT;
export const PLAYER_COUNT = 2;

/** 이 수가 지나면(두 편 합) 점수로 가린다 */
export const MOVE_LIMIT = 200;

/**
 * 빅장(두 궁이 사이에 기물 없이 마주 봄, docs/22 1절)
 * - score: 둘 수 있다. 빅장이 되면 그 판을 점수로 가린다(기본)
 * - forbidden: 빅장이 되는 수는 둘 수 없다
 */
export type Bikjang = "score" | "forbidden";

export interface JanggiRules {
  bikjang: Bikjang;
  /** 먼저 이 판 수만큼 이기면 게임이 끝난다(1~5) */
  winsToFinish: number;
}

export const STANDARD_RULES: JanggiRules = {
  bikjang: "score",
  winsToFinish: 1,
};

export const BIKJANG_NAMES: Record<Bikjang, string> = {
  score: "빅장은 점수로",
  forbidden: "빅장 금지",
};

/*
 * 장기 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `j1-` + 빅장 글자(s 점수 / f 금지) + 이길 판 수. 예: 기본 한 판 `j1-s1`
 */
const BIKJANG_CODES: Record<Bikjang, string> = { score: "s", forbidden: "f" };

export function encodeJanggiRules(rules: JanggiRules): string {
  return `j1-${BIKJANG_CODES[rules.bikjang]}${rules.winsToFinish}`;
}

export function decodeJanggiRules(
  text: string,
): { ok: true; rules: JanggiRules } | { ok: false; reason: string } {
  const match = /^j1-([sf])([1-5])$/.exec(text.trim());
  if (!match) return { ok: false, reason: "장기 규칙 문자열 형식이 아니다" };
  const [, code, wins] = match;
  const bikjang = (Object.keys(BIKJANG_CODES) as Bikjang[]).find(
    (b) => BIKJANG_CODES[b] === code,
  ) as Bikjang;
  return { ok: true, rules: { bikjang, winsToFinish: Number(wins) } };
}
