import { CELLS, HEIGHT, WIDTH } from "./rules";

/** 편: 초(楚, 먼저 둔다, 판 아래)와 한(漢, 판 위) */
export type Side = "c" | "h";
/** 기물: 궁(K)·사(A)·차(R)·포(C)·마(N)·상(E)·졸/병(P) */
export type Kind = "K" | "A" | "R" | "C" | "N" | "E" | "P";
export type Piece = `${Side}${Kind}`;
/** 빈칸은 "" */
export type Cell = Piece | "";
export type Board = readonly Cell[];

export interface Move {
  from: number;
  to: number;
}

/** 기물 점수(docs/22 1절). 궁은 점수가 없다 */
export const PIECE_VALUE: Record<Kind, number> = {
  K: 0,
  A: 3,
  R: 13,
  C: 7,
  N: 5,
  E: 3,
  P: 2,
};

/** 한은 뒤에 두는 대신 받는 덤 */
export const HAN_BONUS = 1.5;

export const KIND_NAMES: Record<Kind, string> = {
  K: "궁",
  A: "사",
  R: "차",
  C: "포",
  N: "마",
  E: "상",
  P: "졸",
};

export const SIDE_NAMES: Record<Side, string> = { c: "초", h: "한" };

export function other(side: Side): Side {
  return side === "c" ? "h" : "c";
}

export function sideOf(cell: Cell): Side | null {
  return cell === "" ? null : (cell[0] as Side);
}

export function kindOf(cell: Cell): Kind | null {
  return cell === "" ? null : (cell[1] as Kind);
}

export function xyOf(at: number): [number, number] {
  return [at % WIDTH, Math.floor(at / WIDTH)];
}

export function indexOf(x: number, y: number): number {
  return y * WIDTH + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

/**
 * 사람에게 보이는 자리 이름(장기 기보 관례): 세로 줄(위에서 1~9, 열째 줄은 0) + 가로 줄(왼쪽에서 1~9).
 * 초 편에서 본 판 기준이다. 예: 초 왼쪽 차의 첫 자리 "01", 초 궁 "95"
 */
export function pointName(at: number): string {
  const [x, y] = xyOf(at);
  return `${(y + 1) % 10}${x + 1}`;
}

/** 자리 이름("95")을 자리 번호로. `pointName`의 반대 */
export function pointAt(name: string): number {
  const match = /^(\d)([1-9])$/.exec(name);
  if (!match) throw new Error(`자리 이름이 아니다: ${name}`);
  const row = Number(match[1]);
  const y = row === 0 ? 9 : row - 1;
  return indexOf(Number(match[2]) - 1, y);
}

/** 이 칸이 어느 편 궁성 안인가 */
export function palaceOf(x: number, y: number): Side | null {
  if (x < 3 || x > 5) return null;
  if (y <= 2) return "h";
  if (y >= 7) return "c";
  return null;
}

/** 궁성 대각선 위의 점이면 그 궁성 가운데(4, 1|8)와의 관계로 갈 수 있는 대각선 방향 */
function palaceDiagonals(x: number, y: number): [number, number][] {
  const palace = palaceOf(x, y);
  if (!palace) return [];
  const cy = palace === "h" ? 1 : 8;
  if (x === 4 && y === cy)
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  const dx = 4 - x;
  const dy = cy - y;
  // 모서리 넷만 대각선 위에 있다. 변 가운데 점은 대각선이 없다.
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) return [[dx, dy]];
  return [];
}

/** 궁성 대각선을 따라 한 칸 간 점이 같은 궁성 안인가 */
function diagonalStep(
  x: number,
  y: number,
  dx: number,
  dy: number,
): [number, number] | null {
  const palace = palaceOf(x, y);
  if (!palace) return null;
  if (!palaceDiagonals(x, y).some(([a, b]) => a === dx && b === dy))
    return null;
  const nx = x + dx;
  const ny = y + dy;
  return palaceOf(nx, ny) === palace ? [nx, ny] : null;
}

const ORTHOGONAL: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** 그 편의 앞쪽(초는 위로, 한은 아래로) */
function forward(side: Side): number {
  return side === "c" ? -1 : 1;
}

/**
 * 한 기물이 갈 수 있는 곳(내 궁이 잡히는지는 보지 않는다).
 * 빈칸이나 상대 기물 칸만 돌려준다
 */
