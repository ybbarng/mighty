import {
  type Board,
  boardHash,
  type Cell,
  groupOf,
  neighbors,
  other,
  type Stone,
  sizeOf,
  tryPlace,
} from "./board";

/*
 * 바둑 문제(수 배우기, docs/23)를 풀고 검증하는 도우미. 작은 장면에서 "정답이 하나뿐인지"를 엔진으로 본다.
 *
 * 1. 잡기(따내기·축·장문): 노리는 돌 무리를 `n`수 안에 따낼 수 있나.
 *    받는 쪽 후보는 그 무리 활로로 뻗기, 무리에 붙은 상대 돌 따내기·단수 치기, 쉬기로 좁힌다(돌 주위 싸움만 본다).
 *    공격하는 쪽은 첫 수는 판 전체를, 그다음은 무리 활로와 그 둘레만 본다.
 * 2. 사활(두 눈 만들기·눈 빼앗기): 둘러싸인 무리가 정해진 빈 자리 안에서만 두어 "두 눈으로 산 모양"이 되나.
 *    산 모양은 벤슨(Benson) 방법으로 가린다: 상대가 몇 수를 두어도 잡히지 않는 무리(쉬어도 사는 무리).
 *
 * 패(같은 판 되풀이)는 읽는 길 위에서 같은 판이 다시 나오면 둘 수 없는 것으로 본다.
 */

/** 무리의 활로 수 */
export function libertyCount(board: Board, at: number): number {
  return groupOf(board, at).liberties.length;
}

/** 돌을 놓아 본다. 둘 수 없으면 null */
function place(board: Board, at: number, stone: Stone, path: Set<string>) {
  const tried = tryPlace(board, at, stone);
  if (!tried.ok) return null;
  const key = boardHash(tried.board);
  if (path.has(key)) return null;
  return { board: tried.board, key, captured: tried.captured };
}

/** 이 무리에 붙은 상대 무리들의 대표 자리와 활로 */
function adjacentEnemies(board: Board, at: number) {
  const size = sizeOf(board);
  const { stones } = groupOf(board, at);
  const color = board[at] as Stone;
  const seen = new Set<number>();
  const out: { liberties: number[] }[] = [];
  for (const s of stones)
    for (const n of neighbors(s, size)) {
      if (board[n] !== other(color) || seen.has(n)) continue;
      const g = groupOf(board, n);
      for (const x of g.stones) seen.add(x);
      out.push({ liberties: g.liberties });
    }
  return out;
}

/** 받는 쪽 후보: 활로로 뻗기, 붙은 상대 무리 따내기·단수 치기 */
function defenseCandidates(board: Board, target: number): number[] {
  const set = new Set(groupOf(board, target).liberties);
  for (const e of adjacentEnemies(board, target))
    if (e.liberties.length <= 2) for (const l of e.liberties) set.add(l);
  return [...set];
}

/** 공격하는 쪽 후보: 무리 활로와 활로 둘레 빈 자리 */
function attackCandidates(board: Board, target: number): number[] {
  const size = sizeOf(board);
  const libs = groupOf(board, target).liberties;
  const set = new Set(libs);
  if (libs.length >= 2)
    for (const l of libs)
      for (const n of neighbors(l, size)) if (board[n] === 0) set.add(n);
  return [...set];
}

/**
 * `attacker`가 둘 차례에, 노리는 무리(`target` 자리의 돌)를 `n`수 안에 따낼 수 있나.
 * 받는 쪽은 무엇을 두든(후보 안에서, 쉬기 포함) 막지 못해야 한다
 */
