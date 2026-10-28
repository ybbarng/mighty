import {
  applyMove,
  attacked,
  type Board,
  inBounds,
  indexOf,
  KIND_NAMES,
  type Kind,
  type Move,
  moveToSan,
  PIECE_POINTS,
  type Position,
  squareName,
  xyOf,
} from "@mighty/chess-engine";

/*
 * 체스 전술 문제(포크·핀·스큐어·발견 공격)의 모양을 판에서 알아보고 말로 풀어 준다(docs/23).
 * 문제 데이터가 말하는 전술이 정말 그 모양인지 단위 시험이 이것으로 확인하고, 해설도 장면에서 만든다.
 * 백이 둔 수만 본다(문제는 늘 백 차례).
 */

export type Tactic = "fork" | "pin" | "skewer" | "discovered";

export const TACTIC_NAMES: Record<Tactic, string> = {
  fork: "포크",
  pin: "핀",
  skewer: "스큐어",
  discovered: "발견 공격",
};

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
const AROUND: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ORTHOGONAL = AROUND.slice(0, 4);
const DIAGONAL = AROUND.slice(4);

/** 그 기물이 미끄러져 가는 방향(룩·비숍·퀸). 아니면 빈 목록 */
function rays(kind: Kind): readonly (readonly [number, number])[] {
  if (kind === "R") return ORTHOGONAL;
  if (kind === "B") return DIAGONAL;
  if (kind === "Q") return AROUND;
  return [];
}

/** 이 칸 기물이 노리는 칸들(잡을 수 있는 칸. 제 편 기물 칸은 빼지 않는다) */
export function attacksFrom(board: Board, from: number): number[] {
  const cell = board[from] ?? "";
  if (cell === "") return [];
  const kind = cell[1] as Kind;
  const [x, y] = xyOf(from);
  const out: number[] = [];
  const add = (nx: number, ny: number) => {
    if (inBounds(nx, ny)) out.push(indexOf(nx, ny));
  };
  if (kind === "P") {
    const f = cell[0] === "w" ? -1 : 1;
    add(x - 1, y + f);
    add(x + 1, y + f);
  } else if (kind === "N") for (const [dx, dy] of KNIGHT) add(x + dx, y + dy);
  else if (kind === "K") for (const [dx, dy] of AROUND) add(x + dx, y + dy);
  else
    for (const [dx, dy] of rays(kind)) {
      let nx = x + dx;
      let ny = y + dy;
      while (inBounds(nx, ny)) {
        out.push(indexOf(nx, ny));
        if (board[indexOf(nx, ny)] !== "") break;
        nx += dx;
        ny += dy;
      }
    }
  return out;
}

/** `from`의 미끄러지는 기물이 `target`을 노릴 때, 그 줄에서 `target` 뒤에 처음 있는 기물 칸 */
function behind(board: Board, from: number, target: number): number | null {
  const [fx, fy] = xyOf(from);
  const [tx, ty] = xyOf(target);
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  let nx = tx + dx;
  let ny = ty + dy;
  while (inBounds(nx, ny)) {
    const at = indexOf(nx, ny);
    if (board[at] !== "") return at;
    nx += dx;
    ny += dy;
  }
  return null;
}

/** 기물 값(킹은 어떤 기물보다 크다) */
const worth = (cell: string) =>
  cell[1] === "K" ? 100 : PIECE_POINTS[cell[1] as Kind];

const isBlack = (cell: string | undefined) => cell?.[0] === "b";

/** 한 전술의 모습: 노리는 기물(들)과, 핀·스큐어면 뒤에 있는 기물, 발견 공격이면 길이 열린 기물 */
export interface TacticShape {
  tactic: Tactic;
  /** 전술을 거는 백 기물 칸 */
  by: number;
  targets: number[];
  /** 핀·스큐어: 줄 뒤쪽 기물 */
  back?: number;
}

