import { nextInt, type RngState } from "@mighty/engine";

/*
 * 컴퓨터가 수를 읽을 때 쓰는 빠른 판. 엔진(`@mighty/baduk-engine`)은 배열을 새로 만들며 규칙을 지키는 데 집중하고,
 * 이 판은 제자리에서 바꾸며 수천 판을 끝까지 둬 보는(플레이아웃) 데 쓴다.
 * 패는 "바로 되따내기 금지"(단순 패)만 본다. 실제로 둘 수는 엔진의 둘 수 있는 자리(같은 판 모양 금지)로 한 번 더 거른다.
 */

/** 1 흑, 2 백 */
export type Color = 1 | 2;

/** 쉬기 */
export const PASS = -1;

export class FastBoard {
  readonly size: number;
  readonly n: number;
  cells: Uint8Array;
  /** 지금 둘 차례 */
  toPlay: Color;
  /** 바로 되따낼 수 없는 자리(없으면 -1) */
  ko = -1;
  /** 마지막 수(쉬기·처음이면 -1) */
  last = -1;
  /** 이어서 쉰 횟수 */
  passes = 0;
  /** 자리마다 위·아래·왼쪽·오른쪽 이웃(판 밖은 -1) */
  private readonly nbr: Int16Array;
  /** 자리마다 대각선 이웃(판 밖은 -1) */
  private readonly diag: Int16Array;
  private readonly mark: Uint32Array;
  private stamp = 0;
  private readonly stack: Int16Array;

  constructor(size: number, cells?: ArrayLike<number>, toPlay: Color = 1) {
    this.size = size;
    this.n = size * size;
    this.cells = new Uint8Array(this.n);
    if (cells) this.cells.set(cells);
    this.toPlay = toPlay;
    this.nbr = tableFor(size).nbr;
    this.diag = tableFor(size).diag;
    this.mark = new Uint32Array(this.n);
    this.stack = new Int16Array(this.n);
  }

  clone(): FastBoard {
    const copy = new FastBoard(this.size, this.cells, this.toPlay);
    copy.ko = this.ko;
    copy.last = this.last;
    copy.passes = this.passes;
    return copy;
  }

  /** 다른 판의 모양을 그대로 옮겨 온다(새로 만들지 않고 되풀이해 쓴다) */
  copyFrom(other: FastBoard): void {
    this.cells.set(other.cells);
    this.toPlay = other.toPlay;
    this.ko = other.ko;
    this.last = other.last;
    this.passes = other.passes;
  }

