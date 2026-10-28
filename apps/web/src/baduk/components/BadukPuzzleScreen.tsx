"use client";

import {
  type BadukState,
  legalPoints,
  pointName,
  step,
} from "@mighty/baduk-engine";
import { useState } from "react";

import {
  findInSets,
  PuzzleScreen,
  usePuzzleRun,
} from "@/components/study/PuzzleScreen";

import { useBadukStudyProgress } from "../progress";
import {
  BADUK_PUZZLE_SETS,
  type BadukPuzzle,
  type BadukPuzzleSet,
  type CaptureTheme,
} from "../puzzles";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "../study";
import { BadukBoard } from "./BadukBoard";

/** 잡기 문제 모양마다 보이는 글 */
const CAPTURE_TEXT: Record<CaptureTheme, { prompt: string; hint: string }> = {
  atari: {
    prompt: "△ 백 돌을 따내세요",
    hint: "단수를 어느 쪽에서 치느냐가 중요해요. 백이 넓은 쪽으로 못 나오게 막아요",
  },
  ladder: {
    prompt: "축으로 △ 백 돌을 잡으세요",
    hint: "계속 단수를 치며 몰아요. 백이 뻗을 때마다 활로가 하나뿐이어야 해요",
  },
  net: {
    prompt: "장문으로 △ 백 돌을 잡으세요",
    hint: "바로 단수 치면 달아나요. 한 칸 떨어져 길을 막아 봐요",
  },
};

/** 바둑 문제 하나. 흑이 둔다 */
export function BadukPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findInSets<BadukPuzzle>(BADUK_PUZZLE_SETS, puzzleId);
  if (!found) return null;
  return (
    <BadukPuzzleRun
      set={found.set as BadukPuzzleSet}
      index={found.index}
      puzzle={found.puzzle}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function BadukPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
}: {
  set: BadukPuzzleSet;
  index: number;
  puzzle: BadukPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const solve = useBadukStudyProgress((s) => s.solve);
  const miss = useBadukStudyProgress((s) => s.miss);
  const [aim, setAim] = useState<number | null>(null);
  const [placed, setPlaced] = useState(0);
  const run = usePuzzleRun<BadukState, number>({
    initial: () => puzzleState(puzzle),
    judge: (state, move, at) => judgeMove(puzzle, state, move, at),
    apply: (state, move) => {
      const result = step(state, 0, { type: "place", at: move });
      if (!result.ok) return null;
      setPlaced((n) => n + 1);
      return {
        state: result.state,
        capture: result.state.prisoners[1] > state.prisoners[1],
      };
    },
    reply: (state) => {
      const answer = defenseFor(puzzle, state, placed - 1);
      const result = step(state, 1, answer);
      if (!result.ok) return null;
      return {
        state: result.state,
        move: answer.type === "place" ? answer.at : null,
        capture: result.state.prisoners[2] > state.prisoners[2],
      };
    },
    explain: (before, move) =>
      explainSolved(puzzle, before.board, move, placed + 1),
    solve: () => solve(puzzle.id),
    miss: () => miss(puzzle.id),
  });
  const { state, status, shown } = run;
  const nextId = set.puzzles[index + 1]?.id ?? null;
  const answer = solutionOf(puzzle);
  const target = targetOf(puzzle);

  const legal = status === "play" ? legalPoints(state) : [];
  const capture = puzzle.kind === "capture" ? CAPTURE_TEXT[puzzle.theme] : null;
  const live = puzzle.kind === "life" && puzzle.goal === "live";
  const goal = capture
    ? run.step === 0
      ? capture.prompt
      : "계속 몰아 따내세요"
    : live
      ? "△ 흑 무리를 살리세요"
      : "△ 백 무리를 잡으세요";
  // 손가락은 한 번 겨누고 다시 눌러 둔다(대국 화면과 같다).
  const prompt =
    aim !== null
      ? `${pointName(aim, PUZZLE_SIZE)}: 한 번 더 누르면 둔다`
      : goal;

  return (
    <PuzzleScreen
      game="baduk"
      setTitle={set.title}
      index={index}
      total={set.puzzles.length}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-16rem))] short-landscape:w-[calc(100dvh-1.5rem)]"
      board={
        <BadukBoard
          board={state.board}
          size={PUZZLE_SIZE}
          myStone={1}
          canPlay={status === "play"}
          legal={shown && status === "play" ? [shown] : legal}
          lastMove={run.lastMove}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => {
            setAim(null);
            run.play(at);
          }}
          marks={state.board[target] ? { [target]: "△" } : {}}
        />
      }
      status={status}
      prompt={prompt}
      waitingText="백이 받는 중…"
      solvedText={capture ? "따냈어요!" : live ? "살았어요!" : "잡았어요!"}
      wrongText={
        capture
          ? "그 수로는 못 따내요"
          : live
            ? "그 수로는 살 수 없어요"
            : "그 수로는 백이 살아요"
      }
      wrongHint={
        capture
          ? capture.hint
          : live
            ? "눈 자리를 둘로 나누는 곳을 찾아요"
            : "백이 두면 두 눈이 되는 자리(급소)를 먼저 차지해요"
      }
      shown={shown !== null}
      explain={run.explain}
      canHint={run.step === 0}
      onHint={() => setAim(answer)}
      onReveal={() => {
        run.reveal(answer);
        setPlaced(0);
        setAim(answer);
      }}
      onRestart={() => {
        run.restart();
        setPlaced(0);
        setAim(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