/** 백이 이 수를 두면 생기는 전술들 */
export function tacticsOf(pos: Position, move: Move): TacticShape[] {
  const after = applyMove(pos, move).board;
  const to = move.to;
  const mover = after[to] ?? "";
  const shapes: TacticShape[] = [];

  // 포크: 옮긴 기물 하나가 킹, 더 비싼 기물, 지키는 이 없는 기물 가운데 둘 이상을 함께 노린다.
  const forked = attacksFrom(after, to).filter((t) => {
    const cell = after[t] ?? "";
    if (!isBlack(cell) || cell[1] === "P") return false;
    return (
      cell[1] === "K" || worth(cell) > worth(mover) || !attacked(after, t, "b")
    );
  });
  if (forked.length >= 2)
    shapes.push({ tactic: "fork", by: to, targets: forked });

  // 핀·스큐어: 옮긴 미끄러지는 기물이 노리는 흑 기물 뒤에 다른 흑 기물이 있다.
  if (rays(mover[1] as Kind).length > 0)
    for (const t of attacksFrom(after, to)) {
      const front = after[t] ?? "";
      if (!isBlack(front)) continue;
      const back = behind(after, to, t);
      if (back === null) continue;
      const rear = after[back] ?? "";
      if (!isBlack(rear) || rear[1] === "P") continue;
      if (front[1] !== "K" && worth(rear) > worth(front))
        shapes.push({ tactic: "pin", by: to, targets: [t], back });
      if ((front[1] === "K" || front[1] === "Q") && worth(front) > worth(rear))
        shapes.push({ tactic: "skewer", by: to, targets: [t], back });
    }

  // 발견 공격: 옮긴 기물이 비켜서 다른 백 기물이 킹·퀸·룩을 새로 노리고, 옮긴 기물도 무언가를 노린다.
  const moverHits = attacksFrom(after, to).filter((t) => {
    const cell = after[t] ?? "";
    return isBlack(cell) && cell[1] !== "P";
  });
  if (moverHits.length > 0)
    after.forEach((cell, at) => {
      if (at === to || cell[0] !== "w" || rays(cell[1] as Kind).length === 0)
        return;
      const before = attacksFrom(pos.board, at);
      const opened = attacksFrom(after, at).filter((t) => {
        const target = after[t] ?? "";
        return (
          isBlack(target) &&
          "KQR".includes(target[1] ?? "") &&
          !before.includes(t)
        );
      });
      if (opened.length > 0)
        shapes.push({ tactic: "discovered", by: at, targets: opened });
    });
  return shapes;
}

/** "룩(h8)"처럼 기물 이름과 칸 */
function named(board: Board, at: number): string {
  return `${KIND_NAMES[(board[at] as string)[1] as Kind]}(${squareName(at)})`;
}

/** 끝 글자에 받침이 있나(을/를, 이/가를 고른다) */
function hasBatchim(word: string): boolean {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
const objOf = (board: Board, at: number) => {
  const word = KIND_NAMES[(board[at] as string)[1] as Kind];
  return `${named(board, at)}${hasBatchim(word) ? "을" : "를"}`;
};
const subjOf = (board: Board, at: number) => {
  const word = KIND_NAMES[(board[at] as string)[1] as Kind];
  return `${named(board, at)}${hasBatchim(word) ? "이" : "가"}`;
};

/** 전술을 말로 풀어 준다: 무엇이 무엇을 노리고, 흑이 왜 다 지킬 수 없나 */
export function explainTactic(
  pos: Position,
  move: Move,
  tactic: Tactic,
): string[] {
  const after = applyMove(pos, move).board;
  const shape = tacticsOf(pos, move).find((s) => s.tactic === tactic);
  const san = moveToSan(pos, move);
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const head = `${mover}${hasBatchim(mover) ? "을" : "를"} ${squareName(move.to)}로(${san})`;
  if (!shape) return [head];
  const targets = shape.targets.map((t) => named(after, t)).join("·");
  switch (tactic) {
    case "fork":
      return [
        `${head}: ${targets}${hasBatchim(KIND_NAMES[(after[shape.targets.at(-1) as number] as string)[1] as Kind]) ? "을" : "를"} 함께 노린다(포크)`,
        "흑은 한 번에 하나만 지킬 수 있어 다른 하나를 잃는다",
      ];
    case "pin":
      return [
        `${head}: ${objOf(after, shape.targets[0] as number)} 노린다. 뒤에 ${subjOf(after, shape.back as number)} 있어 비킬 수 없다(핀)`,
        after[shape.back as number] === "bK"
          ? "뒤에 킹이 있으면 앞 기물은 아예 움직일 수 없어, 묶인 채로 잡힌다"
          : "앞 기물이 비키면 뒤의 더 비싼 기물을 잡는다",
      ];
    case "skewer":
      return [
        `${head}: ${objOf(after, shape.targets[0] as number)} 노린다. 비키면 뒤의 ${objOf(after, shape.back as number)} 잡는다(스큐어)`,
        "핀과 반대로 앞에 더 비싼 기물이 있어, 피할 수밖에 없다",
      ];
    case "discovered":
      return [
        `${head}: 길이 열려 ${subjOf(after, shape.by)} ${targets}${hasBatchim(KIND_NAMES[(after[shape.targets.at(-1) as number] as string)[1] as Kind]) ? "을" : "를"} 노린다(발견 공격)`,
        "옮긴 기물도 다른 곳을 노려, 흑은 두 노림을 한 번에 막지 못한다",
      ];
  }
}
