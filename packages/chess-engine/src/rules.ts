import {
  decodeTimePreset,
  encodeTimePreset,
  type TimePreset,
} from "@mighty/engine";

/** 판: 8 × 8 칸 */
export const SIZE = 8;
export const SQUARES = SIZE * SIZE;
export const PLAYER_COUNT = 2;

/** 폰을 움직이거나 잡지 않은 수가 이만큼(두 편 합 100수 = 50수) 이어지면 비긴다 */
export const FIFTY_MOVE_PLIES = 100;

export interface ChessRules {
  /** 먼저 이 판 수만큼 이기면 게임이 끝난다(1~5). 비긴 판은 누구의 승리도 아니다 */
  winsToFinish: number;
  /** 개인 시간(기본 시간 + 초읽기, docs/24). 없으면 시간 없음 */
  time?: TimePreset;
}

export const STANDARD_RULES: ChessRules = { winsToFinish: 1 };

/*
 * 체스 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `c1-w` + 이길 판 수(1~5) + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 기본 한 판 `c1-w1`, 3판 2승에 보통 시간이면 `c1-w2-t2`
 */
export function encodeChessRules(rules: ChessRules): string {
  return `c1-w${rules.winsToFinish}${encodeTimePreset(rules.time ?? "none")}`;
}

export function decodeChessRules(
  text: string,
): { ok: true; rules: ChessRules } | { ok: false; reason: string } {
  const match = /^c1-w([1-5])(-t\d)?$/.exec(text.trim());
  if (!match) return { ok: false, reason: "체스 규칙 문자열 형식이 아니다" };
  const [, wins, tail] = match;
  const time = decodeTimePreset(tail);
  if (time === null) return { ok: false, reason: "모르는 시간 규칙이다" };
  return {
    ok: true,
    rules: {
      winsToFinish: Number(wins),
      ...(time === "none" ? {} : { time }),
    },
  };
}
