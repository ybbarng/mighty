import { type CreateMatchOptions, createMatch, step } from "./match";
import type { Action, MatchState } from "./state";

/** 한 자리가 한 행동. 판 기록은 이것의 목록이다 */
export interface LoggedAction {
  seat: number;
  action: Action;
}

export type ReplayResult =
  | { ok: true; state: MatchState }
  | { ok: false; index: number; error: string };

/**
 * 시작 조건과 행동 기록으로 대국을 처음부터 다시 돌린다.
 * 엔진은 결정적이라 같은 입력이면 같은 상태가 나온다. 그래서
 * - 저장·이어하기: 기록만 남겨도 상태를 되살린다
 * - 판 끝 검증: 방장이 알려 준 결과를 각 기기가 직접 다시 계산해 맞춰 본다
 * - 버그 재현: 기록 하나로 같은 판을 그대로 다시 만든다
 */
export function replay(
  options: CreateMatchOptions,
  log: readonly LoggedAction[],
): ReplayResult {
  let { state } = createMatch(options);
  for (const [index, { seat, action }] of log.entries()) {
    const result = step(state, seat, action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 두 상태가 같은가. 상태는 JSON 값이라 직렬화해서 비교한다 */
export function sameState(a: MatchState, b: MatchState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
