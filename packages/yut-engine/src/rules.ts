import {
  decodeTimePreset,
  encodeTimePreset,
  type TimePreset,
} from "@mighty/engine";

/**
 * 윷놀이 규칙(docs/37 1절). 지역마다 다른 것은 모두 여기서 고른다.
 * - players 인원(2~4), mode 각자(solo)·편(team, 4인만: 0·2번 자리 한 편, 1·3번 자리 한 편)
 * - pieces 편마다 말 수(2~5)
 * - backDo 빽도(표시한 가락 하나만 평평하면 한 칸 뒤로)
 * - flatPercent 한 가락이 평평한 면으로 떨어질 확률(%). 60이 실제 윷에 가깝고 50은 고르게
 * - landOnHome 참먹이에 정확히 서도 나나(끄면 지나야 난다)
 */
export type Mode = "solo" | "team";

export interface YutRules {
  players: 2 | 3 | 4;
  mode: Mode;
  pieces: number;
  backDo: boolean;
  flatPercent: 50 | 60;
  landOnHome: boolean;
  /** 개인 시간(기본 시간 + 초읽기, docs/24·docs/37 4절). 없으면 시간 없음 */
  time?: TimePreset;
}

export const STANDARD_RULES: YutRules = {
  players: 2,
  mode: "solo",
  pieces: 4,
  backDo: true,
  flatPercent: 60,
  landOnHome: false,
};

/** 2:2 편 놀이 기본 규칙 */
export const TEAM_RULES: YutRules = {
  ...STANDARD_RULES,
  players: 4,
  mode: "team",
};

/*
 * 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `y1-` + 인원(2·3·4) + 방식(s 각자 / t 편) + 말 수(2~5) + 빽도(b 있음 / n 없음)
 *       + 확률(6 60% / 5 50%) + 참먹이(p 지나야 남 / l 서면 남)
 *       + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 기본 `y1-2s4b6p`, 2:2 편 놀이 `y1-4t4b6p`, 빠른 시간이면 `y1-2s4b6p-t1`
 */
export function encodeYutRules(rules: YutRules): string {
  return `y1-${rules.players}${rules.mode === "team" ? "t" : "s"}${rules.pieces}${rules.backDo ? "b" : "n"}${rules.flatPercent === 60 ? "6" : "5"}${rules.landOnHome ? "l" : "p"}${encodeTimePreset(rules.time ?? "none")}`;
}

export function decodeYutRules(
  text: string,
): { ok: true; rules: YutRules } | { ok: false; reason: string } {
  const match = /^y1-([234])([st])([2-5])([bn])([56])([pl])(-t\d)?$/.exec(
    text.trim(),
  );
  if (!match) return { ok: false, reason: "윷놀이 규칙 문자열 형식이 아니다" };
  const [, players, mode, pieces, backDo, flat, home, tail] = match;
  if (mode === "t" && players !== "4")
    return { ok: false, reason: "편 놀이는 넷이서만 한다" };
  const time = decodeTimePreset(tail);
  if (time === null) return { ok: false, reason: "모르는 시간 규칙이다" };
  return {
    ok: true,
    rules: {
      players: Number(players) as 2 | 3 | 4,
      mode: mode === "t" ? "team" : "solo",
      pieces: Number(pieces),
      backDo: backDo === "b",
      flatPercent: flat === "6" ? 60 : 50,
      landOnHome: home === "l",
      ...(time === "none" ? {} : { time }),
    },
  };
}

/** 편(말 주인) 수. 각자 놀이는 사람마다, 편 놀이는 둘 */
export function sideCount(rules: YutRules): number {
  return rules.mode === "team" ? 2 : rules.players;
}

/** 이 자리가 속한 편 */
export function sideOf(rules: YutRules, seat: number): number {
  return rules.mode === "team" ? seat % 2 : seat;
}

/** 이 편에 속한 자리들 */
export function seatsOfSide(rules: YutRules, side: number): number[] {
  const seats: number[] = [];
  for (let s = 0; s < rules.players; s++)
    if (sideOf(rules, s) === side) seats.push(s);
  return seats;
}

/** 던지기 결과(칸 수). -1은 빽도 */
export type ThrowValue = -1 | 1 | 2 | 3 | 4 | 5;

export const THROW_VALUES: readonly ThrowValue[] = [1, 2, 3, 4, 5, -1];

export function throwName(value: ThrowValue): string {
  switch (value) {
    case -1:
      return "빽도";
    case 1:
      return "도";
    case 2:
      return "개";
    case 3:
      return "걸";
    case 4:
      return "윷";
    case 5:
      return "모";
  }
}

/** 한 번 더 던지는 결과(윷·모) */
export function isBonusThrow(value: ThrowValue): boolean {
  return value === 4 || value === 5;
}

/**
 * 결과마다 나올 확률. 가락 넷이 따로 평평한 면으로 떨어진다(확률 p).
 * 평평한 개수 1 도(표시 가락 하나만이면 빽도), 2 개, 3 걸, 4 윷, 0 모
 */
export function throwOdds(
  rules: Pick<YutRules, "flatPercent" | "backDo">,
): { value: ThrowValue; p: number }[] {
  // 곱셈만 쓴다: 컴퓨터 수를 참가자 기기가 다시 계산할 때 기기마다 끝자리가 같아야 한다(Math.pow는 다를 수 있다).
  const p = rules.flatPercent / 100;
  const q = 1 - p;
  const back = rules.backDo ? p * q * q * q : 0;
  return [
    { value: 1, p: 4 * p * q * q * q - back },
    { value: 2, p: 6 * p * p * q * q },
    { value: 3, p: 4 * p * p * p * q },
    { value: 4, p: p * p * p * p },
    { value: 5, p: q * q * q * q },
    ...(rules.backDo ? [{ value: -1 as ThrowValue, p: back }] : []),
  ];
}
