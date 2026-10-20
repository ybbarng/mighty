import {
  type GameEvent,
  isJoker,
  mightyOf,
  type PlayerView,
} from "@mighty/engine";

import type { Cue } from "./sound";

/** 한 스냅숏의 이벤트에서 낼 소리. 순수 함수라 테스트할 수 있다 */
export function cuesFor(view: PlayerView, events: readonly GameEvent[]): Cue[] {
  const mighty = mightyOf(view.rules, view.goal?.kiruda ?? "NT");
  const cues: Cue[] = [];
  for (const event of events) {
    switch (event.type) {
      case "dealt":
        if (view.rules.playerCount !== 2) cues.push("shuffle");
        break;
      case "bid":
        cues.push("bid");
        break;
      case "passed":
        cues.push("pass");
        break;
      case "dealMiss":
      case "allPassed":
        cues.push("dealMiss");
        break;
      case "elected":
        cues.push("elected");
        break;
      case "played":
        if (event.jokerCall) cues.push("jokerCall");
        else if (event.card === mighty) cues.push("mighty");
        else if (isJoker(event.card)) cues.push("joker");
        else cues.push("card");
        break;
      case "friendRevealed":
        if (event.seat !== null) cues.push("friend");
        break;
      case "trickWon":
        cues.push("trick");
        break;
      case "roundScored": {
        const ruling = view.seat === view.declarer || view.seat === view.friend;
        cues.push(ruling === event.result.rulingWon ? "win" : "lose");
        break;
      }
      default:
        break;
    }
  }
  // 한 스냅숏에 같은 소리가 겹치면 하나만 낸다.
  return [...new Set(cues)];
}
