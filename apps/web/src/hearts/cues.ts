import {
  type GameEvent,
  type PlayerView,
  QUEEN_OF_SPADES,
} from "@mighty/hearts-engine";

import { type CueCall, type DealTiming, dealCues } from "@/game/cues";

import { HEARTS_DEAL_PATTERN } from "./timing";

/** 트릭이 끝나고 이긴 카드를 보여 주는 시간(초, 하트 store의 `TRICK_HOLD`). 이때 카드를 모은다 */
const TRICK_HOLD_S = 1;

/**
 * 한 스냅숏의 이벤트에서 낼 소리. 마이티와 같은 소리를 빌려 쓰고, 하트만의 장면은 따로 둔다.
 * 하트는 점수가 벌점이라 내가 점수 카드를 먹으면 아쉬운 소리, ◆J처럼 점수를 깎는 카드를 먹으면
 * 반가운 소리를 낸다. 남이 먹을 때는 조용히 둔다.
 */
export function heartsCuesFor(
  view: PlayerView,
  events: readonly GameEvent[],
  deal: DealTiming | null = null,
): CueCall[] {
  const calls: CueCall[] = [];
  const played = events.some((e) => e.type === "played");
  // 마지막 트릭과 판 끝이 한 장면에 오면 카드를 다 모은 뒤 판 끝 소리를 낸다.
  const afterTrick = events.some((e) => e.type === "trickWon")
    ? TRICK_HOLD_S + 0.5
    : 0;
  const over = events.some((e) => e.type === "gameOver");
  const moon = events.some(
    (e) => e.type === "roundScored" && e.moonShooter !== null,
  );
  for (const e of events) {
    if (e.type === "dealt" && deal)
      calls.push(...dealCues(e.handSize, 4, deal, HEARTS_DEAL_PATTERN));
    // 서로 카드를 주고받아 손패를 다시 정리한다.
    if (e.type === "passed") calls.push({ cue: "cardSet" });
    if (e.type === "played")
      calls.push({
        cue: e.card === QUEEN_OF_SPADES ? "queenOfSpades" : "card",
      });
    if (e.type === "heartsBroken")
      calls.push({ cue: "heartsBroken", delay: played ? 0.3 : 0 });
    if (e.type === "trickWon" && e.seat === view.seat && e.points !== 0)
      calls.push({
        cue: e.points > 0 ? "penalty" : "scored",
        delay: TRICK_HOLD_S,
      });
    if (e.type === "roundScored") {
      // 문: 내가 먹으면 팡파르, 남이 먹으면(나에게 벌점) 불길한 소리
      if (e.moonShooter !== null)
        calls.push({
          cue: e.moonShooter === view.seat ? "mighty" : "queenOfSpades",
          delay: afterTrick,
        });
      // 마지막 판이면 승리·패배 소리만 낸다.
      else if (!over) calls.push({ cue: "roundEnd", delay: afterTrick });
    }
    if (e.type === "gameOver")
      calls.push({
        cue: e.winners.includes(view.seat) ? "win" : "lose",
        // 문 소리와 겹치지 않게 그 뒤에 낸다.
        delay: afterTrick + (moon ? 1.2 : 0),
      });
  }
  return calls;
}
