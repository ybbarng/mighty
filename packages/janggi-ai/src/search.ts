import {
  applyMove,
  type Board,
  CELLS,
  type Cell,
  HAN_BONUS,
  type Kind,
  kingsFacing,
  type Move,
  other,
  PIECE_VALUE,
  pseudoTargets,
  type Side,
  xyOf,
} from "@mighty/janggi-engine";

/** 궁을 잡는 수의 값. 깊이를 더해 빨리 잡는 쪽을 고른다 */
export const MATE = 1_000_000;
/** 빅장으로 점수 가리기가 끝났을 때의 값(외통보다 작다) */
const DECIDED = 100_000;

/** 기물 값(점수 ×100) */
const VALUE: Record<Kind, number> = {
  K: 0,
  A: PIECE_VALUE.A * 100,
  R: PIECE_VALUE.R * 100,
  C: PIECE_VALUE.C * 100,
  N: PIECE_VALUE.N * 100,
  E: PIECE_VALUE.E * 100,
  P: PIECE_VALUE.P * 100,
};

/** 자리 값: 졸은 앞으로 나갈수록, 마·차·포는 가운데로 올수록 조금 더 */
function placeBonus(cell: Cell, at: number): number {
  const kind = cell[1] as Kind;
  const side = cell[0] as Side;
  const [x, y] = xyOf(at);
  const advance = side === "c" ? 6 - y : y - 3;
  const center = 4 - Math.abs(x - 4);
  switch (kind) {
    case "P":
      // 상대 궁성 가까이 간 졸은 위협이 크다(옆 줄로 가도 조금).
      return Math.max(0, advance) * 12 + (advance >= 4 ? center * 6 : 0);
    case "N":
      return center * 6 + Math.max(0, advance) * 4;
    case "R":
    case "C":
      return center * 3 + Math.max(0, advance) * 3;
    default:
      return 0;
  }
}

/** `side` 쪽에서 본 판 값(점수 ×100, 한의 덤 포함) */
export function evaluate(board: Board, side: Side): number {
  let score = 0;
  for (let at = 0; at < CELLS; at++) {
    const cell = board[at] ?? "";
    if (cell === "") continue;
    const value = VALUE[cell[1] as Kind] + placeBonus(cell, at);
    score += cell[0] === side ? value : -value;
  }
  const bonus = HAN_BONUS * 100;
  return score + (side === "h" ? bonus : -bonus);
}

/** 그 편의 모든 수(궁이 잡히는지는 보지 않는다). 잡는 수를 큰 기물부터 앞에 둔다 */
export function pseudoMoves(board: Board, side: Side): Move[] {
  const captures: { move: Move; order: number }[] = [];
  const quiet: Move[] = [];
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (cell === "" || cell[0] !== side) continue;
    for (const to of pseudoTargets(board, from)) {
      const target = board[to] ?? "";
      if (target === "") quiet.push({ from, to });
      else {
        const victim = target[1] === "K" ? 100_000 : VALUE[target[1] as Kind];
        captures.push({
          move: { from, to },
          order: victim * 10 - VALUE[cell[1] as Kind] / 100,
        });
      }
    }
  }
  captures.sort((a, b) => b.order - a.order);
  return [...captures.map((c) => c.move), ...quiet];
}

export interface SearchOptions {
  /** 빅장이 되면 점수로 가리나(아니면 빅장 금지) */
  bikjangScore: boolean;
}

/** 잡는 수만 이어 보는 탐색(눈앞 기물 주고받기를 끝까지 따진다) */
function quiesce(
  board: Board,
  side: Side,
  alpha: number,
  beta: number,
  depth: number,
): number {
  const standPat = evaluate(board, side);
  if (standPat >= beta || depth === 0) return standPat;
  let a = Math.max(alpha, standPat);
  for (const move of pseudoMoves(board, side)) {
    const target = board[move.to] ?? "";
    if (target === "") break; // 잡는 수가 앞에 모여 있다.
    if (target[1] === "K") return MATE;
    const score = -quiesce(
      applyMove(board, move),
      other(side),
      -beta,
      -a,
      depth - 1,
    );
    if (score >= beta) return score;
    if (score > a) a = score;
  }
  return a;
}

/** 알파베타(negamax). 궁을 잡는 수가 있으면 그 판은 이긴 것으로 본다 */
export function negamax(
  board: Board,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  options: SearchOptions,
): number {
  if (depth === 0) return quiesce(board, side, alpha, beta, 4);
  const moves = pseudoMoves(board, side);
  let best = -Infinity;
  let a = alpha;
  for (const move of moves) {
    const target = board[move.to] ?? "";
    if (target !== "" && target[1] === "K") return MATE + depth;
    const next = applyMove(board, move);
    let score: number;
    if (kingsFacing(next)) {
      // 빅장 금지면 둘 수 없는 수, 점수 규칙이면 그 자리에서 점수로 끝난다.
      if (!options.bikjangScore) continue;
      score = evaluate(next, side) > 0 ? DECIDED : -DECIDED;
    } else score = -negamax(next, other(side), depth - 1, -beta, -a, options);
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) return best;
  }
  // 둘 수 있는 수가 모두 궁을 내주면 쉬어 본다(장군이 아니면 쉬기는 늘 된다).
  if (best <= -MATE / 2) {
    const pass = -negamax(board, other(side), depth - 1, -beta, -a, options);
    if (pass > best && !attackedKing(board, side)) best = pass;
  }
  return best === -Infinity ? 0 : best;
}

/** 지금 `side` 궁을 상대가 바로 잡을 수 있나 */
function attackedKing(board: Board, side: Side): boolean {
  const king = board.indexOf(`${side}K`);
  if (king < 0) return true;
  return pseudoMoves(board, other(side)).some((m) => m.to === king);
}
