import type { RngState } from "@mighty/engine";

import { type Color, FastBoard, PASS, playout } from "./fast-board";

/*
 * 몬테카를로 나무 탐색(UCT + RAVE). 수마다 "끝까지 무작위로 둬 본 판"의 승률을 모아 좋은 수를 고른다.
 * - 나무: 많이 이긴 수를 더 깊이 읽는다(UCT).
 * - RAVE: 한 판을 둬 볼 때 나온 모든 수를 "그 수를 먼저 뒀으면"의 성적으로도 센다. 적은 횟수로도 빨리 감을 잡는다.
 * 시간이 아니라 둬 볼 판 수로 끊어, 같은 시드면 늘 같은 수가 나온다(시험이 기기 속도에 흔들리지 않는다).
 */

interface Node {
  /** 이 마디로 오는 수와 그 수를 둔 색 */
  move: number;
  color: Color;
  visits: number;
  /** `color` 쪽이 이긴 판 수 */
  wins: number;
  raveVisits: number;
  raveWins: number;
  children: Node[] | null;
}

/** 이 판에서 둘 만한 수: 둘 수 있고 내 눈을 메우지 않는 자리 */
export function candidateMoves(board: FastBoard): number[] {
  const list: number[] = [];
  for (let i = 0; i < board.n; i++)
    if (
      board.cells[i] === 0 &&
      !board.isEye(i, board.toPlay) &&
      board.isLegal(i)
    )
      list.push(i);
  return list;
}

function newNode(move: number, color: Color): Node {
  return {
    move,
    color,
    visits: 0,
    wins: 0,
    raveVisits: 0,
    raveWins: 0,
    children: null,
  };
}

/** RAVE를 얼마나 믿나: 둔 횟수가 적을 때는 RAVE를, 많아지면 실제 승률을 본다 */
const RAVE_EQUIV = 600;
/** 나무에서 덜 읽은 수를 더 읽게 하는 정도 */
const EXPLORE = 0.2;

function select(node: Node): Node {
  const children = node.children as Node[];
  const logN = Math.log(node.visits + 1);
  let best = children[0] as Node;
  let bestValue = -Infinity;
  for (const c of children) {
    let value: number;
    if (c.visits === 0 && c.raveVisits === 0) value = 10;
    else {
      const q = c.visits > 0 ? c.wins / c.visits : 0.5;
      const amaf = c.raveVisits > 0 ? c.raveWins / c.raveVisits : 0.5;
      const beta = Math.sqrt(RAVE_EQUIV / (3 * c.visits + RAVE_EQUIV));
      value =
        (1 - beta) * q +
        beta * amaf +
        EXPLORE * Math.sqrt(logN / (c.visits + 1));
    }
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  }
  return best;
}

export interface SearchResult {
  /** 고른 수(-1 쉬기) */
  move: number;
  /** 수마다 둬 본 판 수와 그 수를 둔 쪽의 승률 */
  stats: { move: number; visits: number; winRate: number }[];
  /** 고른 수의 승률 */
  winRate: number;
}

/**
 * `root`에서 `playouts`판을 둬 보고 가장 많이 읽은 수를 고른다.
 * `allowed`가 있으면 맨 위에서는 그 자리만 본다(엔진이 허락한 자리, 같은 판 모양 금지까지 지킨다).
 * `rave`를 끄면 RAVE 없이 나무만 쓴다. `depth1`이면 나무를 키우지 않는다(맨 위 수마다 승률만 보는 단순 몬테카를로)
 */
export function search(
  root: FastBoard,
  komi: number,
  playouts: number,
  rng: RngState,
  options: {
    allowed?: readonly number[];
    rave?: boolean;
    depth1?: boolean;
  } = {},
): SearchResult {
  const useRave = options.rave ?? true;
  const me = root.toPlay;
  const top = newNode(PASS, me === 1 ? 2 : 1);
  const allowed = options.allowed ? new Set(options.allowed) : null;
  top.children = candidateMoves(root)
    .filter((m) => !allowed || allowed.has(m))
    .map((m) => newNode(m, me));
  if (top.children.length === 0) return { move: PASS, stats: [], winRate: 0 };

  const board = new FastBoard(root.size);
  const empties = new Int16Array(root.n);
  const first = new Uint8Array(root.n);
  const path: Node[] = [];

  for (let i = 0; i < playouts; i++) {
    board.copyFrom(root);
    first.fill(0);
    path.length = 0;
    let node = top;
    path.push(node);
    // 나무를 따라 내려간다.
    while (node.children && node.children.length > 0) {
      node = select(node);
      first[node.move] ||= node.color;
      board.play(node.move);
      path.push(node);
      if (options.depth1) break;
    }
    // 처음 와 본 마디는 한 번 둬 본 뒤에 펼친다.
    if (!options.depth1 && node.children === null && node.visits > 0) {
      const color = board.toPlay;
      node.children = candidateMoves(board).map((m) => newNode(m, color));
      if (node.children.length > 0) {
        node = select(node);
        first[node.move] ||= node.color;
        board.play(node.move);
        path.push(node);
      }
    }
    const score = playout(board, komi, rng, empties, useRave ? first : null);
    const winner: Color = score > 0 ? 1 : 2;
    for (const n of path) {
      n.visits++;
      if (n.color === winner) n.wins++;
      if (!useRave || !n.children) continue;
      for (const c of n.children) {
        if (first[c.move] !== c.color) continue;
        c.raveVisits++;
        if (c.color === winner) c.raveWins++;
      }
    }
  }

  let best = top.children[0] as Node;
  for (const c of top.children)
    if (
      c.visits > best.visits ||
      (c.visits === best.visits && c.wins > best.wins)
    )
      best = c;
  return {
    move: best.move,
    stats: top.children.map((c) => ({
      move: c.move,
      visits: c.visits,
      winRate: c.visits > 0 ? c.wins / c.visits : 0,
    })),
    winRate: best.visits > 0 ? best.wins / best.visits : 0,
  };
}

/** 이 수를 둔 뒤 `playouts`판을 둬 본 승률(둔 쪽에서 본 값). 다시 보기 해설이 쓴다 */
export function moveWinRate(
  root: FastBoard,
  move: number,
  komi: number,
  playouts: number,
  rng: RngState,
): number {
  const me = root.toPlay;
  const board = new FastBoard(root.size);
  const empties = new Int16Array(root.n);
  let wins = 0;
  for (let i = 0; i < playouts; i++) {
    board.copyFrom(root);
    board.play(move);
    const score = playout(board, komi, rng, empties, null);
    if ((score > 0 ? 1 : 2) === me) wins++;
  }
  return wins / playouts;
}
