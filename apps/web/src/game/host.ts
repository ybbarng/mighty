import type { Action, GameEvent, PlayerView } from "@mighty/engine";

/** 엔진이 한 번 진행할 때마다 화면에 넘기는 것. 기본은 마이티, 하트는 하트 타입으로 쓴다 */
export interface Snapshot<View = PlayerView, Event = GameEvent> {
  view: View;
  events: Event[];
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * 화면이 아는 유일한 대국 창구. 누가 엔진을 돌리는지(브라우저, 방장 기기)는 모른다.
 * 혼자 할 때와 방장은 LocalMatch, 참가자는 RemoteMatch다.
 */
export interface MatchHost<
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
> {
  /** 이 화면의 자리 */
  readonly seat: number;
  current(): View;
  submit(action: ActionT): SubmitResult;
  /** 진행될 때마다 순서대로 받는다. 돌려준 함수로 그만 받는다 */
  subscribe(listener: (snapshot: Snapshot<View, Event>) => void): () => void;
}