  private nextStamp(): number {
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.mark.fill(0);
      this.stamp = 1;
    }
    return this.stamp;
  }

  /**
   * `at` 돌 무리의 활로를 `limit`개까지 센다(그만큼 찾으면 멈춘다).
   * `lastLib`에 찾은 활로 하나를 남긴다(활로가 하나면 그 자리)
   */
  liberties(at: number, limit: number): number {
    const color = this.cells[at];
    const s = this.nextStamp();
    const { mark, stack, nbr, cells } = this;
    let top = 0;
    let libs = 0;
    stack[top++] = at;
    mark[at] = s;
    // 활로 표시는 돌 표시와 같은 값을 쓰면 섞이므로 빈 자리에만 쓴다(돌과 빈 자리는 겹치지 않는다).
    while (top > 0) {
      const p = stack[--top] as number;
      const base = p * 4;
      for (let k = 0; k < 4; k++) {
        const q = nbr[base + k] as number;
        if (q < 0 || mark[q] === s) continue;
        const c = cells[q];
        if (c === 0) {
          mark[q] = s;
          this.lastLib = q;
          if (++libs >= limit) return libs;
        } else if (c === color) {
          mark[q] = s;
          stack[top++] = q;
        }
      }
    }
    return libs;
  }

  /** `liberties`가 마지막으로 찾은 활로 */
  lastLib = -1;

  /** `at` 돌 무리를 판에서 들어내고 그 수를 돌려준다 */
  private removeGroup(at: number): number {
    const color = this.cells[at];
    const { stack, nbr, cells } = this;
    let top = 0;
    let removed = 0;
    stack[top++] = at;
    cells[at] = 0;
    while (top > 0) {
      const p = stack[--top] as number;
      removed++;
      const base = p * 4;
      for (let k = 0; k < 4; k++) {
        const q = nbr[base + k] as number;
        if (q >= 0 && cells[q] === color) {
          cells[q] = 0;
          stack[top++] = q;
        }
      }
    }
    return removed;
  }

  /** 지금 둘 차례인 돌이 `at`에 둘 수 있나(빈 자리, 자살수·단순 패 아님) */
  isLegal(at: number): boolean {
    if (this.cells[at] !== 0 || at === this.ko) return false;
    const color = this.toPlay;
    const base = at * 4;
    for (let k = 0; k < 4; k++) {
      const q = this.nbr[base + k] as number;
      if (q < 0) continue;
      const c = this.cells[q];
      if (c === 0) return true;
      if (c === color) {
        if (this.liberties(q, 2) >= 2) return true;
      } else if (this.liberties(q, 2) === 1) return true;
    }
    return false;
  }

  /**
   * `color`의 눈처럼 보이는 자리: 이웃이 모두 내 돌이고, 대각선의 상대 돌이 가운데는 하나 이하·변과 귀는 없다.
   * 이런 자리를 메우면 스스로 눈을 없애므로 컴퓨터는 두지 않는다
   */
  isEye(at: number, color: Color): boolean {
    if (this.cells[at] !== 0) return false;
    const base = at * 4;
    let edge = false;
    for (let k = 0; k < 4; k++) {
      const q = this.nbr[base + k] as number;
      if (q < 0) {
        edge = true;
        continue;
      }
      if (this.cells[q] !== color) return false;
    }
    let bad = 0;
    for (let k = 0; k < 4; k++) {
      const q = this.diag[base + k] as number;
      if (q < 0) {
        edge = true;
        continue;
      }
      const c = this.cells[q];
      if (c !== 0 && c !== color) bad++;
    }
    return edge ? bad === 0 : bad <= 1;
  }

  /** 둔다(둘 수 있는 자리라고 본다). 따낸 돌 수를 돌려준다 */
  play(at: number): number {
    const color = this.toPlay;
    const enemy: Color = color === 1 ? 2 : 1;
    if (at === PASS) {
      this.ko = -1;
      this.last = -1;
      this.passes++;
      this.toPlay = enemy;
      return 0;
    }
    this.cells[at] = color;
    let captured = 0;
    let capturedAt = -1;
    const base = at * 4;
    for (let k = 0; k < 4; k++) {
      const q = this.nbr[base + k] as number;
      if (q < 0 || this.cells[q] !== enemy) continue;
      if (this.liberties(q, 1) === 0) {
        captured += this.removeGroup(q);
        capturedAt = q;
      }
    }
    this.ko = -1;
    if (captured === 1) {
      // 한 점을 따냈고 내 돌이 홀로 활로 하나뿐이면 그 자리는 바로 되따낼 수 없다.
      let alone = true;
      for (let k = 0; k < 4; k++) {
        const q = this.nbr[base + k] as number;
        if (q >= 0 && this.cells[q] === color) alone = false;
      }
      if (alone && this.liberties(at, 2) === 1) this.ko = capturedAt;
    }
    this.last = at;
    this.passes = 0;
    this.toPlay = enemy;
    return captured;
  }

  /** 자리 세기(Tromp-Taylor): 흑 자리 − 백 자리 − 덤 */
  score(komi: number): number {
    const { cells, nbr, stack, mark } = this;
    const s = this.nextStamp();
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const c = cells[i];
      if (c === 1) total++;
      else if (c === 2) total--;
      else if (mark[i] !== s) {
        let top = 0;
        let size = 0;
        let touches = 0;
        stack[top++] = i;
        mark[i] = s;
        while (top > 0) {
          const p = stack[--top] as number;
          size++;
          const base = p * 4;
          for (let k = 0; k < 4; k++) {
            const q = nbr[base + k] as number;
            if (q < 0) continue;
            const d = cells[q] as number;
            if (d === 0) {
              if (mark[q] !== s) {
                mark[q] = s;
                stack[top++] = q;
              }
            } else touches |= d;
          }
        }
        if (touches === 1) total += size;
        else if (touches === 2) total -= size;
      }
    }
    return total - komi;
  }

  /** 이웃 자리(판 밖은 -1) */
  neighbor(at: number, k: number): number {
    return this.nbr[at * 4 + k] as number;
  }

  /** `at` 곁에 `color` 돌이 있나 */
  hasNeighbor(at: number, color: Color): boolean {
    const base = at * 4;
    for (let k = 0; k < 4; k++) {
      const q = this.nbr[base + k] as number;
      if (q >= 0 && this.cells[q] === color) return true;
    }
    return false;
  }

  /**
   * 지금 둘 차례인 돌을 `at`에 두면 그 무리 활로가 몇 개쯤 되나(`limit`까지).
   * 상대 돌을 따내는 수면 넉넉한 것으로 보고 `limit`을 돌려준다. 판은 그대로 둔다
   */
  libertiesAfter(at: number, limit: number): number {
    const color = this.toPlay;
    const base = at * 4;
    for (let k = 0; k < 4; k++) {
      const q = this.nbr[base + k] as number;
      if (q >= 0 && this.cells[q] !== 0 && this.cells[q] !== color)
        if (this.liberties(q, 2) === 1) return limit;
    }
    this.cells[at] = color;
    const libs = this.liberties(at, limit);
    this.cells[at] = 0;
    return libs;
  }
}

