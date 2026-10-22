import type { GameKit } from "@/game/kit";

import type { GameArchive } from "./archive";

/** 기록을 처음부터 다시 돌린 결과: 걸음마다의 상태와 그 걸음의 사건(0번은 대국을 만들 때) */
export interface Replayed<State, Event> {
  states: State[];
  events: Event[][];
  /** 중간에 다시 돌릴 수 없는 걸음이 있었다(그 앞까지만 보인다) */
  error: string | null;
}

/**
 * 남긴 게임을 처음부터 다시 돌린다. 엔진이 결정적이라 같은 시작 조건과 행동 기록이면 같은 상태가 나온다.
 * 멘탈 포커 판은 판마다 실제 패를 넣어 가며 돌린다(`kit.review`)
 */
export function replayArchive<Rules, State, View, Action, Event, Extra>(
  kit: GameKit<Rules, State, View, Action, Event, Extra>,
  archive: GameArchive,
): Replayed<State, Event> {
  const deals = archive.deals
    ? new Map(Object.entries(archive.deals).map(([k, v]) => [Number(k), v]))
    : null;
  const extra = deals
    ? kit.review.firstExtra(deals)
    : (archive.presetDeal as Extra | undefined);
  const created = kit.createMatch(archive.rules as Rules, archive.seed, extra);
  const states: State[] = [created.state];
  const events: Event[][] = [created.events];
  let state = created.state;
  for (const [index, entry] of archive.log.entries()) {
    const before = deals ? kit.review.prepare(state, deals) : state;
    const result = kit.step(before, entry.seat, entry.action as Action);
    if (!result.ok)
      return {
        states,
        events,
        error: `${index + 1}번째 행동을 다시 돌릴 수 없다(${result.error})`,
      };
    state = deals ? kit.review.cleanup(result.state, state) : result.state;
    states.push(state);
    events.push(result.events);
  }
  return { states, events, error: null };
}
