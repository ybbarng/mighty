import {
  type Action,
  type BadukState,
  type Board,
  bestDefense,
  capturesWithin,
  createBadukScenario,
  groupOf,
  type LifeProblem,
  pointAt,
  pointName,
  tryPlace,
} from "@mighty/baduk-engine";

import type { BadukPuzzle } from "./puzzles";

/** 문제 판 크기: 모두 9줄 판이다 */
export const PUZZLE_SIZE = 9;

const at = (name: string) => pointAt(name, PUZZLE_SIZE);
const named = (p: number) => pointName(p, PUZZLE_SIZE);

/** 문제 장면에서 시작하는 판. 늘 흑(나, 0번 자리)이 둔다 */
export function puzzleState(puzzle: BadukPuzzle): BadukState {
  return createBadukScenario({
    black: puzzle.black,
    white: puzzle.white,
    me: 1,
  });
}

/** 노리는(살릴) 무리의 돌 자리 */
export const targetOf = (puzzle: BadukPuzzle) => at(puzzle.target);

/** 첫 정답 자리 */
export const solutionOf = (puzzle: BadukPuzzle) => at(puzzle.solution);

/** 사활 문제의 읽는 범위 */
export function lifeProblem(
  puzzle: Extract<BadukPuzzle, { kind: "life" }>,
): LifeProblem {
  return { target: targetOf(puzzle), area: puzzle.area.map(at) };
}

/**
 * 내 수를 판정한다.
 * - 사활: 첫 수가 정답이면 푼 것이다
 * - 잡기: 노리는 돌을 따내면 푼 것이다. 첫 수는 정답 자리만, 그다음은 남은 수 안에 따내는 수면 맞다
 */
export function judgeMove(
  puzzle: BadukPuzzle,
  state: BadukState,
  move: number,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind === "life")
    return move === solutionOf(puzzle) ? "solved" : "wrong";
  const target = targetOf(puzzle);
  const placed = tryPlace(state.board, move, 1);
  if (!placed.ok) return "wrong";
  if (placed.board[target] !== 2) return "solved";
  if (step === 0) return move === solutionOf(puzzle) ? "next" : "wrong";
  return capturesWithin(state.board, 1, target, move, puzzle.within - step)
    ? "next"
    : "wrong";
}

/**
 * 상대(백)가 받는 수: 따내는 데 가장 오래 걸리게 버틴다. 버틸 수가 없으면 쉰다.
 * 같은 판은 늘 같은 수
 */
export function defenseFor(
  puzzle: BadukPuzzle,
  state: BadukState,
  step: number,
): Action {
  if (puzzle.kind !== "capture") return { type: "pass" };
  const left = Math.max(0, puzzle.within - step - 1);
  const d = bestDefense(state.board, 1, targetOf(puzzle), left);
  return d === null ? { type: "pass" } : { type: "place", at: d };
}

const COUNT = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟"];

/** 푼 문제의 해설. 장면과 둔 수에서 만든다 */
export function explainSolved(
  puzzle: BadukPuzzle,
  before: Board,
  move: number,
  movesPlayed: number,
): string[] {
  if (puzzle.kind === "life") {
    const placed = tryPlace(before, move, 1);
    const took = placed.ok ? placed.captured.length : 0;
    if (puzzle.goal === "live")
      return [
        took > 0
          ? `${named(move)}: 안쪽 백 돌을 따내며 눈 자리를 둘로 나눈다`
          : `${named(move)}: 눈 자리를 둘로 나눈다`,
        "떨어진 두 눈이 있으면 백은 어느 눈에도 들어올 수 없어 잡히지 않는다",
        "다른 자리에 두면 백이 먼저 그 자리를 차지해 한 눈뿐이 된다",
      ];
    return [
      `${named(move)}: 백 눈 자리의 급소에 둔다`,
      "백은 눈을 둘로 나눌 수 없어 한 눈뿐이다. 결국 따낼 수 있다",
      "다른 자리에 두면 백이 그 자리를 차지해 두 눈을 만든다",
    ];
  }
  const target = targetOf(puzzle);
  const size = groupOf(before, target).stones.length;
  const first = named(solutionOf(puzzle));
  const lines: Record<typeof puzzle.theme, string[]> = {
    atari: [
      `${first}에서 단수: 백이 넓은 쪽으로 달아날 길을 먼저 막는다`,
      "반대쪽에서 단수를 치면 백이 뻗어 활로가 늘어난다",
    ],
    ladder: [
      `${first}에서 단수를 시작해 계속 단수로 몬다(축)`,
      "백은 한쪽으로만 뻗을 수 있고, 끝내 판 끝이나 흑 돌에 막혀 잡힌다",
    ],
    net: [
      `${first}: 바로 단수 치지 않고 한 칸 떨어져 길을 막는다(장문)`,
      "백이 어느 쪽으로 나와도 다음 단수에 잡힌다",
    ],
  };
  return [
    ...lines[puzzle.theme],
    `${COUNT[movesPlayed] ?? movesPlayed} 수 만에 백 돌${size > 1 ? ` ${size}개` : ""}을 따냈다`,
  ];
}