interface Table {
  nbr: Int16Array;
  diag: Int16Array;
}
const TABLES = new Map<number, Table>();

function tableFor(size: number): Table {
  let t = TABLES.get(size);
  if (t) return t;
  const n = size * size;
  const nbr = new Int16Array(n * 4).fill(-1);
  const diag = new Int16Array(n * 4).fill(-1);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    nbr.set([at(x, y - 1), at(x, y + 1), at(x - 1, y), at(x + 1, y)], i * 4);
    diag.set(
      [at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1)],
      i * 4,
    );
  }
  t = { nbr, diag };
  TABLES.set(size, t);
  return t;
}

/**
 * 플레이아웃에서 고를 수: 상대 마지막 수 곁에 단수(활로 하나)인 상대 무리가 있으면 따낸다.
 * 아니면 빈 자리 가운데 무작위(둘 수 없는 자리와 내 눈은 뺀다). 둘 곳이 없으면 쉰다
 */
export function playoutMove(
  board: FastBoard,
  rng: RngState,
  empties: Int16Array,
): number {
  const color = board.toPlay;
  const last = board.last;
  if (last >= 0) {
    // 상대 마지막 수 곁: 단수인 상대 무리는 따내고, 단수에 걸린 내 무리는 달아난다.
    for (let k = 0; k < 4; k++) {
      const q = board.neighbor(last, k);
      if (q < 0 || board.cells[q] === 0) continue;
      if (board.liberties(q, 2) !== 1) continue;
      const lib = board.lastLib;
      if (board.cells[q] !== color) {
        if (board.isLegal(lib)) return lib;
      } else if (board.isLegal(lib) && board.libertiesAfter(lib, 2) >= 2)
        return lib;
    }
  }
  let count = 0;
  for (let i = 0; i < board.n; i++)
    if (board.cells[i] === 0) empties[count++] = i;
  // 스스로 단수가 되는 수(두 점 넘는 무리)는 다른 수가 없을 때만 둔다.
  let fallback = PASS;
  while (count > 0) {
    const pick = nextInt(rng, count);
    const at = empties[pick] as number;
    empties[pick] = empties[--count] as number;
    if (board.isEye(at, color) || !board.isLegal(at)) continue;
    if (board.libertiesAfter(at, 2) === 1 && board.hasNeighbor(at, color)) {
      if (fallback === PASS) fallback = at;
      continue;
    }
    return at;
  }
  return fallback;
}

/**
 * 끝까지 무작위로 둬 본다. 둔 자리마다 처음 둔 색을 `first`에 남긴다(같은 수를 먼저 둔 판의 성적, AMAF).
 * 흑 − 백 − 덤 점수를 돌려준다
 */
export function playout(
  board: FastBoard,
  komi: number,
  rng: RngState,
  empties: Int16Array,
  first: Uint8Array | null,
): number {
  const limit = board.n * 3;
  for (let i = 0; i < limit && board.passes < 2; i++) {
    const at = playoutMove(board, rng, empties);
    if (first && at >= 0 && first[at] === 0) first[at] = board.toPlay;
    board.play(at);
  }
  return board.score(komi);
}
