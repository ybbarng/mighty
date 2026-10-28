import {
  createRng,
  nextInt,
  type RngState,
  shuffleInPlace,
} from "@mighty/engine";
import {
  type Action,
  type GostopState,
  type GostopView,
  settlementFor,
  step,
  viewOf,
} from "@mighty/gostop-engine";

import { greedyDecide } from "./bots";
import { tableOf } from "./knowledge";

/** 고·스톱 한 번에 굴려 볼 앞날 수. 휴대폰에서도 짧게 끝나게 잡는다 */
const WORLDS = 120;

/**
 * 못 본 카드(남의 손패·더미)를 무작위로 채워 온전한 상태를 만든다.
 * 흔들어 보여 준 카드는 그 사람 손에 둔다. 장면(튜토리얼)처럼 카드 수가 맞지 않으면 null
 */
export function determinize(
  view: GostopView,
  rng: RngState,
): GostopState | null {
  const t = tableOf(view);
  const pool = shuffleInPlace(rng, [...t.unseen]);
  const hands: string[][] = [];
  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === view.mySeat) {
      hands.push([...view.hand]);
      continue;
    }
    const known = view.revealed[seat] ?? [];
    const need = (view.handCounts[seat] ?? 0) - known.length;
    if (need < 0 || pool.length < need) return null;
    hands.push([...known, ...pool.splice(0, need)]);
  }
  if (pool.length < view.deckCount) return null;
  const deck = pool.splice(0, view.deckCount);
  const {
    mySeat: _m,
    hand: _h,
    handCounts: _c,
    deckCount: _d,
    liveScores: _l,
    decision: _x,
    ...open
  } = view;
  return { ...open, seed: nextInt(rng, 2 ** 31), hands, deck };
}

/** 판이 끝날 때까지 모든 자리를 중수 방법으로 둬 보고, 내 점수 변화를 돌려준다 */
function rollout(state: GostopState, me: number, rng: RngState): number {
  let s = state;
  for (let guard = 0; guard < 200 && s.phase === "play"; guard++) {
    const seat = s.turn;
    const r = step(s, seat, greedyDecide(viewOf(s, seat), rng));
    if (!r.ok) break;
    s = r.state;
  }
  return s.result?.deltas[me] ?? 0;
}

/**
 * 고수의 고·스톱: 스톱하면 지금 정산이 바로 정해진다. 고는 못 본 카드를 여러 번 채워 보고
 * 판 끝까지 둬 본 평균이다(상대 점수·남은 패·고박을 모두 반영). 세계를 만들 수 없으면 null
 */
export function searchGoStop(view: GostopView, rng: RngState): Action | null {
  if (view.decision?.kind !== "goStop") return null;
  const me = view.mySeat;
  let stop = 0;
  let go = 0;
  for (let w = 0; w < WORLDS; w++) {
    const world = determinize(view, rng);
    if (!world) return null;
    stop += settlementFor(world, me).deltas[me] ?? 0;
    const r = step(world, me, { type: "go" });
    if (!r.ok) return null;
    go += rollout(r.state, me, createRng(nextInt(rng, 2 ** 31)));
  }
  return go > stop ? { type: "go" } : { type: "stop" };
}
