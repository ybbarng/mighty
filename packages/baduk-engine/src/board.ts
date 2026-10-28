/** 돌: 1 흑(먼저 둔다), 2 백 */
export type Stone = 1 | 2;
/** 빈 자리는 0 */
export type Cell = 0 | Stone;
/** 길이 크기×크기. 자리 번호는 y*크기+x이고 y=0이 판 위쪽이다 */
export type Board = readonly Cell[];

export const STONE_NAMES: Record<Stone, string> = { 1: "흑", 2: "백" };

/** 가로 줄 이름. 바둑 관례대로 I를 건너뛴다 */
export const COLUMNS = "ABCDEFGHJKLMNOPQRST";

export function other(stone: Stone): Stone {
  return stone === 1 ? 2 : 1;
}

export function sizeOf(board: Board): number {
  return Math.round(Math.sqrt(board.length));
}

export function xyOf(at: number, size: number): [number, number] {
  return [at % size, Math.floor(at / size)];
}

export function indexOf(x: number, y: number, size: number): number {
  return y * size + x;
}

/** 사람에게 보이는 자리 이름: 가로 A~T(I 없음) + 세로 1~N(아래부터). 예: 9줄 판 가운데 "E5" */
export function pointName(at: number, size: number): string {
  const [x, y] = xyOf(at, size);
  return `${COLUMNS[x]}${size - y}`;
}

/** 자리 이름("D4")을 자리 번호로. `pointName`의 반대 */
export function pointAt(name: string, size: number): number {
  const match = /^([A-HJ-T])(\d{1,2})$/.exec(name.trim().toUpperCase());
  if (!match) throw new Error(`자리 이름이 아니다: ${name}`);
  const x = COLUMNS.indexOf(match[1] as string);
  const row = Number(match[2]);
  if (x >= size || row < 1 || row > size) throw new Error(`판 밖이다: ${name}`);
  return indexOf(x, size - row, size);
}

export function emptyBoard(size: number): Cell[] {
  return new Array<Cell>(size * size).fill(0);
}

const NEIGHBORS = new Map<number, number[][]>();

/** 위·아래·왼쪽·오른쪽 이웃 자리(판 안만) */
export function neighbors(at: number, size: number): readonly number[] {
  let table = NEIGHBORS.get(size);
  if (!table) {
    table = [];
    for (let i = 0; i < size * size; i++) {
      const [x, y] = xyOf(i, size);
      const list: number[] = [];
      if (y > 0) list.push(i - size);
      if (y < size - 1) list.push(i + size);
      if (x > 0) list.push(i - 1);
      if (x < size - 1) list.push(i + 1);
      table.push(list);
    }
    NEIGHBORS.set(size, table);
  }
  return table[at] ?? [];
}

/** 화점(판에 찍힌 점) */
export function starPoints(size: number): number[] {
  const lines = size === 9 ? [2, 4, 6] : size === 13 ? [3, 6, 9] : [3, 9, 15];
  const [a, m, b] = lines as [number, number, number];
  const points: [number, number][] =
    size === 19
      ? lines.flatMap((y) => lines.map((x) => [x, y] as [number, number]))
      : [
          [a, a],
          [b, a],
          [m, m],
          [a, b],
          [b, b],
        ];
  return points.map(([x, y]) => indexOf(x, y, size));
}

/** 이 자리 돌과 이어진 무리(같은 색이 위아래좌우로 붙은 돌)와 그 활로(무리에 붙은 빈 자리) */
export function groupOf(
  board: Board,
  at: number,
): { stones: number[]; liberties: number[] } {
  const color = board[at];
  if (!color) return { stones: [], liberties: [] };
  const size = sizeOf(board);
  const seen = new Set<number>([at]);
  const libs = new Set<number>();
  const stack = [at];
  const stones: number[] = [];
  while (stack.length > 0) {
    const p = stack.pop() as number;
    stones.push(p);
    for (const n of neighbors(p, size)) {
      const c = board[n];
      if (c === 0) libs.add(n);
      else if (c === color && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return { stones, liberties: [...libs] };
}

export type PlaceError = "occupied" | "suicide";

/**
 * 돌을 놓아 본다. 활로가 없어진 상대 무리를 따내고, 내 무리 활로가 없으면 자살수라 둘 수 없다.
 * 패(같은 판 되풀이)는 여기서 따지지 않는다(판 기록이 있어야 해서 `match.ts`가 본다)
 */
export function tryPlace(
  board: Board,
  at: number,
  stone: Stone,
):
  | { ok: true; board: Cell[]; captured: number[] }
  | { ok: false; error: PlaceError } {
  if (board[at] !== 0) return { ok: false, error: "occupied" };
  const size = sizeOf(board);
  const next = [...board];
  next[at] = stone;
  const enemy = other(stone);
  const captured: number[] = [];
  for (const n of neighbors(at, size)) {
    if (next[n] !== enemy) continue;
    const group = groupOf(next, n);
    if (group.liberties.length === 0)
      for (const s of group.stones) {
        next[s] = 0;
        captured.push(s);
      }
  }
  if (groupOf(next, at).liberties.length === 0)
    return { ok: false, error: "suicide" };
  return { ok: true, board: next, captured };
}

/**
 * 판 모양의 짧은 지문(같은 판 되풀이를 셀 때). 판 전체 글자를 두 갈래로 섞은 53비트 값이다.
 * 서로 다른 판이 같은 지문을 가질 확률은 무시할 만큼 작다(2^-53 수준)
 */
export function boardHash(board: Board): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < board.length; i++) {
    const c = (board[i] ?? 0) + 1 + i * 3;
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 자리마다 누구 것인가(Tromp-Taylor): 돌이 있으면 그 돌 색,
 * 빈 자리는 이어진 빈 자리 덩어리가 한 색 돌에만 닿으면 그 색, 아니면 0(누구 것도 아님)
 */
export function areaOwners(board: Board): Cell[] {
  const size = sizeOf(board);
  const owners: Cell[] = [...board];
  const done = new Uint8Array(board.length);
  for (let start = 0; start < board.length; start++) {
    if (board[start] !== 0 || done[start]) continue;
    const region: number[] = [];
    const stack = [start];
    done[start] = 1;
    let touches = 0;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      region.push(p);
      for (const n of neighbors(p, size)) {
        const c = board[n] as Cell;
        if (c === 0) {
          if (!done[n]) {
            done[n] = 1;
            stack.push(n);
          }
        } else touches |= c;
      }
    }
    const owner: Cell = touches === 1 ? 1 : touches === 2 ? 2 : 0;
    for (const p of region) owners[p] = owner;
  }
  return owners;
}

/** 자리 세기(덤 빼고): 내 돌 수 + 내 돌로만 둘러싸인 빈 자리 수 */
export function areaScore(board: Board): { black: number; white: number } {
  let black = 0;
  let white = 0;
  for (const o of areaOwners(board)) {
    if (o === 1) black++;
    else if (o === 2) white++;
  }
  return { black, white };
}
