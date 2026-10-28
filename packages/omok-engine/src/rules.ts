/** 판 한 변의 줄 수 */
export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const PLAYER_COUNT = 2;

/**
 * 규칙 종류(docs/20 1절).
 * - standard 일반: 정확히 다섯이 이긴다. 흑·백 모두 3·3 금지
 * - free 자유: 다섯 이상이 이긴다. 금지 없음
 * - renju 렌주: 흑은 정확히 다섯, 백은 다섯 이상. 흑만 3·3·4·4·장목 금지
 */
export type Variant = "standard" | "free" | "renju";

export interface OmokRules {
  variant: Variant;
  /** 먼저 이 판 수만큼 이기면 게임이 끝난다(1~5) */
  winsToFinish: number;
}

export const STANDARD_RULES: OmokRules = {
  variant: "standard",
  winsToFinish: 1,
};

export const VARIANT_NAMES: Record<Variant, string> = {
  standard: "일반",
  free: "자유",
  renju: "렌주",
};

/*
 * 오목 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `o1-` + 규칙 글자(s 일반 / f 자유 / r 렌주) + 이길 판 수. 예: 일반 한 판 `o1-s1`
 */
const VARIANT_CODES: Record<Variant, string> = {
  standard: "s",
  free: "f",
  renju: "r",
};

export function encodeOmokRules(rules: OmokRules): string {
  return `o1-${VARIANT_CODES[rules.variant]}${rules.winsToFinish}`;
}

export function decodeOmokRules(
  text: string,
): { ok: true; rules: OmokRules } | { ok: false; reason: string } {
  const match = /^o1-([sfr])([1-5])$/.exec(text.trim());
  if (!match) return { ok: false, reason: "오목 규칙 문자열 형식이 아니다" };
  const [, code, wins] = match;
  const variant = (Object.keys(VARIANT_CODES) as Variant[]).find(
    (v) => VARIANT_CODES[v] === code,
  ) as Variant;
  return { ok: true, rules: { variant, winsToFinish: Number(wins) } };
}
