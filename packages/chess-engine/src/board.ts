import { SIZE, SQUARES } from "./rules";

/** 편: 백(먼저 둔다, 판 아래)과 흑(판 위) */
export type Side = "w" | "b";
/** 기물: 킹(K)·퀸(Q)·룩(R)·비숍(B)·나이트(N)·폰(P) */
export type Kind = "K" | "Q" | "R" | "B" | "N" | "P";
export type Piece = `${Side}${Kind}`;
/** 빈칸은 "" */
export type Cell = Piece | "";
export type Board = readonly Cell[];
/** 폰이 끝줄에 닿아 바뀔 수 있는 기물 */
export type Promotion = "Q" | "R" | "B" | "N";

export const PROMOTIONS: readonly Promotion[] = ["Q", "R", "B", "N"];

export interface Move {
  from: number;
  to: number;
  /** 승급할 기물. 승급하는 수에만 있다 */
  promotion?: Promotion;
}

/**
 * 한 판의 모양(FEN이 담는 것과 같다).
 * 칸 번호는 y*8+x이고, x는 a~h 줄(0~7), y는 위(8번째 가로줄, 흑 쪽)에서 0이다. 그래서 a8=0, h1=63
 */
export interface Position {
  board: Cell[];
  /** 둘 차례 */
  turn: Side;
  /** 남은 캐슬링 권리. FEN처럼 "KQkq"의 일부(K 백 킹 쪽, Q 백 퀸 쪽, 소문자는 흑) */
  castling: string;
  /** 바로 앞 수에 폰이 두 칸 나가며 지나간 칸(앙파상으로 잡을 자리). 없으면 null */
  ep: number | null;
  /** 폰을 움직이거나 잡지 않고 이어진 수(두 편 합) */
  halfmove: number;
  /** 몇 번째 수인가(흑이 두면 하나 는다) */
  fullmove: number;
}

export const KIND_NAMES: Record<Kind, string> = {
  K: "킹",
  Q: "퀸",
  R: "룩",
  B: "비숍",
  N: "나이트",
  P: "폰",
};

export const SIDE_NAMES: Record<Side, string> = { w: "백", b: "흑" };

/** 기물 점수(폰 1). 사람에게 보이는 셈이고, 컴퓨터는 따로 센다 */
export const PIECE_POINTS: Record<Kind, number> = {
  K: 0,
  Q: 9,
  R: 5,
  B: 3,
  N: 3,
  P: 1,
};

export function other(side: Side): Side {
  return side === "w" ? "b" : "w";
}

export function sideOf(cell: Cell): Side | null {
  return cell === "" ? null : (cell[0] as Side);
}

export function kindOf(cell: Cell): Kind | null {
  return cell === "" ? null : (cell[1] as Kind);
}

export function xyOf(at: number): [number, number] {
  return [at % SIZE, Math.floor(at / SIZE)];
}

export function indexOf(x: number, y: number): number {
  return y * SIZE + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

const FILES = "abcdefgh";

/** 칸 이름(체스 기보 관례): 세로줄 a~h + 가로줄 1~8. 예: 백 킹의 처음 자리 "e1" */
export function squareName(at: number): string {
  const [x, y] = xyOf(at);
  return `${FILES[x]}${SIZE - y}`;
}

/** 칸 이름("e4")을 칸 번호로. `squareName`의 반대 */
export function squareAt(name: string): number {
  const match = /^([a-h])([1-8])$/.exec(name);
  if (!match) throw new Error(`칸 이름이 아니다: ${name}`);
  return indexOf(FILES.indexOf(match[1] as string), SIZE - Number(match[2]));
}

/** 밝은 칸인가(a1은 어두운 칸) */
export function isLightSquare(at: number): boolean {
  const [x, y] = xyOf(at);
  return (x + y) % 2 === 0;
}

/* ---------- FEN ---------- */

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** FEN 글자를 읽어 판 모양으로. 형식이 틀리면 오류를 던진다 */
export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn = "w", castling = "-", ep = "-", half, full] = parts;
  const rows = (placement ?? "").split("/");
  if (rows.length !== SIZE)
    throw new Error(`FEN 가로줄이 8개가 아니다: ${fen}`);
  const board: Cell[] = [];
  for (const row of rows) {
    let count = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) board.push("");
        count += Number(ch);
      } else {
        const kind = ch.toUpperCase();
        if (!"KQRBNP".includes(kind))
          throw new Error(`FEN 글자가 아니다: ${ch}`);
        board.push(`${ch === kind ? "w" : "b"}${kind as Kind}`);
        count += 1;
      }
    }
    if (count !== SIZE) throw new Error(`FEN 가로줄 칸 수가 틀렸다: ${row}`);
  }
  if (turn !== "w" && turn !== "b")
    throw new Error(`둘 차례가 아니다: ${turn}`);
  if (!/^(-|K?Q?k?q?)$/.test(castling))
    throw new Error(`캐슬링 글자가 아니다: ${castling}`);
  return {
    board,
    turn,
    castling: castling === "-" ? "" : castling,
    ep: ep === "-" ? null : squareAt(ep),
    halfmove: Number(half ?? 0) || 0,
    fullmove: Number(full ?? 1) || 1,
  };
}