export function pseudoTargets(board: Board, from: number): number[] {
  const cell = board[from] ?? "";
  const side = sideOf(cell);
  const kind = kindOf(cell);
  if (!side || !kind) return [];
  const [x, y] = xyOf(from);
  const out: number[] = [];
  const free = (nx: number, ny: number) =>
    inBounds(nx, ny) && board[indexOf(nx, ny)] === "";
  const canLand = (nx: number, ny: number) => {
    if (!inBounds(nx, ny)) return false;
    const target = board[indexOf(nx, ny)] ?? "";
    return target === "" || sideOf(target) !== side;
  };
  const add = (nx: number, ny: number) => {
    if (canLand(nx, ny)) out.push(indexOf(nx, ny));
  };

  switch (kind) {
    case "K":
    case "A": {
      // 궁성 안에서 선을 따라 한 칸
      for (const [dx, dy] of ORTHOGONAL)
        if (palaceOf(x + dx, y + dy) === side) add(x + dx, y + dy);
      for (const [dx, dy] of DIAGONAL) {
        const step = diagonalStep(x, y, dx, dy);
        if (step && palaceOf(step[0], step[1]) === side) add(step[0], step[1]);
      }
      break;
    }
    case "P": {
      const f = forward(side);
      add(x, y + f);
      add(x - 1, y);
      add(x + 1, y);
      // 상대 궁성 안에서는 앞쪽 대각선 선을 따라서도
      for (const dx of [-1, 1]) {
        const step = diagonalStep(x, y, dx, f);
        if (step) add(step[0], step[1]);
      }
      break;
    }
    case "R": {
      for (const [dx, dy] of ORTHOGONAL) {
        let nx = x + dx;
        let ny = y + dy;
        while (inBounds(nx, ny)) {
          add(nx, ny);
          if (board[indexOf(nx, ny)] !== "") break;
          nx += dx;
          ny += dy;
        }
      }
      for (const [dx, dy] of DIAGONAL) {
        let at: [number, number] | null = diagonalStep(x, y, dx, dy);
        while (at) {
          add(at[0], at[1]);
          if (board[indexOf(at[0], at[1])] !== "") break;
          at = diagonalStep(at[0], at[1], dx, dy);
        }
      }
      break;
    }
    case "C": {
      // 기물 하나를 반드시 넘는다. 포는 넘을 수도 잡을 수도 없다.
      const isCannon = (nx: number, ny: number) =>
        kindOf(board[indexOf(nx, ny)] ?? "") === "C";
      for (const [dx, dy] of ORTHOGONAL) {
        let nx = x + dx;
        let ny = y + dy;
        while (inBounds(nx, ny) && board[indexOf(nx, ny)] === "") {
          nx += dx;
          ny += dy;
        }
        if (!inBounds(nx, ny) || isCannon(nx, ny)) continue;
        nx += dx;
        ny += dy;
        while (inBounds(nx, ny)) {
          if (board[indexOf(nx, ny)] === "") out.push(indexOf(nx, ny));
          else {
            if (!isCannon(nx, ny)) add(nx, ny);
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      // 궁성 대각선: 모서리에서 가운데 기물을 넘어 맞은편 모서리로
      for (const [dx, dy] of DIAGONAL) {
        const mid = diagonalStep(x, y, dx, dy);
        if (!mid) continue;
        const screen = board[indexOf(mid[0], mid[1])] ?? "";
        if (screen === "" || kindOf(screen) === "C") continue;
        const end = diagonalStep(mid[0], mid[1], dx, dy);
        if (end && !isCannon(end[0], end[1])) add(end[0], end[1]);
      }
      break;
    }
    case "N": {
      // 직선 한 칸(막히면 못 간다) + 바깥쪽 대각선 한 칸
      for (const [dx, dy] of ORTHOGONAL) {
        if (!free(x + dx, y + dy)) continue;
        for (const side2 of [-1, 1]) {
          const ex = dx === 0 ? side2 : dx;
          const ey = dy === 0 ? side2 : dy;
          add(x + dx + ex, y + dy + ey);
        }
      }
      break;
    }
    case "E": {
      // 직선 한 칸 + 대각선 두 칸. 지나는 두 칸이 비어야 한다
      for (const [dx, dy] of ORTHOGONAL) {
        if (!free(x + dx, y + dy)) continue;
        for (const side2 of [-1, 1]) {
          const ex = dx === 0 ? side2 : dx;
          const ey = dy === 0 ? side2 : dy;
          if (!free(x + dx + ex, y + dy + ey)) continue;
          add(x + dx + 2 * ex, y + dy + 2 * ey);
        }
      }
      break;
    }
  }
  return out;
}

export function kingOf(board: Board, side: Side): number {
  return board.indexOf(`${side}K`);
}

/** 이 칸을 그 편 기물이 잡을 수 있나 */
export function attacked(board: Board, at: number, by: Side): boolean {
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (cell === "" || cell[0] !== by) continue;
    if (pseudoTargets(board, from).includes(at)) return true;
  }
  return false;
}

/** 그 편 궁이 장군을 받고 있나 */
export function inCheck(board: Board, side: Side): boolean {
  const king = kingOf(board, side);
  return king >= 0 && attacked(board, king, other(side));
}

/** 두 궁이 같은 세로줄에서 사이에 기물 없이 마주 보나(빅장) */
export function kingsFacing(board: Board): boolean {
  const c = kingOf(board, "c");
  const h = kingOf(board, "h");
  if (c < 0 || h < 0) return false;
  const [cx, cy] = xyOf(c);
  const [hx, hy] = xyOf(h);
  if (cx !== hx) return false;
  for (let y = Math.min(cy, hy) + 1; y < Math.max(cy, hy); y++)
    if (board[indexOf(cx, y)] !== "") return false;
  return true;
}

export function applyMove(board: Board, move: Move): Cell[] {
  const next = [...board];
  next[move.to] = next[move.from] ?? "";
  next[move.from] = "";
  return next;
}

/** 그 편이 둘 수 있는 수(내 궁이 잡히는 수와, 빅장 금지면 빅장이 되는 수는 뺀다) */
export function legalMoves(
  board: Board,
  side: Side,
  bikjangForbidden = false,
): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (cell === "" || cell[0] !== side) continue;
    for (const to of pseudoTargets(board, from)) {
      const next = applyMove(board, { from, to });
      if (inCheck(next, side)) continue;
      if (bikjangForbidden && kingsFacing(next)) continue;
      out.push({ from, to });
    }
  }
  return out;
}

