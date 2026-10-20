import {
  type Card,
  type GameEvent,
  isJoker,
  mightyOf,
  type PlayerView,
} from "@mighty/engine";

import { cardLabel, goalLabel } from "./terms";

export type EffectTone = "gold" | "red" | "info";

export interface Effect {
  text: string;
  tone: EffectTone;
  /** 함께 보여 줄 카드(딜미스한 사람의 패) */
  cards?: Card[];
}

/** 짧게 띄울 효과 글자. 한 스냅숏에서 가장 눈에 띄어야 할 것 하나만 고른다 */
export function effectFor(
  view: PlayerView,
  events: readonly GameEvent[],
  seatName: (seat: number) => string,
): Effect | null {
  const kiruda = view.goal?.kiruda ?? "NT";
  const mighty: Card = mightyOf(view.rules, kiruda);

  for (const event of events) {
    switch (event.type) {
      case "dealMiss":
        return {
          text: `${seatName(event.seat)} 딜미스! 다시 섞습니다`,
          tone: "red",
          cards: event.hand,
        };
      case "allPassed":
        return { text: "모두 포기 — 다시 섞습니다", tone: "info" };
      case "elected":
        return {
          text: `${seatName(event.seat)} 당선 · ${goalLabel(event.goal)}`,
          tone: "gold",
        };
      case "killAttempt":
        return event.killed === null
          ? { text: `${cardLabel(event.card)} 지목 — 헛다리`, tone: "info" }
          : {
              text: `${cardLabel(event.card)} — ${seatName(event.killed)} 탈락`,
              tone: "red",
            };
      case "friendRevealed":
        return event.seat === null
          ? { text: "프렌드 없음", tone: "info" }
          : { text: `프렌드는 ${seatName(event.seat)}!`, tone: "gold" };
      case "played":
        if (event.jokerCall) return { text: "조커콜!", tone: "red" };
        if (event.card === mighty) return { text: "마이티!", tone: "gold" };
        if (isJoker(event.card)) return { text: "조커!", tone: "gold" };
        break;
      case "roundScored":
        if (event.result.multipliers.includes("run"))
          return { text: "런!", tone: "gold" };
        if (event.result.multipliers.includes("reverseRun"))
          return { text: "백런!", tone: "red" };
        break;
      default:
        break;
    }
  }
  return null;
}