/** 판 모양을 FEN 글자로 */
export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < SIZE; x++) {
      const cell = pos.board[indexOf(x, y)] ?? "";
      if (cell === "") {
        empty += 1;
        continue;
      }
      if (empty > 0) row += String(empty);
      empty = 0;
      const kind = cell[1] as string;
      row += cell[0] === "w" ? kind : kind.toLowerCase();
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return [
    rows.join("/"),
    pos.turn,
    pos.castling || "-",
    pos.ep === null ? "-" : squareName(pos.ep),
    pos.halfmove,
    pos.fullmove,
  ].join(" ");
}

export function startPosition(): Position {
  return parseFen(START_FEN);
}

/* ---------- 움직임 ---------- */

const KNIGHT: readonly [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
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

/** 그 편 폰의 앞쪽(백은 위로, 흑은 아래로) */
export function forward(side: Side): number {
  return side === "w" ? -1 : 1;
}

/** 이 칸을 그 편 기물이 잡을 수 있나(그 편 차례인지는 보지 않는다) */
export function attacked(board: Board, at: number, by: Side): boolean {
  const [x, y] = xyOf(at);
  // 폰: 백 폰은 위쪽 대각선을 잡으므로, 이 칸 아래 대각선에 백 폰이 있으면 노린다.
  const py = y - forward(by);
  for (const dx of [-1, 1]) {
    const px = x + dx;
    if (inBounds(px, py) && board[indexOf(px, py)] === `${by}P`) return true;
  }
  for (const [dx, dy] of KNIGHT) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny) && board[indexOf(nx, ny)] === `${by}N`) return true;
  }
  for (const [dx, dy] of KING) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny) && board[indexOf(nx, ny)] === `${by}K`) return true;
  }
  const ray = (dirs: readonly [number, number][], a: Kind, b: Kind) => {
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (inBounds(nx, ny)) {
        const cell = board[indexOf(nx, ny)] ?? "";
        if (cell !== "") {
          if (cell[0] === by && (cell[1] === a || cell[1] === b)) return true;
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
    return false;
  };
  return ray(ORTHOGONAL, "R", "Q") || ray(DIAGONAL, "B", "Q");
}

export function kingOf(board: Board, side: Side): number {
  return board.indexOf(`${side}K`);
}

/** 그 편 킹이 체크를 받고 있나 */
export function inCheck(board: Board, side: Side): boolean {
  const king = kingOf(board, side);
  return king >= 0 && attacked(board, king, other(side));
}

/** 캐슬링에 쓰는 칸들(편·방향마다): 킹 출발·도착, 룩 출발·도착, 비어 있어야 할 칸, 공격받으면 안 되는 칸 */
interface CastleSquares {
  right: string;
  king: number;
  kingTo: number;
  rook: number;
  rookTo: number;
  empty: number[];
  safe: number[];
}

function castleSquares(side: Side, wing: "K" | "Q"): CastleSquares {
  const y = side === "w" ? 7 : 0;
  const at = (x: number) => indexOf(x, y);
  const right = side === "w" ? wing : wing.toLowerCase();
  return wing === "K"
    ? {
        right,
        king: at(4),
        kingTo: at(6),
        rook: at(7),
        rookTo: at(5),
        empty: [at(5), at(6)],
        safe: [at(4), at(5), at(6)],
      }
    : {
        right,
        king: at(4),
        kingTo: at(2),
        rook: at(0),
        rookTo: at(3),
        empty: [at(1), at(2), at(3)],
        safe: [at(4), at(3), at(2)],
      };
}

const CASTLES: Record<Side, CastleSquares[]> = {
  w: [castleSquares("w", "K"), castleSquares("w", "Q")],
  b: [castleSquares("b", "K"), castleSquares("b", "Q")],
};

/** 이 수가 캐슬링이면 킹 쪽("K")인지 퀸 쪽("Q")인지 */
export function castleWing(board: Board, move: Move): "K" | "Q" | null {
  if (kindOf(board[move.from] ?? "") !== "K") return null;
  const dx = (move.to % SIZE) - (move.from % SIZE);
  if (dx === 2) return "K";
  if (dx === -2) return "Q";
  return null;
}

/** 이 수가 앙파상인가 */
export function isEnPassant(pos: Position, move: Move): boolean {
  return (
    kindOf(pos.board[move.from] ?? "") === "P" &&
    move.to === pos.ep &&
    move.from % SIZE !== move.to % SIZE &&
    pos.board[move.to] === ""
  );
}

/** 이 수가 잡는 기물(앙파상 포함). 없으면 "" */
export function capturedBy(pos: Position, move: Move): Cell {
  if (isEnPassant(pos, move)) {
    const [x] = xyOf(move.to);
    const [, y] = xyOf(move.from);
    return pos.board[indexOf(x, y)] ?? "";
  }
  return pos.board[move.to] ?? "";
}

/**
 * 둘 차례인 편의 모든 수(내 킹이 체크로 남는지는 보지 않는다).
 * 캐슬링은 여기서 규칙을 다 본다: 지나가는 칸이 비고, 킹이 체크가 아니고 지나가는 칸도 공격받지 않는다
 */
export function pseudoMoves(pos: Position, capturesOnly = false): Move[] {
  const { board } = pos;
  const side = pos.turn;
  const enemy = other(side);
  const out: Move[] = [];
  const push = (from: number, to: number, pawn: boolean) => {
    const y = Math.floor(to / SIZE);
    if (pawn && (y === 0 || y === SIZE - 1))
      for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
    else out.push({ from, to });
  };
  for (let from = 0; from < SQUARES; from++) {
    const cell = board[from] ?? "";
    if (cell === "" || cell[0] !== side) continue;
    const [x, y] = xyOf(from);
    const kind = cell[1] as Kind;
    const land = (nx: number, ny: number): boolean => {
      // 갈 수 있으면 넣고, 이어서 더 갈 수 있으면(빈칸) true
      if (!inBounds(nx, ny)) return false;
      const to = indexOf(nx, ny);
      const target = board[to] ?? "";
      if (target === "") {
        if (!capturesOnly) out.push({ from, to });
        return true;
      }
      if (target[0] === enemy) out.push({ from, to });
      return false;
    };
    switch (kind) {
      case "P": {
        const f = forward(side);
        const ny = y + f;
        if (!inBounds(x, ny)) break;
        const one = indexOf(x, ny);
        const last = ny === 0 || ny === SIZE - 1;
        if (board[one] === "" && (!capturesOnly || last)) {
          push(from, one, true);
          const startRow = side === "w" ? 6 : 1;
          const two = indexOf(x, y + 2 * f);
          if (!capturesOnly && y === startRow && board[two] === "")
            out.push({ from, to: two });
        }
        for (const dx of [-1, 1]) {
          const nx = x + dx;
          if (!inBounds(nx, ny)) continue;
          const to = indexOf(nx, ny);
          const target = board[to] ?? "";
          if ((target !== "" && target[0] === enemy) || to === pos.ep)
            push(from, to, true);
        }
        break;
      }
      case "N":
        for (const [dx, dy] of KNIGHT) land(x + dx, y + dy);
        break;
      case "K": {
        for (const [dx, dy] of KING) land(x + dx, y + dy);
        if (capturesOnly) break;
        for (const c of CASTLES[side]) {
          if (!pos.castling.includes(c.right) || from !== c.king) continue;
          if (board[c.rook] !== `${side}R`) continue;
          if (c.empty.some((s) => board[s] !== "")) continue;
          if (c.safe.some((s) => attacked(board, s, enemy))) continue;
          out.push({ from, to: c.kingTo });
        }
        break;
      }
      default: {
        const dirs =
          kind === "R"
            ? ORTHOGONAL
            : kind === "B"
              ? DIAGONAL
              : [...ORTHOGONAL, ...DIAGONAL];
        for (const [dx, dy] of dirs) {
          let nx = x + dx;
          let ny = y + dy;
          while (land(nx, ny)) {
            nx += dx;
            ny += dy;
          }
        }
      }
    }
  }
  return out;
}

/** 캐슬링 권리를 잃게 하는 칸(킹·룩의 처음 자리)과 그때 지우는 글자 */
const RIGHTS_LOST: ReadonlyMap<number, string> = new Map([
  [indexOf(4, 7), "KQ"],
  [indexOf(7, 7), "K"],
  [indexOf(0, 7), "Q"],
  [indexOf(4, 0), "kq"],
  [indexOf(7, 0), "k"],
  [indexOf(0, 0), "q"],
]);

/** 수를 둔 뒤의 판 모양(규칙에 맞는지는 보지 않는다) */
export function applyMove(pos: Position, move: Move): Position {
  const board = [...pos.board];
  const piece = board[move.from] ?? "";
  const side = pos.turn;
  const kind = kindOf(piece);
  const captured = capturedBy(pos, move);
  if (isEnPassant(pos, move)) {
    const [x] = xyOf(move.to);
    const [, y] = xyOf(move.from);
    board[indexOf(x, y)] = "";
  }
  const wing = castleWing(pos.board, move);
  if (wing) {
    const c = CASTLES[side][wing === "K" ? 0 : 1] as CastleSquares;
    board[c.rookTo] = board[c.rook] ?? "";
    board[c.rook] = "";
  }
  board[move.to] = move.promotion ? `${side}${move.promotion}` : piece;
  board[move.from] = "";

  let castling = pos.castling;
  for (const at of [move.from, move.to]) {
    const lost = RIGHTS_LOST.get(at);
    if (lost)
      castling = [...castling].filter((c) => !lost.includes(c)).join("");
  }
  const double =
    kind === "P" && Math.abs(move.to - move.from) === SIZE * 2
      ? (move.from + move.to) / 2
      : null;
  return {
    board,
    turn: other(side),
    castling,
    ep: double,
    halfmove: kind === "P" || captured !== "" ? 0 : pos.halfmove + 1,
    fullmove: pos.fullmove + (side === "b" ? 1 : 0),
  };
}

/** 둘 차례인 편이 둘 수 있는 수(내 킹을 체크로 남기는 수는 뺀다) */
export function legalMoves(pos: Position): Move[] {
  return pseudoMoves(pos).filter(
    (m) => !inCheck(applyMove(pos, m).board, pos.turn),
  );
}

export const sameMove = (a: Move, b: Move): boolean =>
  a.from === b.from && a.to === b.to && a.promotion === b.promotion;

/**
 * 어느 편도 체크메이트를 만들 수 없는 기물만 남았나(킹만, 킹 + 나이트나 비숍 하나,
 * 같은 색 칸 비숍들만). 그러면 그 자리에서 비긴다
 */
export function insufficientMaterial(board: Board): boolean {
  const extra: { kind: Kind; at: number }[] = [];
  board.forEach((cell, at) => {
    if (cell !== "" && cell[1] !== "K")
      extra.push({ kind: cell[1] as Kind, at });
  });
  if (extra.length === 0) return true;
  if (extra.some((p) => p.kind === "P" || p.kind === "R" || p.kind === "Q"))
    return false;
  if (extra.length === 1) return true;
  if (extra.every((p) => p.kind === "B")) {
    const light = isLightSquare(extra[0]?.at ?? 0);
    return extra.every((p) => isLightSquare(p.at) === light);
  }
  return false;
}

/**
 * 시간을 다 쓴 상대를 이길 기물이 이 편에 있나(FIDE 6.9: 상대 시간이 다 돼도 체크메이트할 수 없으면 비긴다).
 * 킹만 남았거나, 킹 + 나이트·비숍 하나인데 상대도 킹만이면 못 이긴다.
 * 그 밖의 드문 경우(상대 기물이 막아 줘야만 메이트가 되는 판)는 이길 수 있는 것으로 본다
 */
export function canMate(board: Board, side: Side): boolean {
  const mine = board.filter((c) => c !== "" && c[0] === side && c[1] !== "K");
  if (mine.length === 0) return false;
  const theirs = board.filter((c) => c !== "" && c[0] !== side && c[1] !== "K");
  if (mine.length === 1 && (mine[0] === `${side}N` || mine[0] === `${side}B`))
    return theirs.length > 0;
  return true;
}

/* ---------- 기보(SAN) ---------- */

/**
 * 체스 기보 표기(SAN): "Nf3", "exd5", "O-O", "e8=Q+", "Qh7#".
 * 같은 기물이 같은 칸으로 갈 수 있으면 출발 세로줄(또는 가로줄)을 붙여 가린다
 */
export function moveToSan(pos: Position, move: Move): string {
  const piece = pos.board[move.from] ?? "";
  const kind = kindOf(piece);
  let san: string;
  const wing = castleWing(pos.board, move);
  if (wing) san = wing === "K" ? "O-O" : "O-O-O";
  else {
    const capture = capturedBy(pos, move) !== "";
    const to = squareName(move.to);
    if (kind === "P") {
      san = capture ? `${squareName(move.from)[0]}x${to}` : to;
      if (move.promotion) san += `=${move.promotion}`;
    } else {
      const rivals = legalMoves(pos).filter(
        (m) =>
          m.to === move.to &&
          m.from !== move.from &&
          pos.board[m.from] === piece,
      );
      let hint = "";
      if (rivals.length > 0) {
        const [fx, fy] = xyOf(move.from);
        const name = squareName(move.from);
        if (rivals.every((m) => xyOf(m.from)[0] !== fx))
          hint = name[0] as string;
        else if (rivals.every((m) => xyOf(m.from)[1] !== fy))
          hint = name[1] as string;
        else hint = name;
      }
      san = `${kind}${hint}${capture ? "x" : ""}${to}`;
    }
  }
  const after = applyMove(pos, move);
  if (inCheck(after.board, after.turn))
    san += legalMoves(after).length === 0 ? "#" : "+";
  return san;
}

/** 기보 한 수("Nf3", "e8=Q", "O-O")를 이 판의 수로. 둘 수 없으면 null */
export function sanToMove(pos: Position, san: string): Move | null {
  const clean = (s: string) => s.replace(/[+#!?]/g, "").replace(/0/g, "O");
  const want = clean(san);
  return legalMoves(pos).find((m) => clean(moveToSan(pos, m)) === want) ?? null;
}

/** 여러 수를 차례로 두며 기보로 읽는다(시험·튜토리얼 데이터용). 틀린 수가 있으면 오류를 던진다 */
export function playSan(pos: Position, line: readonly string[]): Position {
  let current = pos;
  for (const san of line) {
    const move = sanToMove(current, san);
    if (!move) throw new Error(`둘 수 없는 수: ${san} (${toFen(current)})`);
    current = applyMove(current, move);
  }
  return current;
}

/**
 * 같은 판 되풀이를 셀 때의 열쇠: 기물 자리 + 둘 차례 + 캐슬링 권리 + (실제로 잡을 수 있을 때만) 앙파상 칸
 */
export function positionKey(pos: Position): string {
  let ep = "-";
  if (pos.ep !== null) {
    const [x, y] = xyOf(pos.ep);
    const pawnY = y - forward(pos.turn);
    for (const dx of [-1, 1])
      if (
        inBounds(x + dx, pawnY) &&
        pos.board[indexOf(x + dx, pawnY)] === `${pos.turn}P`
      )
        ep = squareName(pos.ep);
  }
  return `${pos.board.map((c) => c || ".").join("")}|${pos.turn}|${pos.castling}|${ep}`;
}

/** 이 편에 남은 기물 점수 합(폰 1·나이트 3·비숍 3·룩 5·퀸 9) */
export function materialPoints(board: Board, side: Side): number {
  let sum = 0;
  for (const cell of board)
    if (cell !== "" && cell[0] === side) sum += PIECE_POINTS[cell[1] as Kind];
  return sum;
}
