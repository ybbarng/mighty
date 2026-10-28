import {
  applyMove,
  type Board,
  capturedBy,
  inCheck,
  insufficientMaterial,
  type Kind,
  type Move,
  type Position,
  pseudoMoves,
  type Side,
  xyOf,
} from "@mighty/chess-engine";

/** 체크메이트의 값. 남은 깊이를 더해 빨리 메이트하는 쪽을 고른다 */
export const MATE = 1_000_000;

/** 기물 값(폰 100) */
export const VALUE: Record<Kind, number> = {
  K: 0,
  Q: 900,
  R: 500,
  B: 330,
  N: 320,
  P: 100,
};

/*
 * 자리 값(백 쪽에서 본 표, 첫 줄이 8번째 가로줄). 흔히 쓰는 간단한 평가표를 따른다:
 * 폰은 나갈수록, 나이트·비숍은 가운데로, 룩은 7번째 줄, 킹은 중반엔 캐슬링 자리·끝판엔 가운데.
 */
// biome-ignore format: 판 모양 그대로 둔다
const PST: Record<Kind | "KE", readonly number[]> = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
  KE: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

/** 그 편 기물에서 본 자리 값. 흑은 표를 위아래로 뒤집어 읽는다 */
function placeValue(kind: Kind | "KE", side: Side, at: number): number {
  const [x, y] = xyOf(at);
  const index = side === "w" ? at : (7 - y) * 8 + x;
  return PST[kind][index] ?? 0;
}

/** 기물 값 합(킹·폰 빼고). 끝판인지 가늠할 때 쓴다 */
function officers(board: Board, side: Side): number {
  let sum = 0;
  for (const cell of board)
    if (cell !== "" && cell[0] === side && cell[1] !== "P")
      sum += VALUE[cell[1] as Kind];
  return sum;
}

/** 기물 값만 센 판 값(입문이 쓴다) */
export function material(board: Board, side: Side): number {
  let score = 0;
  for (const cell of board) {
    if (cell === "") continue;
    const v = VALUE[cell[1] as Kind];
    score += cell[0] === side ? v : -v;
  }
  return score;
}

/**
 * `side` 쪽에서 본 판 값(폰 100).
 * 기물 값 + 자리 값. 상대가 킹만(또는 거의) 남으면 상대 킹을 구석으로 몰고 내 킹을 붙이는 값을 더한다(끝내기)
 */
export function evaluate(board: Board, side: Side): number {
  const endgame = officers(board, "w") + officers(board, "b") <= 1300;
  let score = 0;
  let wk = -1;
  let bk = -1;
  for (let at = 0; at < 64; at++) {
    const cell = board[at] ?? "";
    if (cell === "") continue;
    const s = cell[0] as Side;
    const kind = cell[1] as Kind;
    if (kind === "K") {
      if (s === "w") wk = at;
      else bk = at;
    }
    const table = kind === "K" && endgame ? "KE" : kind;
    const v = VALUE[kind] + placeValue(table, s, at);
    score += s === side ? v : -v;
  }
  // 끝내기: 앞선 편이 상대 킹을 가장자리로 몰고 킹끼리 가까이 간다.
  if (endgame && wk >= 0 && bk >= 0) {
    const lead = material(board, "w");
    const winner: Side | null = lead >= 300 ? "w" : lead <= -300 ? "b" : null;
    if (winner) {
      const loserKing = winner === "w" ? bk : wk;
      const [lx, ly] = xyOf(loserKing);
      const [ax, ay] = xyOf(winner === "w" ? wk : bk);
      const edge = Math.max(3 - lx, lx - 4) + Math.max(3 - ly, ly - 4);
      const near = 14 - (Math.abs(lx - ax) + Math.abs(ly - ay));
      const mopUp = edge * 10 + near * 4;
      score += winner === side ? mopUp : -mopUp;
    }
  }
  return score;
}

