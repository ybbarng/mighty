import { janggiExpertBot } from "@mighty/janggi-ai";
import {
  applyMove,
  type Board,
  createJanggiScenario,
  isCheckmate,
  type JanggiState,
  KIND_NAMES,
  type Kind,
  type Move,
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

/** 내 수를 판정한다. 마지막 수는 외통이면 어느 수든 정답, 그 앞 수는 문제의 정답 수만 */
export function judgeMove(
  puzzle: JanggiPuzzle,
  state: JanggiState,
  move: Move,
  step: number,
): "solved" | "next" | "wrong" {
  const after = applyMove(state.board, move);
  if (isCheckmate(after, "h")) return "solved";
  const last = step >= puzzle.mateIn - 1;
  if (last) return "wrong";
  return sameMove(move, parseMove(puzzle.solution)) ? "next" : "wrong";
}

/** 상대(한)의 받는 수: 고수가 가장 오래 버티는 수를 고른다. 같은 문제는 늘 같은 수 */
export function defenseFor(state: JanggiState) {
  return janggiExpertBot.decide(viewOf(state, 1), { seed: 7 });
}

function attackers(board: Board, at: number): Kind[] {
  const kinds: Kind[] = [];
  board.forEach((cell, from) => {
    if (cell.startsWith("c") && pseudoTargets(board, from).includes(at))
      kinds.push(cell[1] as Kind);
  });
  return kinds;
}

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
    `${KIND_NAMES[mover[1] as Kind]}를 ${pointName(move.to)}로: 장군!`,
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
