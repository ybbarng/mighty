import type { Action, PlayerView, RngState } from "@mighty/engine";

/** 컴퓨터 플레이어. 자기 자리에서 보이는 정보만 받는다. */
export interface Bot {
  readonly name: string;
  /** `view.decision`이 있을 때만 부른다. */
  decide(view: PlayerView, rng: RngState): Action;
}