/** 잡는 수를 큰 기물 잡기·작은 기물로 잡기 순으로(MVV-LVA), 승급도 앞에 */
function orderScore(pos: Position, move: Move): number {
  const victim = capturedBy(pos, move);
  const attacker = pos.board[move.from] ?? "";
  let score = 0;
  if (victim !== "")
    score +=
      10_000 + VALUE[victim[1] as Kind] * 10 - VALUE[attacker[1] as Kind] / 10;
  if (move.promotion) score += 9_000 + VALUE[move.promotion];
  return score;
}

export function orderMoves(
  pos: Position,
  moves: Move[],
  first?: Move | null,
  killers?: readonly (Move | undefined)[],
): Move[] {
  const same = (a: Move, b: Move | null | undefined) =>
    !!b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;
  return moves
    .map((m) => {
      let s = orderScore(pos, m);
      if (same(m, first)) s += 1_000_000;
      else if (s === 0 && killers?.some((k) => same(m, k))) s += 5_000;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

/** 탐색 한 번의 셈: 본 판 수와 상한(넘으면 멈춘다) */
export interface SearchContext {
  nodes: number;
  budget: number;
  aborted: boolean;
  /** 깊이마다 잘라 낸 조용한 수(킬러 수) */
  killers: (Move | undefined)[][];
}

export function newContext(budget = Number.POSITIVE_INFINITY): SearchContext {
  return { nodes: 0, budget, aborted: false, killers: [] };
}

/** 잡는 수(와 승급)만 이어 보는 탐색. 눈앞 주고받기를 끝까지 따진다 */
export function quiesce(
  pos: Position,
  alpha: number,
  beta: number,
  ctx: SearchContext,
  depth = 8,
): number {
  ctx.nodes += 1;
  const standPat = evaluate(pos.board, pos.turn);
  if (standPat >= beta || depth === 0) return standPat;
  let a = Math.max(alpha, standPat);
  const moves = orderMoves(pos, pseudoMoves(pos, true));
  for (const move of moves) {
    const next = applyMove(pos, move);
    if (inCheck(next.board, pos.turn)) continue;
    const score = -quiesce(next, -beta, -a, ctx, depth - 1);
    if (score >= beta) return score;
    if (score > a) a = score;
  }
  return a;
}

/**
 * 알파베타(negamax). 둘 차례 편에서 본 값.
 * 수는 내 킹이 체크로 남는지 둘 때마다 보고, 둘 수가 하나도 없으면 체크메이트(지는 값)나 스테일메이트(0)다
 */
export function negamax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
  ply = 1,
): number {
  if (ctx.nodes >= ctx.budget) {
    ctx.aborted = true;
    return 0;
  }
  if (pos.halfmove >= 100 || insufficientMaterial(pos.board)) return 0;
  const checked = inCheck(pos.board, pos.turn);
  // 체크를 받으면 한 수 더 본다(체크를 피하는 수를 놓치지 않게).
  // 체크가 끝없이 이어지는 판에서 깊어지지 않게 늘리는 것은 세 번까지만.
  if (depth <= 0 && (!checked || depth < -2))
    return quiesce(pos, alpha, beta, ctx);
  ctx.nodes += 1;
  if (!ctx.killers[ply]) ctx.killers[ply] = [];
  const killers = ctx.killers[ply];
  let best = Number.NEGATIVE_INFINITY;
  let a = alpha;
  let played = 0;
  for (const move of orderMoves(pos, pseudoMoves(pos), null, killers)) {
    const next = applyMove(pos, move);
    if (inCheck(next.board, pos.turn)) continue;
    played += 1;
    const score = -negamax(next, depth - 1, -beta, -a, ctx, ply + 1);
    if (ctx.aborted) return 0;
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) {
      if (capturedBy(pos, move) === "" && !move.promotion) {
        killers[1] = killers[0];
        killers[0] = move;
      }
      break;
    }
  }
  if (played === 0) return checked ? -MATE + ply : 0;
  return best;
}
