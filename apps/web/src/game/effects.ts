import {
  type Card,
  type GameEvent,
  type Goal,
  isJoker,
  mightyOf,
  type PlayerView,
} from "@mighty/engine";

import { cardLabel, friendLabel, goalLabel, jokerCallLabel } from "./terms";

function sameGoal(a: Goal, b: Goal): boolean {
  return a.kiruda === b.kiruda && a.score === b.score;
}

export type EffectTone = "gold" | "red" | "info";

export interface Effect {
  text: string;
  tone: EffectTone;
  /** 함께 보여 줄 카드(딜미스한 사람의 패) */
  cards?: Card[];
  /** 큰 발표 상자로 띄울 때 아래에 적는 줄(당선, 공약 변경, 프렌드 선언) */
  lines?: string[];
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
          text: `${seatName(event.seat)} 당선`,
          tone: "gold",
          lines: [
            `공약 ${goalLabel(event.goal, view.rules.playerCount)}`,
            "바닥 카드를 가져갑니다",
          ],
        };
      case "exchanged": {
        const before = view.election.goal;
        if (!before || sameGoal(before, event.goal)) break;
        return {
          text: "공약 변경",
          tone: "gold",
          lines: [
            `${goalLabel(before, view.rules.playerCount)} → ${goalLabel(event.goal, view.rules.playerCount)}`,
          ],
        };
      }
      case "friendDeclared":
        return {
          text: "프렌드 선언",
          tone: "info",
          lines: [
            friendLabel(event.friend, seatName, {
              rules: view.rules,
              kiruda: view.goal?.kiruda ?? null,
            }),
          ],
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
        if (event.jokerCall) return { text: jokerCallLabel(), tone: "red" };
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
