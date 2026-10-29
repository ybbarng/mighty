import type { Action, BadukView } from "@mighty/baduk-engine";
import { nextInt, type RngState } from "@mighty/engine";

import { type Color, FastBoard, PASS } from "./fast-board";
import { candidateMoves, search } from "./search";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface BadukBot {
  readonly name: string;
  decide(view: BadukView, rng: RngState): Action;
}

/** 화면의 판을 컴퓨터가 읽는 빠른 판으로 옮긴다 */
export function boardOfView(view: BadukView): FastBoard {
  const board = new FastBoard(view.rules.size, view.board, view.toPlay);
  board.passes = view.passes;
  const last = view.played.at(-1);
  board.last = last && "at" in last ? last.at : -1;
  return board;
}

/**
 * 상대가 방금 쉬었고 지금 판을 그대로 세면 내가 이기면 쉰다(판이 끝난다).
 * 바둑은 죽은 돌을 따로 들어내지 않고 판 위 그대로 세므로, 지고 있으면 더 둬서 죽은 돌을 따낸다
 */
function winsIfPass(view: BadukView, board: FastBoard): boolean {
  if (view.passes < 1) return false;
  const score = board.score(view.rules.komi);
  return view.toPlay === 1 ? score > 0 : score < 0;
}

/** 수를 고르는 방법만 다르고, 다음 판·쉬기는 같다 */
function botWith(
  name: string,
  pick: (view: BadukView, board: FastBoard, rng: RngState) => number,
): BadukBot {
  return {
    name,
    decide(view, rng) {
      if (view.decision?.kind === "continue") return { type: "continue" };
      const board = boardOfView(view);
      if (winsIfPass(view, board)) return { type: "pass" };
      const at = pick(view, board, rng);
      return at === PASS || !view.legal.includes(at)
        ? { type: "pass" }
        : { type: "place", at };
    },
  };
}

/** 이 수를 두면 내 무리 활로가 몇 개인가(2까지 센다) */
function libertiesAfter(board: FastBoard, at: number): number {
  const copy = board.clone();
  copy.play(at);
  return copy.liberties(at, 2);
}

/** 이 수로 따내는 상대 돌 수 */
function captureSize(board: FastBoard, at: number): number {
  const copy = board.clone();
  return copy.play(at);
}

/** 내 무리 가운데 단수(활로 하나)인 것들의 그 활로 */
function atariEscapes(board: FastBoard, color: Color): number[] {
  const seen = new Set<number>();
  const escapes: number[] = [];
  for (let i = 0; i < board.n; i++) {
    if (board.cells[i] !== color || seen.has(i)) continue;
    if (board.liberties(i, 2) === 1) {
      const lib = board.lastLib;
      if (!seen.has(lib)) escapes.push(lib);
      seen.add(lib);
    }
  }
  return escapes;
}

/**
 * 입문: 따낼 수 있으면 가장 많이 따내고, 단수에 몰린 내 돌은 달아난다.
 * 그 밖에는 둘 만한 수 가운데 무작위(내 눈은 메우지 않고, 스스로 단수가 되는 수는 피한다)
 */
/** 눈에 띄는 수: 따낼 수 있으면 가장 많이 따내고, 아니면 단수에 몰린 내 돌을 달아나게 한다. 없으면 PASS */
function obviousMove(
  moves: readonly number[],
  allowed: ReadonlySet<number>,
  board: FastBoard,
  rng: RngState,
): number {
  let best = PASS;
  let most = 0;
  for (const m of moves) {
    const n = captureSize(board, m);
    if (n > most) {
      most = n;
      best = m;
    }
  }
  if (best !== PASS) return best;
  const escapes = atariEscapes(board, board.toPlay).filter(
    (m) => allowed.has(m) && board.isLegal(m) && libertiesAfter(board, m) >= 2,
  );
  return escapes.length > 0
    ? (escapes[nextInt(rng, escapes.length)] as number)
    : PASS;
}

export const badukBeginnerBot = botWith(
  "baduk-beginner",
  (view, board, rng) => {
    const allowed = new Set(view.legal);
    const moves = candidateMoves(board).filter((m) => allowed.has(m));
    if (moves.length === 0) return PASS;
    const obvious = obviousMove(moves, allowed, board, rng);
    if (obvious !== PASS) return obvious;
    const safe = moves.filter((m) => libertiesAfter(board, m) >= 2);
    const pool = safe.length > 0 ? safe : moves;
    return pool[nextInt(rng, pool.length)] as number;
  },
);

/** 판 크기마다 둬 볼 판 수(크면 한 판이 길어 줄인다) */
function budget(size: number, nine: number): number {
  return Math.round(size <= 9 ? nine : size <= 13 ? nine * 0.4 : nine * 0.15);
}

/** 중수가 둬 볼 판 수(9줄) */
export const INTERMEDIATE_PLAYOUTS = 2000;
/** 고수가 둬 볼 판 수(9줄) */
export const EXPERT_PLAYOUTS = 6000;

/**
 * 중수: 따내기·달아나기가 보이면 그 수를 두고, 아니면 둘 만한 수마다 끝까지 무작위로 둬 보고
 * 승률이 가장 높은 수(나무 없는 몬테카를로). 둬 보는 판 수만 다르게 만들 수 있다(시험은 적게)
 */
export function createBadukIntermediateBot(
  playouts = INTERMEDIATE_PLAYOUTS,
): BadukBot {
  return botWith(
    playouts === INTERMEDIATE_PLAYOUTS
      ? "baduk-intermediate"
      : `baduk-intermediate-${playouts}`,
    (view, board, rng) => {
      const allowed = new Set(view.legal);
      const moves = candidateMoves(board).filter((m) => allowed.has(m));
      const obvious = obviousMove(moves, allowed, board, rng);
      if (obvious !== PASS) return obvious;
      return search(
        board,
        view.rules.komi,
        budget(view.rules.size, playouts),
        rng,
        { allowed: view.legal, rave: false, depth1: true },
      ).move;
    },
  );
}

export const badukIntermediateBot = createBadukIntermediateBot();

/** 고수: 몬테카를로 나무 탐색(UCT + RAVE) */
export function createBadukSearchBot(playouts = EXPERT_PLAYOUTS): BadukBot {
  return botWith(
    `baduk-mcts-${playouts}`,
    (view, board, rng) =>
      search(board, view.rules.komi, budget(view.rules.size, playouts), rng, {
        allowed: view.legal,
      }).move,
  );
}

export const badukExpertBot = createBadukSearchBot();

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function badukBotFor(level: number): BadukBot {
  if (level <= 0) return badukBeginnerBot;
  if (level === 1) return badukIntermediateBot;
  return badukExpertBot;
}
