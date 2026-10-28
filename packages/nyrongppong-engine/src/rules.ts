/*
 * 나이롱뽕 규칙(docs/30 1절). 여러 집 규칙 가운데 나무위키·보드게임아레나·옛 동호회 글이 함께 적은 것을 기본으로 둔다.
 * 고를 수 있는 것: 인원, 판 수, 스톱 한도, 뽕 바가지 벌점, 뽕 응답 시간
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
/** 처음 받는 장수. 선은 한 장 더 받고 첫 차례에 가져오지 않고 버린다 */
export const HAND_SIZE = 5;
/** 스톱했는데 가장 낮지 않으면 손패 합에 더하는 벌점(스톱 바가지) */
export const STOP_PENALTY = 30;

export interface NyrongppongRules {
  /** 인원(2~5) */
  players: number;
  /** 이만큼 판을 하고 합계가 가장 낮은 사람이 이긴다 */
  rounds: number;
  /** 손패 합이 이 값 이하일 때 스톱할 수 있다. 0이면 스톱 없음 */
  stopLimit: 0 | 5 | 10;
  /** 뽕으로 패를 모두 털게 해 준 사람의 벌점(뽕 바가지) */
  bagaji: 20 | 30;
  /** 버린 패에 뽕을 부를지 정하는 시간(초). 컴퓨터는 바로 정한다 */
  callSeconds: 3 | 5 | 8;
}

export const STANDARD_RULES: NyrongppongRules = {
  players: 4,
  rounds: 5,
  stopLimit: 10,
  bagaji: 20,
  callSeconds: 5,
};

export const ROUND_OPTIONS = [1, 3, 5, 10] as const;
export const STOP_OPTIONS = [10, 5, 0] as const;
export const BAGAJI_OPTIONS = [20, 30] as const;
export const CALL_SECONDS_OPTIONS = [3, 5, 8] as const;

/** 뽕 응답 시간(ms) */
export function callWindowMs(rules: NyrongppongRules): number {
  return rules.callSeconds * 1000;
}

/*
 * 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `n1-p<인원>r<판 수>s<스톱 한도>b<바가지>c<응답 초>`. 예: 기본 `n1-p4r5s10b20c5`
 */
export function encodeNyrongppongRules(rules: NyrongppongRules): string {
  return `n1-p${rules.players}r${rules.rounds}s${rules.stopLimit}b${rules.bagaji}c${rules.callSeconds}`;
}

export function decodeNyrongppongRules(
  text: string,
): { ok: true; rules: NyrongppongRules } | { ok: false; reason: string } {
  const match = /^n1-p([2-5])r(10|[1-9])s(0|5|10)b(20|30)c([358])$/.exec(
    text.trim(),
  );
  if (!match)
    return { ok: false, reason: "나이롱뽕 규칙 문자열 형식이 아니다" };
  const [, players, rounds, stop, bagaji, seconds] = match;
  return {
    ok: true,
    rules: {
      players: Number(players),
      rounds: Number(rounds),
      stopLimit: Number(stop) as NyrongppongRules["stopLimit"],
      bagaji: Number(bagaji) as NyrongppongRules["bagaji"],
      callSeconds: Number(seconds) as NyrongppongRules["callSeconds"],
    },
  };
}
