import { realHwatuAction } from "@mighty/fair-play";
import type { PresetDeal } from "@mighty/hwatu";

/*
 * 화투 세 게임이 함께 쓰는 멘탈 포커 연결(복기). 멘탈 포커 판은 판마다 진짜 패(`preset`)를 넣어 가며 돌린다.
 * 판 패 모양은 fair-play `HwatuRoundDeal`과 같다: { preset, cards }
 */

type WithPreset = { roundNumber: number; preset?: PresetDeal };

function presetOf(deal: unknown): PresetDeal | undefined {
  return (deal as { preset?: PresetDeal } | undefined)?.preset;
}

/** `GameKit.review`의 멘탈 포커 부분(판마다 패 넣기) */
export function hwatuReviewDeals<State extends WithPreset>() {
  return {
    firstExtra: (deals: ReadonlyMap<number, unknown>) => presetOf(deals.get(1)),
    prepare: (state: State, deals: ReadonlyMap<number, unknown>): State =>
      withPreset(state, presetOf(deals.get(state.roundNumber + 1)) ?? null),
    cleanup: (state: State): State => withPreset(state, null),
    realAction: (action: unknown) => realHwatuAction(action),
  };
}

/** 상태에 다음 판 패를 넣거나(있으면) 지운다 */
export function withPreset<State extends { preset?: PresetDeal }>(
  state: State,
  preset: PresetDeal | null,
): State {
  const copy = { ...state };
  if (preset) copy.preset = preset;
  else delete copy.preset;
  return copy;
}
