import { nextFloat, nextInt, type RngState } from "@mighty/engine";
import type { Action, GostopView } from "@mighty/gostop-engine";
import { type Month, monthOf } from "@mighty/hwatu";

import {
  exposure,
  type Table,
  tableOf,
  threat,
  unseenOfMonth,
  worth,
} from "./knowledge";
import { searchGoStop } from "./search";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface GostopBot {
  readonly name: string;
  decide(view: GostopView, rng: RngState): Action;
}

/** 낼 수 있는 행동 모두(흔들 수 있으면 흔드는 쪽, 폭탄, 뒤집기만) */
export function playOptions(view: GostopView): Action[] {
  const d = view.decision;
  if (d?.kind !== "play") return [];
  const out: Action[] = d.cards.map((card) =>
    d.shakeable.includes(card)
      ? { type: "play", card, shake: true }
      : { type: "play", card },
  );
  for (const month of d.bombs) out.push({ type: "bomb", month });
  if (d.flip) out.push({ type: "flip" });
  return out;
}

const floorOf = (view: GostopView, m: Month) =>
  view.floor.filter((id) => monthOf(id) === m);

/** 행동 하나의 바로 보이는 값(뒤집을 카드는 모른다) */
export function greedyValue(
  view: GostopView,
  t: Table,
  action: Action,
): number {
  if (action.type === "flip") return -0.2;
  if (action.type === "bomb") {
    const cards = view.hand.filter((id) => monthOf(id) === action.month);
    return (
      [...cards, ...floorOf(view, action.month)].reduce(
        (n, id) => n + worth(id, t),
        0,
      ) +
      1 +
      1.5
    );
  }
  if (action.type !== "play") return 0;
  const m = monthOf(action.card);
  const matches = floorOf(view, m);
  const shake = action.shake ? 1.2 : 0;
  const unseen = unseenOfMonth(m, t);
  const mine = worth(action.card, t);
  if (matches.length === 0) {
    // 바닥에 둔다: 상대가 먹을 수 있으면 그만큼 위험하다. 나머지가 다 보였으면 안전하다.
    if (unseen === 0) return 0.05 + shake;
    return -0.6 * exposure(action.card, t) + 0.05 * unseen + shake;
  }
  if (matches.length === 1)
    return (
      mine + worth(matches[0] as string, t) - (unseen > 0 ? 0.15 : 0) + shake
    );
  if (matches.length === 2)
    return (
      mine +
      Math.max(...matches.map((id) => worth(id, t))) +
      (unseen > 0 ? 0.3 : 0) +
      shake
    );
  const stack = view.stacks.find((x) => x.month === m);
  const steal =
    stack && stack.owner !== null ? (stack.owner === view.mySeat ? 2 : 1) : 0;
  return (
    mine + matches.reduce((n, id) => n + worth(id, t), 0) + steal * 0.8 + shake
  );
}

function chooseBest(
  view: GostopView,
  options: readonly string[],
  careful: boolean,
): string {
  const t = tableOf(view, careful);
  let best = options[0] as string;
  for (const id of options) if (worth(id, t) > worth(best, t)) best = id;
  return best;
}

/** 중수의 고·스톱: 남은 차례가 넉넉하고 상대가 멀리 있을 때만 고 */
export function sensibleGo(view: GostopView): boolean {
  const d = view.decision;
  if (d?.kind !== "goStop") return false;
  const left = view.hand.length + (view.flipOwed[view.mySeat] ?? 0);
  const { opp, threshold } = threat(view);
  if (left <= 1 || d.goCount >= 3) return false;
  if (view.rules.players === 2) return left >= 3 && opp <= threshold - 4;
  return left >= 3 && opp <= 1 && d.goCount < 2;
}

/** 중수: 바로 보이는 값이 가장 큰 수(같으면 무작위). `careful`이면 고수의 값(박 피하기·막기 더) */
export function greedyDecide(
  view: GostopView,
  rng: RngState,
  careful = false,
): Action {
  const d = view.decision;
  if (!d) throw new Error("할 일이 없다");
  switch (d.kind) {
    case "continue":
      return { type: "continue" };
    case "choose":
      return { type: "choose", card: chooseBest(view, d.options, careful) };
    case "goStop":
      return sensibleGo(view) ? { type: "go" } : { type: "stop" };
    case "play": {
      const t = tableOf(view, careful);
      let best: Action | null = null;
      let bestValue = -Infinity;
      for (const action of playOptions(view)) {
        const v = greedyValue(view, t, action) + nextFloat(rng) * 0.01;
        if (v > bestValue) {
          bestValue = v;
          best = action;
        }
      }
      return best ?? { type: "flip" };
    }
  }
}

export const gostopBeginnerBot: GostopBot = {
  name: "입문",
  decide(view, rng) {
    const d = view.decision;
    if (!d) throw new Error("할 일이 없다");
    switch (d.kind) {
      case "continue":
        return { type: "continue" };
      case "choose":
        return {
          type: "choose",
          card: d.options[nextInt(rng, d.options.length)] as string,
        };
      case "goStop": {
        const left = view.hand.length + (view.flipOwed[view.mySeat] ?? 0);
        return left >= 2 && nextFloat(rng) < 0.5
          ? { type: "go" }
          : { type: "stop" };
      }
      case "play": {
        if (d.cards.length === 0) return { type: "flip" };
        // 짝이 맞는 카드를 자주 고르지만, 무엇을 먹을지는 따지지 않는다.
        const matching = d.cards.filter(
          (id) => floorOf(view, monthOf(id)).length > 0,
        );
        const pool =
          matching.length > 0 && nextFloat(rng) < 0.7 ? matching : d.cards;
        return {
          type: "play",
          card: pool[nextInt(rng, pool.length)] as string,
        };
      }
    }
  },
};

export const gostopIntermediateBot: GostopBot = {
  name: "중수",
  decide: (view, rng) => greedyDecide(view, rng),
};

export const gostopExpertBot: GostopBot = {
  name: "고수",
  decide(view, rng) {
    if (view.decision?.kind === "goStop") {
      const searched = searchGoStop(view, rng);
      if (searched) return searched;
    }
    return greedyDecide(view, rng, true);
  },
};

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function gostopBotFor(level: number): GostopBot {
  if (level <= 0) return gostopBeginnerBot;
  if (level === 1) return gostopIntermediateBot;
  return gostopExpertBot;
}
