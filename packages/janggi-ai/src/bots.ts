import { nextFloat, nextInt, type RngState } from "@mighty/engine";
import {
  type Action,
  applyMove,
  inCheck,
  type JanggiView,
  kingsFacing,
  legalMoves,
  type Move,
  other,
  SETUPS,
  sideOfSeat,
} from "@mighty/janggi-engine";

import { evaluate, MATE, negamax, type SearchOptions } from "./search";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface JanggiBot {
  readonly name: string;
  decide(view: JanggiView, rng: RngState): Action;
}

/** 수마다 `depth`수 앞까지 읽은 값(내 쪽에서 본 값) */
function scoreMoves(
  view: JanggiView,
  depth: number,
): { move: Move; score: number }[] {
  const side = sideOfSeat(view, view.mySeat);
  const options: SearchOptions = {
    bikjangScore: view.rules.bikjang === "score",
  };
  const opponent = other(side);
  return view.legal.map((move) => {
    const next = applyMove(view.board, move);
    // 바로 외통이면 무엇보다 크게 친다(두 수 뒤에 이기는 수와 섞이지 않게).
    if (
      inCheck(next, opponent) &&
      legalMoves(next, opponent, !options.bikjangScore).length === 0
    )
      return { move, score: MATE * 2 };
    if (options.bikjangScore && kingsFacing(next))
      return { move, score: evaluate(next, side) > 0 ? MATE / 10 : -MATE / 10 };
    const score =
      depth <= 1
        ? evaluate(next, side)
        : -negamax(next, other(side), depth - 1, -Infinity, Infinity, options);
    return { move, score };
  });
}

/** 수를 고르는 방법만 다르고, 상차림·다음 판·쉬기는 같다 */
function botWith(
  name: string,
  pick: (view: JanggiView, rng: RngState) => Move | null,
): JanggiBot {
  return {
    name,
    decide(view, rng) {
      if (view.decision?.kind === "setup")
        return {
          type: "setup",
          setup: SETUPS[nextInt(rng, SETUPS.length)]?.value ?? "NENE",
        };
      if (view.decision?.kind === "continue") return { type: "continue" };
      const move = pick(view, rng);
      return move ? { type: "move", ...move } : { type: "pass" };
    },
  };
}

/** 입문이 "비슷하게 좋다"고 보는 값 차이(졸 하나보다 조금 작다) */
const BEGINNER_SLACK = 150;

/**
 * 입문: 한 수만 보고 가장 좋은 수와 값이 비슷한 수들 가운데 무작위.
 * 잡을 수 있는 기물은 잡지만(값 차이가 커서), 잡힌 뒤를 생각하지 않아 기물을 자주 내준다
 */
export const janggiBeginnerBot = botWith("janggi-beginner", (view, rng) => {
  const scored = scoreMoves(view, 1);
  const best = Math.max(...scored.map((s) => s.score));
  const near = scored.filter((s) => s.score >= best - BEGINNER_SLACK);
  return near[nextInt(rng, near.length)]?.move ?? null;
});

/** 같은 값끼리는 조금 흔들어 매번 같은 판이 되지 않게 고른다 */
function bestOf(
  scored: { move: Move; score: number }[],
  rng: RngState,
): Move | null {
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const { move, score } of scored) {
    const jittered = score + nextFloat(rng) * 5;
    if (jittered > bestScore) {
      bestScore = jittered;
      best = move;
    }
  }
  return best;
}

/** 중수: 두 수 앞(내 수와 상대 답) + 주고받기를 끝까지 따져 가장 좋은 수 */
export const janggiIntermediateBot = botWith(
  "janggi-intermediate",
  (view, rng) => bestOf(scoreMoves(view, 2), rng),
);

/** 고수: 세 수 앞까지 알파베타로 읽는다 */
export function createJanggiSearchBot(depth = 3): JanggiBot {
  return botWith(`janggi-search-${depth}`, (view, rng) => {
    const side = sideOfSeat(view, view.mySeat);
    const options: SearchOptions = {
      bikjangScore: view.rules.bikjang === "score",
    };
    // 한 수만 본 값으로 줄 세워 좋은 수부터 읽으면 잘라 내는 가지가 많아진다.
    const ordered = scoreMoves(view, 1).sort((a, b) => b.score - a.score);
    // 바로 외통이면 더 읽지 않는다.
    if (ordered[0] && ordered[0].score >= MATE * 2) return ordered[0].move;
    let best: Move | null = null;
    let bestScore = -Infinity;
    for (const { move } of ordered) {
      const next = applyMove(view.board, move);
      const score =
        options.bikjangScore && kingsFacing(next)
          ? evaluate(next, side) > 0
            ? MATE / 10
            : -MATE / 10
          : -negamax(
              next,
              other(side),
              depth - 1,
              -Infinity,
              -bestScore + 5,
              options,
            );
      const jittered = score + nextFloat(rng) * 5;
      if (jittered > bestScore) {
        bestScore = jittered;
        best = move;
      }
    }
    return best;
  });
}

export const janggiExpertBot = createJanggiSearchBot(3);

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function janggiBotFor(level: number): JanggiBot {
  if (level <= 0) return janggiBeginnerBot;
  if (level === 1) return janggiIntermediateBot;
  return janggiExpertBot;
}
