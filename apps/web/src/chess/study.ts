import { chessExpertBot } from "@mighty/chess-ai";
import {
  applyMove,
  attacked,
  type Board,
  type ChessState,
  createChessScenario,
  isCheckmate,
  KIND_NAMES,
  type Kind,
  kingOf,
  type Move,
  moveToSan,
  type Position,
  sameMove,
  sanToMove,
  squareName,
  viewOf,
} from "@mighty/chess-engine";

import type { ChessPuzzle } from "./puzzles";

/** 문제 장면에서 시작하는 판. 늘 백(나, 0번 자리)이 둘 차례다 */
export function puzzleState(puzzle: ChessPuzzle): ChessState {
  return createChessScenario({ fen: puzzle.fen, me: "w" });
}

/** 문제의 첫 정답 수 */
export function solutionMove(puzzle: ChessPuzzle): Move {
  const move = sanToMove(puzzleState(puzzle).position, puzzle.solution);
  if (!move) throw new Error(`둘 수 없는 정답: ${puzzle.id}`);
  return move;
}

/**
 * 내 수를 판정한다. 마지막 수는 메이트면 어느 수든 정답, 그 앞 수는 문제의 정답 수만
 */
export function judgeMove(
  puzzle: ChessPuzzle,
  state: ChessState,
  move: Move,
  step: number,
): "solved" | "next" | "wrong" {
  if (isCheckmate(applyMove(state.position, move))) return "solved";
  if (step >= puzzle.mateIn - 1) return "wrong";
  return sameMove(move, solutionMove(puzzle)) ? "next" : "wrong";
}

/** 상대(흑)의 받는 수: 고수가 가장 오래 버티는 수를 고른다. 같은 문제는 늘 같은 수 */
export function defenseFor(state: ChessState) {
  return chessExpertBot.decide(viewOf(state, 1), { seed: 7 });
}

/** 이 칸을 노리는 백 기물 종류 */
function attackers(board: Board, at: number): Kind[] {
  const kinds = new Set<Kind>();
  board.forEach((cell, from) => {
    if (!cell.startsWith("w")) return;
    // 그 기물 하나만 남긴 판에서 노리는지 본다(가린 기물 없이 그 기물이 닿나).
    const alone = board.map((c, i) =>
      i === from || c === "" || c[0] === "b" ? c : "",
    );
    if (attacked(alone, at, "w")) kinds.add(cell[1] as Kind);
  });
  return [...kinds];
}

/** 끝 글자에 받침이 있나(을/를을 고른다) */
function hasBatchim(word: string): boolean {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
const obj = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;
const subj = (word: string) => `${word}${hasBatchim(word) ? "이" : "가"}`;
const names = (kinds: Kind[]) => kinds.map((k) => KIND_NAMES[k]).join("·");

/**
 * 메이트가 된 판을 말로 풀어 준다: 어느 기물이 체크했고, 킹이 갈 칸을 누가 막나.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainMate(pos: Position, move: Move): string[] {
  const after = applyMove(pos, move);
  const board = after.board;
  const king = kingOf(board, "b");
  const mover = board[move.to] as string;
  const lines = [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${squareName(move.to)}로(${moveToSan(pos, move)}): 체크!`,
  ];
  const [kx, ky] = [king % 8, Math.floor(king / 8)];
  const blocked: string[] = [];
  const guarded = new Map<string, string[]>();
  for (const dx of [-1, 0, 1])
    for (const dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const x = kx + dx;
      const y = ky + dy;
      if (x < 0 || x > 7 || y < 0 || y > 7) continue;
      const to = y * 8 + x;
      const cell = board[to] ?? "";
      if (cell.startsWith("b")) {
        blocked.push(squareName(to));
        continue;
      }
      // 킹이 그 칸으로 간 판에서 누가 노리나
      const moved = [...board];
      moved[to] = "bK";
      moved[king] = "";
      const who = names(attackers(moved, to));
      if (!who) continue;
      guarded.set(who, [...(guarded.get(who) ?? []), squareName(to)]);
    }
  if (blocked.length > 0)
    lines.push(`킹 둘레 ${blocked.join("·")}는 흑 자기 기물이 막고 있다`);
  for (const [who, squares] of guarded)
    lines.push(`킹이 피할 ${squares.join("·")}는 ${subj(who)} 노린다`);
  lines.push("막거나 잡을 수도 없어 체크메이트다");
  return lines;
}
