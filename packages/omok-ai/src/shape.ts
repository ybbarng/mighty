import {
  type Board,
  CELLS,
  type Cell,
  indexOf,
  SIZE,
  type Stone,
  xyOf,
} from "@mighty/omok-engine";

/**
 * 판 모양 점수. 판을 다섯 칸짜리 창(가로·세로·두 대각선)으로 모두 나누고,
 * 상대 돌이 없는 창마다 내 돌 수에 따라 점수를 준다. 열린 삼(.XXX.)은 창 둘에 걸쳐 막힌 삼보다 점수가 크다.
 */
const WEIGHT = [0, 1, 12, 160, 3000, 1_000_000] as const;

/** 다섯 칸 창 모두 */
const WINDOWS: number[][] = [];
/** 칸마다 그 칸을 품은 창 번호 */
const WINDOWS_OF: number[][] = Array.from({ length: CELLS }, () => []);

for (const [dx, dy] of [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const ex = x + 4 * dx;
      const ey = y + 4 * dy;
      if (ex < 0 || ex >= SIZE || ey < 0 || ey >= SIZE) continue;
      const cells = [0, 1, 2, 3, 4].map((k) => indexOf(x + k * dx, y + k * dy));
      const id = WINDOWS.length;
      WINDOWS.push(cells);
      for (const c of cells) WINDOWS_OF[c]?.push(id);
    }
}

/** 창 안의 흑·백 돌 수 */
function counts(board: Board, cells: readonly number[]): [number, number] {
  let black = 0;
  let white = 0;
  for (const c of cells) {
    const v = board[c];
    if (v === 1) black++;
    else if (v === 2) white++;
  }
  return [black, white];
}

/**
 * 빈칸 `at`에 `stone`을 두면 얼마나 좋아지나(그 색의 모양 점수가 늘어나는 양).
 * 상대 색으로 부르면 그 자리를 막는 값어치가 된다
 */
export function placeGain(board: Board, at: number, stone: Stone): number {
  let gain = 0;
  for (const id of WINDOWS_OF[at] ?? []) {
    const [black, white] = counts(board, WINDOWS[id] ?? []);
    const mine = stone === 1 ? black : white;
    const theirs = stone === 1 ? white : black;
    if (theirs > 0) continue;
    gain += (WEIGHT[mine + 1] ?? 0) - (WEIGHT[mine] ?? 0);
  }
  return gain;
}

/** 판 전체 모양 점수(`stone` 쪽에서 본 값). 다음에 둘 쪽이 조금 유리하게 상대 점수를 덜 센다 */
export function evaluate(board: Board, stone: Stone): number {
  let mine = 0;
  let theirs = 0;
  for (const cells of WINDOWS) {
    const [black, white] = counts(board, cells);
    if (black > 0 && white > 0) continue;
    if (black > 0) {
      if (stone === 1) mine += WEIGHT[black] ?? 0;
      else theirs += WEIGHT[black] ?? 0;
    } else if (white > 0) {
      if (stone === 2) mine += WEIGHT[white] ?? 0;
      else theirs += WEIGHT[white] ?? 0;
    }
  }
  return mine - theirs * 0.9;
}

/** 돌 근처(두 칸 안) 빈칸. 빈 판이면 가운데 */
export function nearbyEmpties(board: readonly Cell[]): number[] {
  const near = new Set<number>();
  let any = false;
  for (let at = 0; at < CELLS; at++) {
    if (board[at] === 0) continue;
    any = true;
    const [x, y] = xyOf(at);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const n = indexOf(nx, ny);
        if (board[n] === 0) near.add(n);
      }
  }
  if (!any) return [indexOf(7, 7)];
  return [...near];
}
