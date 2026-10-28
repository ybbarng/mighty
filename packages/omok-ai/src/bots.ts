import { nextFloat, nextInt, type RngState } from "@mighty/engine";
import {
  type Action,
  type Cell,
  forbiddenReason,
  hasForbidden,
  type OmokView,
  other,
  type Stone,
  stoneOfSeat,
  type Variant,
  winningLine,
} from "@mighty/omok-engine";

import { evaluate, nearbyEmpties, placeGain } from "./shape";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface OmokBot {
  readonly name: string;
  decide(view: OmokView, rng: RngState): Action;
}

const WIN = 10_000_000;

function allowed(
  board: readonly Cell[],
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  return (
    !hasForbidden(variant, stone) ||
    forbiddenReason(board, at, stone, variant) === null
  );
}

/** `stone`이 지금 두면 바로 이기는 자리들 */
function winningMoves(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  candidates: readonly number[],
): number[] {
  const found: number[] = [];
  for (const at of candidates) {
    board[at] = stone;
    const wins = winningLine(board, at, variant) !== null;
    board[at] = 0;
    // 이기는 다섯은 금지 수가 아니다(엔진 `forbiddenReason`).
    if (wins) found.push(at);
  }
  return found;
}

/**
 * 후보 자리를 공격 값어치 + 막는 값어치(`defense`배)로 줄 세워 앞에서 `limit`개. 금지 자리는 뺀다.
 * 금지 판정이 무거워 앞 순위부터 필요한 만큼만 본다
 */
function ranked(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  defense: number,
  limit = Infinity,
): { at: number; score: number }[] {
  const sorted = nearbyEmpties(board)
    .map((at) => ({
      at,
      score:
        placeGain(board, at, stone) +
        defense * placeGain(board, at, other(stone)),
    }))
    .sort((a, b) => b.score - a.score);
  const picked: { at: number; score: number }[] = [];
  for (const move of sorted) {
    if (picked.length >= limit) break;
    if (allowed(board, move.at, stone, variant)) picked.push(move);
  }
  return picked;
}

/**
 * 반드시 둘 자리: 이기는 수가 있으면 그것, 상대가 다음에 이기는 자리가 있으면 그곳을 막는다.
 * 상대 이기는 자리가 둘 이상이면 하나만 막을 수 있다
 */
function forced(board: Cell[], stone: Stone, variant: Variant): number | null {
  const near = nearbyEmpties(board);
  const win = winningMoves(board, stone, variant, near);
  if (win[0] !== undefined) return win[0];
  const threats = winningMoves(board, other(stone), variant, near).filter(
    (at) => allowed(board, at, stone, variant),
  );
  return threats[0] ?? null;
}

/** 판 끝·내 차례 아님 처리. 둘 차례면 null */
function routine(view: OmokView): Action | null {
  if (view.phase === "roundEnd" && !view.continued[view.mySeat])
    return { type: "continue" };
  return null;
}

/** 둘 곳이 하나도 없을 때(판이 다 찼는데 결과가 안 난 경우는 없지만 안전하게) */
function anyLegal(board: Cell[], stone: Stone, variant: Variant): number {
  for (let at = 0; at < board.length; at++)
    if (board[at] === 0 && allowed(board, at, stone, variant)) return at;
  return 0;
}

function placeWith(
  pick: (
    board: Cell[],
    stone: Stone,
    variant: Variant,
    rng: RngState,
  ) => number,
): (view: OmokView, rng: RngState) => Action {
  return (view, rng) => {
    const done = routine(view);
    if (done) return done;
    const board = [...view.board];
    const stone = stoneOfSeat(view, view.mySeat);
    const variant = view.rules.variant;
    const must = forced(board, stone, variant);
    if (must !== null) return { type: "place", at: must };
    return { type: "place", at: pick(board, stone, variant, rng) };
  };
}

/**
 * 입문: 이기는 수와 다섯 막기는 본다. 그 밖에는 막는 값을 반만 쳐서 위쪽 여섯 자리 중 무작위.
 * 열린 삼을 자주 놓쳐 처음 두는 사람도 이길 수 있다
 */
export const omokBeginnerBot: OmokBot = {
  name: "omok-beginner",
  decide: placeWith((board, stone, variant, rng) => {
    const list = ranked(board, stone, variant, 0.5, 6);
    return (
      list[nextInt(rng, list.length)]?.at ?? anyLegal(board, stone, variant)
    );
  }),
};

/** 중수: 공격과 막기를 같은 값으로 보고 가장 좋은 자리. 같은 점수면 무작위 */
export const omokIntermediateBot: OmokBot = {
  name: "omok-intermediate",
  decide: placeWith((board, stone, variant, rng) => {
    const list = ranked(board, stone, variant, 1, 12);
    const best = list[0];
    if (!best) return anyLegal(board, stone, variant);
    const ties = list.filter((m) => m.score === best.score);
    return ties[nextInt(rng, ties.length)]?.at ?? best.at;
  }),
};

/** 앞수 읽기에서 한 걸음마다 볼 후보 수 */
const WIDTH = 9;

/** `stone` 차례에서 볼 후보: 이길 수가 있으면 그것만, 상대 다섯을 막아야 하면 그곳만 */
function searchMoves(board: Cell[], stone: Stone, variant: Variant): number[] {
  const must = forced(board, stone, variant);
  if (must !== null) return [must];
  return ranked(board, stone, variant, 1, WIDTH).map((m) => m.at);
}

function negamax(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0) return evaluate(board, stone);
  const moves = searchMoves(board, stone, variant);
  if (moves.length === 0) return 0;
  let best = -Infinity;
  let a = alpha;
  for (const at of moves) {
    board[at] = stone;
    const score =
      winningLine(board, at, variant) !== null
        ? WIN + depth
        : -negamax(board, other(stone), variant, depth - 1, -beta, -a);
    board[at] = 0;
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) break;
  }
  return best;
}

/** 고수: 모양 점수로 후보를 추려 네 수 앞까지 읽는다(알파베타). 같은 값이면 앞 순위 */
export function createOmokSearchBot(depth = 4): OmokBot {
  return {
    name: `omok-search-${depth}`,
    decide: placeWith((board, stone, variant, rng) => {
      const moves = searchMoves(board, stone, variant);
      let bestAt = moves[0] ?? anyLegal(board, stone, variant);
      let best = -Infinity;
      for (const at of moves) {
        board[at] = stone;
        const score =
          winningLine(board, at, variant) !== null
            ? WIN
            : -negamax(
                board,
                other(stone),
                variant,
                depth - 1,
                -Infinity,
                -best,
              );
        board[at] = 0;
        // 거의 같은 수끼리는 조금 흔들어 매번 같은 판이 되지 않게 한다.
        const jitter = nextFloat(rng) * 0.5;
        if (score + jitter > best) {
          best = score + jitter;
          bestAt = at;
        }
      }
      return bestAt;
    }),
  };
}

export const omokExpertBot = createOmokSearchBot(4);

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function omokBotFor(level: number): OmokBot {
  if (level <= 0) return omokBeginnerBot;
  if (level === 1) return omokIntermediateBot;
  return omokExpertBot;
}
