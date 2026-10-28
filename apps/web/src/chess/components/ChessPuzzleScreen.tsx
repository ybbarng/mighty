"use client";

import {
  type ChessState,
  kingOf,
  legalFor,
  type Move,
  PROMOTIONS,
  step,
} from "@mighty/chess-engine";
import { useState } from "react";

import {
  findInSets,
  PuzzleScreen,
  usePuzzleRun,
} from "@/components/study/PuzzleScreen";

import { useChessStudyProgress } from "../progress";
import {
  CHESS_PUZZLE_SETS,
  type ChessPuzzle,
  type ChessPuzzleSet,
} from "../puzzles";
import { useChessSettings } from "../settings";
import {
  defenseFor,
  explainMate,
  judgeMove,
  puzzleState,
  solutionMove,
} from "../study";
import { explainTactic, TACTIC_NAMES, type Tactic } from "../tactics";
import { ChessBoard } from "./ChessBoard";

/** 전술마다 틀렸을 때 도움말 */
const TACTIC_HINT: Record<Tactic, string> = {
  fork: "한 기물로 두 곳을 함께 노리는 칸을 찾아요",
  pin: "앞 기물 뒤에 더 비싼 기물(또는 킹)이 있는 줄을 노려요",
  skewer: "킹이나 퀸을 노려 비키게 하고, 뒤의 기물을 잡아요",
  discovered: "앞을 막고 있는 기물을 비키며 다른 곳도 노려요",
};

/** 전술마다 문제 안내 */
const TACTIC_PROMPT: Record<Tactic, string> = {
  fork: "포크로 기물을 얻으세요",
  pin: "핀으로 기물을 묶어 얻으세요",
  skewer: "스큐어로 뒤의 기물을 얻으세요",
  discovered: "발견 공격으로 기물을 얻으세요",
};

/** 체스 문제 하나. 백이 둘 차례다 */
export function ChessPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findInSets<ChessPuzzle>(CHESS_PUZZLE_SETS, puzzleId);
  if (!found) return null;
  return (
    <ChessPuzzleRun
      set={found.set as ChessPuzzleSet}
      index={found.index}
      puzzle={found.puzzle}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function ChessPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
}: {
  set: ChessPuzzleSet;
  index: number;
  puzzle: ChessPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const coordinates = useChessSettings((s) => s.coordinates);
  const solve = useChessStudyProgress((s) => s.solve);
  const miss = useChessStudyProgress((s) => s.miss);
  const [selected, setSelected] = useState<number | null>(null);
  const run = usePuzzleRun<ChessState, Move>({
    initial: () => puzzleState(puzzle),
    judge: (state, move, at) => judgeMove(puzzle, state, move, at),
    apply: (state, move) => {
      const result = step(state, 0, { type: "move", ...move });
      if (!result.ok) return null;
      return {
        state: result.state,
        capture: Boolean(state.position.board[move.to]),
      };
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
        capture: Boolean(move && state.position.board[move.to]),
      };
    },
    explain: (before, move) =>
      puzzle.kind === "tactic"
        ? explainTactic(before.position, move, puzzle.tactic)
        : explainMate(before.position, move),
    solve: () => solve(puzzle.id),
    miss: () => miss(puzzle.id),
  });
  const { state, status, shown } = run;
  const nextId = set.puzzles[index + 1]?.id ?? null;
  const answer = solutionMove(puzzle);

  /** 문제에는 승급 수가 없지만, 고르면 퀸으로 둔다 */
  const play = (picked: Move) => {
    const move =
      legalFor(state, 0).find(
        (m) =>
          m.from === picked.from &&
          m.to === picked.to &&
          (m.promotion === undefined || m.promotion === PROMOTIONS[0]),
      ) ?? picked;
    run.play(move);
  };

  const legal = status === "play" ? legalFor(state, 0) : [];
  const tactic = puzzle.kind === "tactic" ? puzzle.tactic : null;
  const prompt = tactic
    ? TACTIC_PROMPT[tactic]
    : puzzle.kind === "mate" && puzzle.mateIn === 1
      ? "한 수로 체크메이트하세요"
      : run.step === 0
        ? "두 수 만에 메이트: 첫 수를 두세요"
        : "이제 체크메이트하세요";

  return (
    <PuzzleScreen
      game="chess"
      setTitle={set.title}
      index={index}
      total={set.puzzles.length}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-16rem))] short-landscape:w-[calc(100dvh-1.5rem)]"
      board={
        <ChessBoard
          board={state.position.board}
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
            play(m);
          }}
          lastMove={run.lastMove}
          checkedKing={
            status === "solved" && !tactic
              ? kingOf(state.position.board, "b")
              : null
          }
          coordinates={coordinates}
        />
      }
      status={status}
      prompt={prompt}
      waitingText="흑이 받는 중…"
      solvedText={tactic ? `${TACTIC_NAMES[tactic]}!` : "체크메이트!"}
      wrongText={tactic ? "그 수로는 기물을 얻지 못해요" : "메이트가 아니에요"}
      wrongHint={
        tactic
          ? TACTIC_HINT[tactic]
          : "체크를 부르고, 킹이 피할 칸을 모두 막아야 해요"
      }
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
