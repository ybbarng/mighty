import type { Action, GameEvent, PlayerView } from "@mighty/engine";

/** 엔진이 한 번 진행할 때마다 화면에 넘기는 것. */
export interface Snapshot {
  view: PlayerView;
  events: GameEvent[];
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * 화면이 아는 유일한 대국 창구. 누가 엔진을 돌리는지(브라우저, 서버, 방장 기기)는 모른다.
 * 지금은 LocalMatch 하나뿐이다. 온라인·BLE가 생기면 같은 인터페이스로 구현을 늘린다.
 */
export interface MatchHost {
  /** 이 화면의 자리 */
  readonly seat: number;
  current(): PlayerView;
  submit(action: Action): SubmitResult;
  /** 진행될 때마다 순서대로 받는다. 돌려준 함수로 그만 받는다 */
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
