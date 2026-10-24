import {
  type GameEvent,
  type PlayerView,
  QUEEN_OF_SPADES,
} from "@mighty/hearts-engine";

import type { CueCall } from "@/game/cues";

/** 한 스냅숏의 이벤트에서 낼 소리. 마이티와 같은 소리를 빌려 쓰고, 하트만의 장면은 따로 둔다 */
export function heartsCuesFor(
  view: PlayerView,
  events: readonly GameEvent[],
): CueCall[] {
  const calls: CueCall[] = [];
  const played = events.some((e) => e.type === "played");
  for (const e of events) {
    if (e.type === "dealt") calls.push({ cue: "shuffle" });
    // 서로 카드를 주고받아 손패를 다시 정리한다.
    if (e.type === "passed") calls.push({ cue: "cardSet" });
    if (e.type === "played")
      calls.push({
        cue: e.card === QUEEN_OF_SPADES ? "queenOfSpades" : "card",
      });
    if (e.type === "heartsBroken")
      calls.push({ cue: "heartsBroken", delay: played ? 0.3 : 0 });
    // 문(모든 점수 카드)을 다 먹으면 마이티처럼 크게 알린다.
    if (e.type === "roundScored" && e.moonShooter !== null)
      calls.push({ cue: "mighty" });
    if (e.type === "gameOver")
      calls.push({ cue: e.winners.includes(view.seat) ? "win" : "lose" });
  }
  return calls;
}
