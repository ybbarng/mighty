import { type CreateMatchOptions, createMatch, step } from "./match";
import type { LoggedAction, MatchState } from "./state";

export type ReplayResult =
  | { ok: true; state: MatchState }
  | { ok: false; index: number; error: string };

/** 시작 조건과 행동 기록으로 처음부터 다시 돌린다(저장·이어하기, 온라인 판 끝 검증) */
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
