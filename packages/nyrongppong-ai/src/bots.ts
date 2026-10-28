import { nextFloat, nextInt, type RngState } from "@mighty/engine";
import { monthOf } from "@mighty/hwatu";
import {
  type Action,
  handValue,
  monthCounts,
  type NyrongppongView,
} from "@mighty/nyrongppong-engine";

/** 나이롱뽕 컴퓨터. 자기 자리 화면만 본다 */
export interface NyrongppongBot {
  readonly name: string;
  decide(view: NyrongppongView, rng: RngState): Action;
}

/** 결정이 없을 때(부를 일이 없다). 화면이 틀렸다는 뜻이라 오류로 알린다 */
function noDecision(name: string): never {
  throw new Error(`${name}: 할 일이 없는 화면이다`);
}

/** 손패에서 짝(같은 달 두 장 이상)이 아닌 카드 */
function singletons(hand: readonly string[]): string[] {
  const counts = monthCounts(hand);
  return hand.filter((id) => (counts.get(monthOf(id)) ?? 0) < 2);
}

/** 입문: 아무 카드나 버리고, 뽕은 가끔만 부른다. 약은 보이면 낸다 */
export const nyrongppongBeginnerBot: NyrongppongBot = {
  name: "nyrongppong-beginner",
  decide(view, rng) {
    const d = view.decision ?? noDecision("나이롱뽕 컴퓨터");
    switch (d.kind) {
      case "continue":
        return { type: "continue" };
      case "call":
        return { type: nextFloat(rng) < 0.25 ? "call" : "pass" };
      case "draw":
        return d.canStop && nextFloat(rng) < 0.5
          ? { type: "stop" }
          : { type: "draw" };
      case "discard": {
        if (d.yak) return { type: "declare" };
        const card = view.hand[nextInt(rng, view.hand.length)] as string;
        return { type: "discard", card };
      }
    }
  },
};

/**
 * 중수의 버리기: 짝은 남기고(뽕할 거리), 짝이 아닌 카드 가운데 가장 큰 달을 버린다.
 * 짝이 아닌 카드가 없으면 가장 큰 달
 */
function greedyDiscard(hand: readonly string[]): string {
  const pool = singletons(hand);
  const from = pool.length > 0 ? pool : [...hand];
  return from.reduce((a, b) => (monthOf(b) > monthOf(a) ? b : a));
}

/** 중수: 손패 합을 줄이는 쪽으로 버리고, 뽕은 늘 부르고, 손이 아주 작으면 스톱한다 */
export const nyrongppongIntermediateBot: NyrongppongBot = {
  name: "nyrongppong-intermediate",
  decide(view) {
    const d = view.decision ?? noDecision("나이롱뽕 컴퓨터");
    switch (d.kind) {
      case "continue":
        return { type: "continue" };
      case "call":
        return { type: "call" };
      case "draw":
        return d.canStop && handValue(view.hand) <= 6
          ? { type: "stop" }
          : { type: "draw" };
      case "discard":
        if (d.yak) return { type: "declare" };
        return { type: "discard", card: greedyDiscard(view.hand) };
    }
  },
};
