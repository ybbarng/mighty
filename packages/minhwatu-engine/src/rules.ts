/*
 * 민화투 규칙(docs/29). 인원·판 수·약 점수·초단·사오동을 고른다.
 * 규칙 문자열은 온라인 방에서 나눈다. 형식: `m1-` + 인원(2~4) + 판 수(1~9) + 약 점수(2 = 20점, 1 = 10점)
 * + 초단(1 인정, 0 안 함) + 사오동(1 인정, 0 안 함). 예: 기본 `m1-33210`
 */

export type PlayerCount = 2 | 3 | 4;

export interface MinhwatuRules {
  players: PlayerCount;
  /** 몇 판 하고 합계로 가리나(1~9) */
  rounds: number;
  /** 초약·풍약·비약 점수(20 또는 지역에 따라 10) */
  yakScore: 10 | 20;
  /** 초단(4·5·7월 띠 셋)을 30점 약으로 인정한다 */
  chodan: boolean;
  /** 사오동(11월 오동 4장)을 40점 약으로 인정한다 */
  saodong: boolean;
}

export const STANDARD_RULES: MinhwatuRules = {
  players: 3,
  rounds: 3,
  yakScore: 20,
  chodan: true,
  saodong: false,
};

/** 인원별 손패·바닥 장수(나무위키 "민화투" 표). 남는 카드는 더미 */
export const DEAL_SIZES: Record<PlayerCount, { hand: number; floor: number }> =
  {
    2: { hand: 10, floor: 8 },
    3: { hand: 7, floor: 6 },
    4: { hand: 5, floor: 8 },
  };

/** 카드 점수 합(광 5×20 + 열끗 9×10 + 띠 10×5) */
export const TOTAL_POINTS = 240;

/** 인원별 기본 점수(본). 모두 같은 몫을 가졌다고 보고 그만큼 뺀다(2명 120, 3명 80, 4명 60) */
export function baseScore(players: PlayerCount): number {
  return TOTAL_POINTS / players;
}

export function encodeMinhwatuRules(rules: MinhwatuRules): string {
  return `m1-${rules.players}${rules.rounds}${rules.yakScore === 20 ? 2 : 1}${rules.chodan ? 1 : 0}${rules.saodong ? 1 : 0}`;
}

export function decodeMinhwatuRules(
  text: string,
): { ok: true; rules: MinhwatuRules } | { ok: false; reason: string } {
  const match = /^m1-([234])([1-9])([12])([01])([01])$/.exec(text.trim());
  if (!match) return { ok: false, reason: "민화투 규칙 문자열 형식이 아니다" };
  const [, players, rounds, yak, chodan, saodong] = match;
  return {
    ok: true,
    rules: {
      players: Number(players) as PlayerCount,
      rounds: Number(rounds),
      yakScore: yak === "2" ? 20 : 10,
      chodan: chodan === "1",
      saodong: saodong === "1",
    },
  };
}
