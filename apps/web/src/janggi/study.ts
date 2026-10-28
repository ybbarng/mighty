import { janggiExpertBot } from "@mighty/janggi-ai";
import {
  applyMove,
  type Board,
  createJanggiScenario,
  forcesMateAfter,
  isCheckmate,
  type JanggiState,
  KIND_NAMES,
  type Kind,
  type Move,
  PIECE_VALUE,
  pointAt,
  pointName,
  pseudoTargets,
  sideOfSeat,
  viewOf,
} from "@mighty/janggi-engine";

import type { JanggiPuzzle } from "./puzzles";

/** 문제 장면에서 시작하는 판. 늘 초(나, 0번 자리)가 둘 차례다 */
export function puzzleState(puzzle: JanggiPuzzle): JanggiState {
  return createJanggiScenario({ pieces: puzzle.pieces, me: "c" });
}

/** "19-39" → 수 */
export function parseMove(text: string): Move {
  const [from, to] = text.split("-");
  return { from: pointAt(from ?? ""), to: pointAt(to ?? "") };
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.to === b.to;

/**
 * 내 수를 판정한다. 양수겸장은 정답 수만 맞다.
 * 외통 문제의 마지막 수는 외통이면 어느 수든 정답, 그 앞 수는 문제의 정답 수만
 */
export function judgeMove(
  puzzle: JanggiPuzzle,
  state: JanggiState,
  move: Move,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind !== "mate")
    return sameMove(move, parseMove(puzzle.solution)) ? "solved" : "wrong";
  const after = applyMove(state.board, move);
  if (isCheckmate(after, "h")) return "solved";
  const last = step >= puzzle.mateIn - 1;
  if (last) return "wrong";
  if (step === 0)
    return sameMove(move, parseMove(puzzle.solution)) ? "next" : "wrong";
  // 세 수 문제의 가운데 수: 남은 수 안에 외통이 되면 어느 수든 맞다.
  return forcesMateAfter(after, "c", puzzle.mateIn - step - 1)
    ? "next"
    : "wrong";
}

/** 상대(한)의 받는 수: 고수가 가장 오래 버티는 수를 고른다. 같은 문제는 늘 같은 수 */
export function defenseFor(state: JanggiState) {
  return janggiExpertBot.decide(viewOf(state, 1), { seed: 7 });
}

function attackers(board: Board, at: number, side: "c" | "h" = "c"): Kind[] {
  const kinds: Kind[] = [];
  board.forEach((cell, from) => {
    if (cell.startsWith(side) && pseudoTargets(board, from).includes(at))
      kinds.push(cell[1] as Kind);
  });
  return kinds;
}

/** 끝 글자에 받침이 있나(을/를, 과/와를 고른다) */
function hasBatchim(word: string): boolean {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
const obj = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;

const names = (kinds: Kind[]) =>
  [...new Set(kinds)].map((k) => KIND_NAMES[k]).join("·");

/**
 * 외통이 된 판을 말로 풀어 준다: 누가 장군을 불렀고, 궁이 갈 수 있는 곳을 누가 지키나.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainMate(board: Board, move: Move): string[] {
  const after = applyMove(board, move);
  const king = after.indexOf("hK");
  const mover = after[move.to] as string;
  const lines = [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${pointName(move.to)}로: 장군!`,
  ];
  const checkers = attackers(after, king);
  if (checkers.length > 1)
    lines.push(`${names(checkers)}가 함께 궁을 노린다(양수겸장)`);
  const escapes = pseudoTargets(after, king);
  const guarded = new Map<string, string[]>();
  for (const to of escapes) {
    const moved = applyMove(after, { from: king, to });
    const who = names(attackers(moved, to));
    if (!who) continue;
    guarded.set(who, [...(guarded.get(who) ?? []), pointName(to)]);
  }
  for (const [who, squares] of guarded)
    lines.push(`궁이 피할 ${squares.join("·")}는 ${who}가 지킨다`);
  if (escapes.length === 0) lines.push("궁 둘레가 막혀 궁이 움직일 곳이 없다");
  lines.push("막거나 잡을 수도 없어 외통이다");
  return lines;
}

/** 이 판에서 둘 차례인 편이 초인가(문제 화면에서 내 차례 표시) */
export const choToMove = (state: JanggiState) =>
  state.phase === "play" &&
  sideOfSeat(state, 0) === "c" &&
  state.played.length % 2 === 0;

/** 양수겸장을 말로 풀어 준다: 옮긴 기물이 노리는 상대 기물들 */
export function explainFork(board: Board, move: Move): string[] {
  const after = applyMove(board, move);
  const mover = after[move.to] as string;
  const targets = pseudoTargets(after, move.to)
    .filter((t) => after[t]?.startsWith("h"))
    .map((t) => ({ at: t, kind: (after[t] as string)[1] as Kind }))
    .sort((a, b) => (b.kind === "K" ? 1 : 0) - (a.kind === "K" ? 1 : 0));
  const words = targets.map((t) => KIND_NAMES[t.kind]);
  // "차(26)와 궁(15)을"처럼 앞 낱말 받침에 맞춰 와/과, 끝 낱말에 맞춰 을/를을 붙인다.
  const list = targets
    .map((t, i) => {
      const word = `${KIND_NAMES[t.kind]}(${pointName(t.at)})`;
      if (i === targets.length - 1)
        return `${word}${hasBatchim(words[i] ?? "") ? "을" : "를"}`;
      return `${word}${hasBatchim(words[i] ?? "") ? "과" : "와"}`;
    })
    .join(" ");
  const check = targets.some((t) => t.kind === "K");
  return [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${pointName(move.to)}로: ${list} 함께 노린다`,
    check
      ? "장군이라 한은 궁부터 피해야 하고, 그사이 다른 기물을 잡는다"
      : "한이 하나를 지키거나 피하면 다른 하나를 잡는다",
  ];
}

/**
 * 잡을까 말까를 말로 풀어 준다: 정답 잡기가 왜 이득인지, 함정 잡기는 누가 다시 잡는지.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainTrade(board: Board, move: Move, trap: Move): string[] {
  const takenKind = (board[move.to] as string)[1] as Kind;
  const after = applyMove(board, move);
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const taken = KIND_NAMES[takenKind];
  const recapture = names(attackers(after, move.to, "h"));
  const lines = [
    recapture
      ? `${mover}로 ${obj(taken)} 잡는다(${PIECE_VALUE[takenKind]}점). ${recapture}가 다시 잡아도 이득이다`
      : `${mover}로 ${obj(taken)} 잡는다(${PIECE_VALUE[takenKind]}점). 지키는 기물이 없어 공짜다`,
  ];
  const trapKind = (board[trap.to] as string)[1] as Kind;
  const trapAfter = applyMove(board, trap);
  const trapper = KIND_NAMES[(trapAfter[trap.to] as string)[1] as Kind];
  const guard = names(attackers(trapAfter, trap.to, "h"));
  lines.push(
    guard
      ? `${pointName(trap.to)}의 ${obj(KIND_NAMES[trapKind])} ${trapper}로 잡으면 ${guard}가 다시 잡아 ${trapper}를 잃는다`
      : `${pointName(trap.to)}의 ${obj(KIND_NAMES[trapKind])} 잡으면 그사이 더 큰 기물을 잃는다`,
  );
  return lines;
}
