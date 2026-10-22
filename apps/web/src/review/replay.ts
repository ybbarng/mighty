import type { GameKit } from "@/game/kit";

import type { GameArchive } from "./archive";

/** 기록을 처음부터 다시 돌린 결과: 걸음마다의 상태와 그 걸음의 사건(0번은 대국을 만들 때) */
export interface Replayed<State, Event> {
  states: State[];
  events: Event[][];
  /** 중간에 다시 돌릴 수 없는 걸음이 있었다(그 앞까지만 보인다) */
  error: string | null;
}

function roundOf(state: unknown): number {
  return (state as { roundNumber: number }).roundNumber;
}

/** 판별 실제 패를 저장할 수 있게(카드 지도 `cards`는 [자리, 카드] 목록으로) */
export function serializeDeals(
  deals: ReadonlyMap<number, { cards: ReadonlyMap<number, string> }>,
): Record<number, unknown> {
  const out: Record<number, unknown> = {};
  for (const [deal, value] of deals)
    out[deal] = { ...value, cards: [...value.cards] };
  return out;
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
    // 멘탈 포커 판: 아직 패를 모르는 판(끝나지 않은 판)에 들어서면 거기서 멈춘다.
    const deal = deals?.get(roundOf(state));
    if (deals && deal === undefined) break;
    const before = deals ? kit.review.prepare(state, deals) : state;
    const action = deals
      ? kit.review.realAction(entry.action, deal)
      : entry.action;
    const result = kit.step(before, entry.seat, action as Action);
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
