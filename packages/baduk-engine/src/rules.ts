import {
  decodeTimePreset,
  encodeTimePreset,
  type TimePreset,
} from "@mighty/engine";

export const PLAYER_COUNT = 2;

/** 판 크기(줄 수). 9줄이 기본이다 */
export type BoardSize = 9 | 13 | 19;
export const BOARD_SIZES: readonly BoardSize[] = [9, 13, 19];

/** 덤: 흑이 먼저 두는 대신 백이 받는 점수. 0.5가 붙어 비김이 없다 */
export type Komi = 6.5 | 7.5;
export const KOMIS: readonly Komi[] = [7.5, 6.5];

export interface BadukRules {
  size: BoardSize;
  komi: Komi;
  /** 먼저 이 판 수만큼 이기면 게임이 끝난다(1~5) */
  winsToFinish: number;
  /** 개인 시간(기본 시간 + 초읽기, docs/24). 없으면 시간 없음 */
  time?: TimePreset;
}

export const STANDARD_RULES: BadukRules = {
  size: 9,
  komi: 7.5,
  winsToFinish: 1,
};

/** 이 수가 지나면(두 편 합, 쉬기 포함) 그 자리에서 센다. 판이 끝나지 않는 일을 막는 안전장치다 */
export function moveLimit(size: BoardSize): number {
  return size * size * 3;
}

/*
 * 바둑 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `b1-` + 판 크기 + `k` + 덤 ×10 + `w` + 이길 판 수 + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 9줄 덤 7.5 한 판 `b1-9k75w1`, 19줄 덤 6.5 3판 2승 빠른 시간 `b1-19k65w2-t1`
 */
export function encodeBadukRules(rules: BadukRules): string {
  return `b1-${rules.size}k${rules.komi * 10}w${rules.winsToFinish}${encodeTimePreset(rules.time ?? "none")}`;
}

export function decodeBadukRules(
  text: string,
): { ok: true; rules: BadukRules } | { ok: false; reason: string } {
  const match = /^b1-(9|13|19)k(65|75)w([1-5])(-t\d)?$/.exec(text.trim());
  if (!match) return { ok: false, reason: "바둑 규칙 문자열 형식이 아니다" };
  const [, size, komi, wins, tail] = match;
  const time = decodeTimePreset(tail);
  if (time === null) return { ok: false, reason: "모르는 시간 규칙이다" };
  return {
    ok: true,
    rules: {
      size: Number(size) as BoardSize,
      komi: (Number(komi) / 10) as Komi,
      winsToFinish: Number(wins),
      ...(time === "none" ? {} : { time }),
    },
  };
}