export function canCapture(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  if (board[target] !== other(attacker)) return true;
  if (n <= 0) return false;
  // 한 수에 활로는 하나만 줄일 수 있다. 받는 쪽이 쉬기만 해도 활로가 남는다.
  if (libertyCount(board, target) > n) return false;
  const key = `${boardHash(board)}:${n}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  let result = false;
  for (const at of attackCandidates(board, target)) {
    if (capturesAfter(board, attacker, target, at, n, path, memo)) {
      result = true;
      break;
    }
  }
  memo.set(key, result);
  return result;
}

/** `attacker`가 `at`에 두면 남은 `n`수(이 수 포함) 안에 따내나 */
function capturesAfter(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
  n: number,
  path: Set<string>,
  memo: Map<string, boolean>,
): boolean {
  const next = place(board, at, attacker, path);
  if (!next) return false;
  if (next.board[target] !== other(attacker)) return true;
  if (n <= 1) return false;
  const defender = other(attacker);
  path.add(next.key);
  try {
    // 쉬기
    if (!canCapture(next.board, attacker, target, n - 1, path, memo))
      return false;
    for (const d of defenseCandidates(next.board, target)) {
      const reply = place(next.board, d, defender, path);
      if (!reply) continue;
      path.add(reply.key);
      const ok = canCapture(reply.board, attacker, target, n - 1, path, memo);
      path.delete(reply.key);
      if (!ok) return false;
    }
    return true;
  } finally {
    path.delete(next.key);
  }
}

/** `attacker`가 `at`에 두면, 이 수를 포함해 `n`수 안에 노리는 무리를 따내나 */
export function capturesWithin(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
  n: number,
): boolean {
  return capturesAfter(
    board,
    attacker,
    target,
    at,
    n,
    new Set([boardHash(board)]),
    new Map(),
  );
}

/** 첫 수로 판 어디든 두어, 노리는 무리를 `n`수 안에 따내는 수들 */
export function captureMoves(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
): number[] {
  const path = new Set([boardHash(board)]);
  const memo = new Map<string, boolean>();
  const out: number[] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] !== 0) continue;
    if (capturesAfter(board, attacker, target, at, n, path, memo)) out.push(at);
  }
  return out;
}

/** 이 판에서 `n`수 안에 따내려면 몇 수가 드나(못 따내면 null). 받는 쪽 응수를 고를 때 쓴다 */
export function movesToCapture(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
): number | null {
  for (let k = 0; k <= n; k++)
    if (canCapture(board, attacker, target, k)) return k;
  return null;
}

/**
 * 받는 쪽(노리는 무리 편)의 응수: 공격하는 쪽이 따내는 데 가장 오래 걸리게 하는 후보.
 * 같은 판은 늘 같은 수(후보 차례대로 첫 것)
 */
export function bestDefense(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
): number | null {
  const defender = other(attacker);
  let best: number | null = null;
  let bestCost = -1;
  for (const d of defenseCandidates(board, target)) {
    const tried = tryPlace(board, d, defender);
    if (!tried.ok || tried.board[target] !== defender) continue;
    const cost = movesToCapture(tried.board, attacker, target, n) ?? n + 1;
    if (cost > bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  return best;
}

/**
 * 벤슨 방법: `color` 무리 가운데 상대가 몇 수를 두어도(그 편이 쉬기만 해도) 잡히지 않는 돌 자리.
 * 무리마다 "그 무리 활로로만 이뤄진 빈 영역(눈)"이 둘 이상이면 산 것이다
 */
export function passAliveStones(board: Board, color: Stone): Set<number> {
  const size = sizeOf(board);
  // 무리
  const chainOf = new Map<number, number>();
  const chains: number[][] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] !== color || chainOf.has(at)) continue;
    const { stones } = groupOf(board, at);
    for (const s of stones) chainOf.set(s, chains.length);
    chains.push(stones);
  }
  // 영역: `color`가 아닌 자리가 이어진 덩어리
  const regionOf = new Map<number, number>();
  const regions: number[][] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] === color || regionOf.has(at)) continue;
    const stack = [at];
    const region: number[] = [];
    regionOf.set(at, regions.length);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      region.push(p);
      for (const n of neighbors(p, size))
        if (board[n] !== color && !regionOf.has(n)) {
          regionOf.set(n, regions.length);
          stack.push(n);
        }
    }
    regions.push(region);
  }
  const liberties = chains.map(
    (stones) => new Set(groupOf(board, stones[0] as number).liberties),
  );
  /** 영역이 무리에게 "눈"인가: 영역의 빈 자리가 모두 그 무리 활로 */
  const vital = (r: number, c: number) =>
    (regions[r] as number[]).every(
      (p) => board[p] !== 0 || (liberties[c] as Set<number>).has(p),
    );
  /** 영역을 둘러싼 무리들 */
  const bordering = (r: number) => {
    const set = new Set<number>();
    for (const p of regions[r] as number[])
      for (const n of neighbors(p, size)) {
        const c = chainOf.get(n);
        if (c !== undefined) set.add(c);
      }
    return set;
  };
  let alive = new Set(chains.map((_, i) => i));
  let healthy = new Set(regions.map((_, i) => i));
  for (;;) {
    // 영역을 둘러싼 무리가 모두 살아 있어야 그 영역이 쓸모 있다
    healthy = new Set(
      [...healthy].filter((r) => [...bordering(r)].every((c) => alive.has(c))),
    );
    const next = new Set(
      [...alive].filter((c) => {
        let eyes = 0;
        for (const r of healthy) if (bordering(r).has(c) && vital(r, c)) eyes++;
        return eyes >= 2;
      }),
    );
    if (next.size === alive.size) break;
    alive = next;
  }
  const out = new Set<number>();
  for (const c of alive) for (const s of chains[c] as number[]) out.add(s);
  return out;
}

/** 사활을 읽는 판 둘레: 이 빈 자리들 안에서만 둔다 */
export interface LifeProblem {
  /** 살리거나 잡을 무리의 돌 하나 */
  target: number;
  /** 두어 볼 빈 자리 */
  area: readonly number[];
}

/**
 * 사는 쪽(`target` 편)이 `toPlay` 차례에 시작해, 정한 자리 안에서 두어 `depth`수(두 편 합) 안에 산 모양이 되나.
 * 잡는 쪽은 무엇을 두든(정한 자리 안, 쉬기 포함) 막지 못해야 한다. 따내면 잡은 것이다
 */
export function canLive(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  const owner = board[problem.target];
  if (!owner) return false;
  if (passAliveStones(board, owner).has(problem.target)) return true;
  if (depth <= 0) return false;
  const key = `${boardHash(board)}:${toPlay}:${depth}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  let result: boolean;
  if (toPlay === owner) {
    // 사는 쪽: 한 수라도 살면 산다. 쉬기는 살 길이 아니다(산 모양이 아니면 그대로다)
    result = false;
    for (const at of problem.area) {
      const next = place(board, at, toPlay, path);
      if (!next) continue;
      path.add(next.key);
      const ok = canLive(
        next.board,
        problem,
        other(toPlay),
        depth - 1,
        path,
        memo,
      );
      path.delete(next.key);
      if (ok) {
        result = true;
        break;
      }
    }
  } else {
    // 잡는 쪽: 모든 수(쉬기 포함)에 사는 쪽이 살아야 산다
    result = canLive(board, problem, other(toPlay), depth - 1, path, memo);
    if (result)
      for (const at of problem.area) {
        const next = place(board, at, toPlay, path);
        if (!next) continue;
        path.add(next.key);
        const ok =
          next.board[problem.target] === owner &&
          canLive(next.board, problem, other(toPlay), depth - 1, path, memo);
        path.delete(next.key);
        if (!ok) {
          result = false;
          break;
        }
      }
  }
  memo.set(key, result);
  return result;
}

