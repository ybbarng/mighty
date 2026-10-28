import { CELLS, SIZE, type Variant } from "./rules";

/** 0 빈칸, 1 흑, 2 백 */
export type Cell = 0 | 1 | 2;
export type Stone = 1 | 2;
export type Board = readonly Cell[];

/** 금지 수 이름. 일반 규칙은 3·3만, 렌주는 흑에게 셋 모두 */
export type Forbidden = "3·3" | "4·4" | "장목";

/** 가로·세로·두 대각선 */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** 열린 삼을 판정하며 금지 여부를 다시 묻는 깊이 한도. 실제 판에서는 두세 번 안에 끝난다 */
const MAX_DEPTH = 6;

export function emptyBoard(): Cell[] {
  return new Array<Cell>(CELLS).fill(0);
}

export function other(stone: Stone): Stone {
  return stone === 1 ? 2 : 1;
}

export function xyOf(at: number): [number, number] {
  return [at % SIZE, Math.floor(at / SIZE)];
}

export function indexOf(x: number, y: number): number {
  return y * SIZE + x;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

/** 사람에게 보이는 자리 이름. 가로 A~O, 세로는 아래부터 1~15. 예: 가운데 H8 */
export function pointName(at: number): string {
  const [x, y] = xyOf(at);
  return `${String.fromCharCode(65 + x)}${SIZE - y}`;
}

/** 이 색이 이기려면 정확히 다섯이어야 하나(아니면 다섯 이상) */
export function needsExactFive(variant: Variant, stone: Stone): boolean {
  if (variant === "free") return false;
  if (variant === "renju") return stone === 1;
  return true;
}

function fiveLength(length: number, exact: boolean): boolean {
  return exact ? length === 5 : length >= 5;
}

/** (x, y)를 지나는 `stone` 색 연속 줄의 양 끝(방향 기준 오프셋). (x, y)에는 그 색 돌이 있어야 한다 */
function runAt(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  stone: Stone,
): [number, number] {
  let from = 0;
  while (
    inBounds(x + (from - 1) * dx, y + (from - 1) * dy) &&
    board[indexOf(x + (from - 1) * dx, y + (from - 1) * dy)] === stone
  )
    from--;
  let to = 0;
  while (
    inBounds(x + (to + 1) * dx, y + (to + 1) * dy) &&
    board[indexOf(x + (to + 1) * dx, y + (to + 1) * dy)] === stone
  )
    to++;
  return [from, to];
}

/**
 * (x, y)에 돌을 둔 뒤, 그 돌로 이긴 줄의 칸들. 없으면 null.
 * 다섯 이상이 이기는 규칙에서 여섯 줄이면 여섯 칸 모두를 돌려준다
 */
export function winningLine(
  board: Board,
  at: number,
  variant: Variant,
): number[] | null {
  const stone = board[at];
  if (stone !== 1 && stone !== 2) return null;
  const [x, y] = xyOf(at);
  const exact = needsExactFive(variant, stone);
  for (const [dx, dy] of DIRS) {
    const [from, to] = runAt(board, x, y, dx, dy, stone);
    if (fiveLength(to - from + 1, exact)) {
      const line: number[] = [];
      for (let k = from; k <= to; k++)
        line.push(indexOf(x + k * dx, y + k * dy));
      return line;
    }
  }
  return null;
}

/**
 * (x, y)를 지나는 한 줄에서, 빈칸 하나에 같은 색을 더 두면 다섯이 되는 자리(오프셋).
 * 그 다섯은 (x, y)와 `cover`의 오프셋을 모두 품어야 한다
 */
function completions(
  board: Cell[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  stone: Stone,
  exact: boolean,
  cover: readonly number[],
): number[] {
  const found: number[] = [];
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const qx = x + k * dx;
    const qy = y + k * dy;
    if (!inBounds(qx, qy)) continue;
    const q = indexOf(qx, qy);
    if (board[q] !== 0) continue;
    board[q] = stone;
    const [from, to] = runAt(board, x, y, dx, dy, stone);
    board[q] = 0;
    if (
      fiveLength(to - from + 1, exact) &&
      k >= from &&
      k <= to &&
      cover.every((c) => c >= from && c <= to)
    )
      found.push(k);
  }
  return found;
}

/** 한 줄의 사 개수. 열린 사(.XXXX.)는 하나, 같은 줄의 X.XXX.X는 둘로 센다 */
function fourCount(
  board: Cell[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  stone: Stone,
  exact: boolean,
): number {
  const ks = completions(board, x, y, dx, dy, stone, exact, []);
  if (ks.length === 2 && Math.abs((ks[0] ?? 0) - (ks[1] ?? 0)) === 5) return 1;
  return ks.length;
}

/**
 * 한 줄이 열린 삼인가: 빈칸 하나를 더 두면 (x, y)를 품은 열린 사가 되고, 그 수가 금지가 아니다(렌주 정의)
 */
function isOpenThree(
  board: Cell[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  stone: Stone,
  variant: Variant,
  depth: number,
): boolean {
  const exact = needsExactFive(variant, stone);
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const ex = x + k * dx;
    const ey = y + k * dy;
    if (!inBounds(ex, ey)) continue;
    const e = indexOf(ex, ey);
    if (board[e] !== 0) continue;
    board[e] = stone;
    const ks = completions(board, x, y, dx, dy, stone, exact, [k]);
    const straight =
      ks.length === 2 && Math.abs((ks[0] ?? 0) - (ks[1] ?? 0)) === 5;
    const ok =
      straight && forbiddenPlaced(board, e, stone, variant, depth + 1) === null;
    board[e] = 0;
    if (ok) return true;
  }
  return false;
}

/** 이 규칙에서 이 색에게 금지 수가 있나 */
export function hasForbidden(variant: Variant, stone: Stone): boolean {
  if (variant === "free") return false;
  if (variant === "renju") return stone === 1;
  return true;
}

/** `at`에 이미 둔 돌이 금지 수인가. 다섯을 만들면 금지가 아니다 */
function forbiddenPlaced(
  board: Cell[],
  at: number,
  stone: Stone,
  variant: Variant,
  depth: number,
): Forbidden | null {
  if (!hasForbidden(variant, stone) || depth > MAX_DEPTH) return null;
  const [x, y] = xyOf(at);
  const exact = needsExactFive(variant, stone);
  let overline = false;
  for (const [dx, dy] of DIRS) {
    const [from, to] = runAt(board, x, y, dx, dy, stone);
    const length = to - from + 1;
    if (length === 5) return null;
    if (length > 5) overline = true;
  }
  if (variant !== "renju") {
    let threes = 0;
    for (const [dx, dy] of DIRS)
      if (isOpenThree(board, x, y, dx, dy, stone, variant, depth)) threes++;
    return threes >= 2 ? "3·3" : null;
  }
  if (overline) return "장목";
  let fours = 0;
  for (const [dx, dy] of DIRS)
    fours += fourCount(board, x, y, dx, dy, stone, exact);
  if (fours >= 2) return "4·4";
  let threes = 0;
  for (const [dx, dy] of DIRS)
    if (isOpenThree(board, x, y, dx, dy, stone, variant, depth)) threes++;
  return threes >= 2 ? "3·3" : null;
}

/** 빈칸 `at`에 `stone`을 두면 금지 수인가. 금지면 그 이름 */
export function forbiddenReason(
  board: Board,
  at: number,
  stone: Stone,
  variant: Variant,
): Forbidden | null {
  if (board[at] !== 0 || !hasForbidden(variant, stone)) return null;
  const work = [...board];
  work[at] = stone;
  return forbiddenPlaced(work, at, stone, variant, 0);
}

/** 둘 수 있는 빈칸 모두(금지 수 제외) */
export function legalMoves(
  board: Board,
  stone: Stone,
  variant: Variant,
): number[] {
  const moves: number[] = [];
  for (let at = 0; at < CELLS; at++)
    if (board[at] === 0 && forbiddenReason(board, at, stone, variant) === null)
      moves.push(at);
  return moves;
}
