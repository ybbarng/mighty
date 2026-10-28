"use client";

import {
  type JanggiState,
  kingOf,
  legalFor,
  type Move,
  step,
} from "@mighty/janggi-engine";
import { useState } from "react";

import {
  findInSets,
  PuzzleScreen,
  usePuzzleRun,
} from "@/components/study/PuzzleScreen";
import { useJanggiStudyProgress } from "@/study/progress";

import {
  JANGGI_PUZZLE_SETS,
  type JanggiPuzzle,
  type JanggiPuzzleSet,
} from "../puzzles";
import { useJanggiSettings } from "../settings";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  parseMove,
  puzzleState,
} from "../study";
import { JanggiBoard } from "./JanggiBoard";

/** 문제 종류마다 보이는 글 */
const TEXT: Record<
  JanggiPuzzle["kind"],
  { prompt: string; solved: string; wrong: string; wrongHint: string }
> = {
  mate: {
    prompt: "한 수로 외통을 만드세요",
    solved: "외통!",
    wrong: "외통이 아니에요",
    wrongHint: "장군을 부르고, 궁이 피할 곳을 모두 막아야 해요",
  },
  fork: {
    prompt: "한 수로 두 곳을 함께 노리세요",
    solved: "양수겸장!",
    wrong: "두 곳을 노리는 수가 아니에요",
    wrongHint: "큰 기물 둘(또는 궁과 큰 기물)을 한 번에 노리는 자리를 찾아요",
  },
  trade: {
    prompt: "이득인 잡기를 고르세요",
    solved: "이득!",
    wrong: "그 수로는 이득이 없어요",
    wrongHint: "잡은 뒤 상대가 다시 잡는지, 무엇을 잃는지 따져 봐요",
  },
  cannon: {
    prompt: "포 길을 열어 큰 기물을 노리세요",
    solved: "포 길이 열렸어요!",
    wrong: "그 수로는 포 길이 열리지 않아요",
    wrongHint:
      "포는 꼭 하나를 넘어야 가요. 포와 상대 기물 사이에 다리를 놓아 봐요",
  },
  block: {
    prompt: "멱을 막아 기물을 지키세요",
    solved: "멱을 막았어요!",
    wrong: "그 수로는 기물을 잃어요",
    wrongHint: "상대 마·상이 곧게 처음 가는 칸(멱)에 기물을 놓으면 못 와요",
  },
};

/** 수 세기 낱말 */
const COUNT: Record<number, string> = { 1: "한", 2: "두", 3: "세" };

/** 장기 문제 하나. 초가 둘 차례다 */
export function JanggiPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findInSets<JanggiPuzzle>(JANGGI_PUZZLE_SETS, puzzleId);
  if (!found) return null;
  return (
    <JanggiPuzzleRun
      set={found.set as JanggiPuzzleSet}
      index={found.index}
      puzzle={found.puzzle}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function JanggiPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
}: {
  set: JanggiPuzzleSet;
  index: number;
  puzzle: JanggiPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const labels = useJanggiSettings((s) => s.labels);
  const solve = useJanggiStudyProgress((s) => s.solve);
  const miss = useJanggiStudyProgress((s) => s.miss);
  const [selected, setSelected] = useState<number | null>(null);
  const run = usePuzzleRun<JanggiState, Move>({
    initial: () => puzzleState(puzzle),
    judge: (state, move, at) => judgeMove(puzzle, state, move, at),
    apply: (state, move) => {
      const result = step(state, 0, { type: "move", ...move });
      if (!result.ok) return null;
      return { state: result.state, capture: Boolean(state.board[move.to]) };
    },
    reply: (state) => {
      const answer = defenseFor(state);
      const result = step(state, 1, answer);
      if (!result.ok) return null;
      const move =
        answer.type === "move" ? { from: answer.from, to: answer.to } : null;
      return {
        state: result.state,
        move,
        capture: Boolean(move && state.board[move.to]),
      };
    },
    explain: (before, move) => explainSolved(puzzle, before.board, move),
    solve: () => solve(puzzle.id),
    miss: () => miss(puzzle.id),
  });
  const { state, status, shown } = run;
  const text = TEXT[puzzle.kind];
  const nextId = set.puzzles[index + 1]?.id ?? null;
  const answer = parseMove(puzzle.solution);

  const legal = status === "play" ? legalFor(state, 0) : [];
  const prompt =
    puzzle.kind !== "mate" || puzzle.mateIn === 1
      ? text.prompt
      : run.step === 0
        ? `${COUNT[puzzle.mateIn]} 수 만에 외통: 첫 수를 두세요`
        : run.step < puzzle.mateIn - 1
          ? `외통까지 ${COUNT[puzzle.mateIn - run.step]} 수 남았어요`
          : "이제 외통을 만드세요";

  return (
    <PuzzleScreen
      game="janggi"
      setTitle={set.title}
      index={index}
      total={set.puzzles.length}
      boardClassName="aspect-[924/1024] w-[min(100%,calc((100dvh-17rem)*0.9))] short-landscape:w-[calc((100dvh-1.5rem)*0.9)]"
      board={
        <JanggiBoard
          board={state.board}
          flipped={false}
          legal={
            shown && status === "play"
              ? legal.filter((m) => m.from === shown.from && m.to === shown.to)
              : legal
          }
          selected={selected}
          onSelect={setSelected}
          onMove={(m) => {
            setSelected(null);
            run.play(m);
          }}
          lastMove={run.lastMove}
          checkedKing={
            status === "solved" && puzzle.kind === "mate"
              ? kingOf(state.board, "h")
              : null
          }
          labels={labels}
        />
      }
      status={status}
      prompt={prompt}
      waitingText="한이 받는 중…"
      solvedText={text.solved}
      wrongText={text.wrong}
      wrongHint={text.wrongHint}
      shown={shown !== null}
      explain={run.explain}
      canHint={run.step === 0}
      onHint={() => setSelected(answer.from)}
      onReveal={() => {
        run.reveal(answer);
        setSelected(answer.from);
      }}
      onRestart={() => {
        run.restart();
        setSelected(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