/**
 * 잡는 쪽(`target` 상대 편)이 정한 자리 안에서 두어 `depth`수(두 편 합) 안에 그 무리를 따내나.
 * 사는 쪽은 무엇을 두든(정한 자리 안, 쉬기 포함) 막지 못해야 한다. 빅(세키)처럼 따낼 수 없으면 잡은 것이 아니다
 */
export function canKill(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  const owner = board[problem.target];
  if (!owner) return true;
  if (depth <= 0) return false;
  if (passAliveStones(board, owner).has(problem.target)) return false;
  const key = `${boardHash(board)}:${toPlay}:${depth}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  const killer = other(owner);
  /** 이 수(null이면 쉬기) 뒤 결과 */
  const after = (at: number | null): boolean | null => {
    if (at === null)
      return canKill(board, problem, other(toPlay), depth - 1, path, memo);
    const next = place(board, at, toPlay, path);
    if (!next) return null;
    if (next.board[problem.target] !== owner) return true;
    path.add(next.key);
    const ok = canKill(
      next.board,
      problem,
      other(toPlay),
      depth - 1,
      path,
      memo,
    );
    path.delete(next.key);
    return ok;
  };
  const moves: (number | null)[] = [...problem.area, null];
  let result: boolean;
  if (toPlay === killer) {
    result = false;
    for (const at of moves)
      if (after(at) === true) {
        result = true;
        break;
      }
  } else {
    result = true;
    for (const at of moves)
      if (after(at) === false) {
        result = false;
        break;
      }
  }
  memo.set(key, result);
  return result;
}

/**
 * 사활 문제의 첫 수 가운데 정답들.
 * `toPlay`가 사는 쪽이면 두어서 산 모양을 만들 수 있게 되는 수,
 * 잡는 쪽이면 두어서 상대를 끝내 따낼 수 있게 되는 수
 */
export function lifeKeyMoves(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
): number[] {
  const owner = board[problem.target] as Cell;
  const out: number[] = [];
  for (const at of problem.area) {
    const path = new Set([boardHash(board)]);
    const next = place(board, at, toPlay, path);
    if (!next) continue;
    path.add(next.key);
    const good =
      toPlay === owner
        ? canLive(next.board, problem, other(toPlay), depth - 1, path)
        : next.board[problem.target] !== owner ||
          canKill(next.board, problem, other(toPlay), depth - 1, path);
    if (good) out.push(at);
  }
  return out;
}

/**
 * 사활 문제의 첫 수 가운데 틀린 수가 정말 반대 결과가 되는가(빅이나 애매한 결과가 없는가).
 * 사는 쪽 문제면 정답 말고는 모두 잡히고, 잡는 쪽 문제면 정답 말고는 모두 산다
 */
export function lifeWrongMovesFail(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  answers: readonly number[],
): boolean {
  const owner = board[problem.target] as Stone;
  for (const at of problem.area) {
    if (answers.includes(at)) continue;
    const path = new Set([boardHash(board)]);
    const next = place(board, at, toPlay, path);
    if (!next) continue;
    path.add(next.key);
    const fails =
      toPlay === owner
        ? next.board[problem.target] !== owner ||
          canKill(next.board, problem, other(toPlay), depth - 1, path)
        : canLive(next.board, problem, other(toPlay), depth - 1, path);
    if (!fails) return false;
  }
  return true;
}