/** 남은 기물 점수 합(한은 덤을 더한다) */
export function materialScore(board: Board, side: Side): number {
  let sum = side === "h" ? HAN_BONUS : 0;
  for (const cell of board)
    if (cell !== "" && cell[0] === side) sum += PIECE_VALUE[cell[1] as Kind];
  return sum;
}

/** 상차림: 마·상 자리(내 편에서 본 왼쪽부터 둘째·셋째·일곱째·여덟째 줄) */
export type Setup = "NENE" | "ENEN" | "NEEN" | "ENNE";

export const SETUPS: readonly { value: Setup; label: string }[] = [
  { value: "NENE", label: "마상마상" },
  { value: "ENEN", label: "상마상마" },
  { value: "NEEN", label: "마상상마" },
  { value: "ENNE", label: "상마마상" },
];

/** 마·상을 뺀 첫 배치. 마·상 자리(1·2·6·7번 줄)는 상차림으로 채운다 */
export function baseBoard(): Cell[] {
  const board = new Array<Cell>(CELLS).fill("");
  for (const side of ["c", "h"] as const) {
    const back = side === "c" ? 9 : 0;
    const palaceRow = side === "c" ? 8 : 1;
    const cannonRow = side === "c" ? 7 : 2;
    const pawnRow = side === "c" ? 6 : 3;
    board[indexOf(0, back)] = `${side}R`;
    board[indexOf(8, back)] = `${side}R`;
    board[indexOf(3, back)] = `${side}A`;
    board[indexOf(5, back)] = `${side}A`;
    board[indexOf(4, palaceRow)] = `${side}K`;
    board[indexOf(1, cannonRow)] = `${side}C`;
    board[indexOf(7, cannonRow)] = `${side}C`;
    for (const x of [0, 2, 4, 6, 8]) board[indexOf(x, pawnRow)] = `${side}P`;
  }
  return board;
}

/** 상차림을 판에 놓는다. 한은 판 위에서 아래를 보므로 "내 왼쪽"이 판의 오른쪽이다 */
export function placeSetup(board: Cell[], side: Side, setup: Setup): void {
  const back = side === "c" ? 9 : 0;
  const ownX = [1, 2, 6, 7];
  [...setup].forEach((kind, i) => {
    const x = side === "c" ? (ownX[i] as number) : 8 - (ownX[i] as number);
    board[indexOf(x, back)] = `${side}${kind as Kind}`;
  });
}
