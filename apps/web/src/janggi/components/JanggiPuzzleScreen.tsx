"use client";

import {
  type JanggiState,
  kingOf,
  legalFor,
  type Move,
  step,
} from "@mighty/janggi-engine";
import { useEffect, useState } from "react";

import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";
import { useJanggiStudyProgress } from "@/study/progress";

import { JANGGI_PUZZLE_SETS, type JanggiPuzzle } from "../puzzles";
import { useJanggiSettings } from "../settings";
import {
  defenseFor,
  explainFork,
  explainMate,
  explainTrade,
  judgeMove,
  parseMove,
  puzzleState,
} from "../study";
import { JanggiBoard } from "./JanggiBoard";

type Status = "play" | "waiting" | "wrong" | "solved";

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
};

/** 상대가 받는 수를 보이기 전에 잠깐 기다린다 */
const REPLY_MS = 600;

function findPuzzle(id: string) {
  for (const set of JANGGI_PUZZLE_SETS) {
    const index = set.puzzles.findIndex((p) => p.id === id);
    if (index >= 0)
      return { set, index, puzzle: set.puzzles[index] as JanggiPuzzle };
  }
  return null;
}

/** 장기 외통 문제 하나. 초가 둘 차례다 */
export function JanggiPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findPuzzle(puzzleId);
  const labels = useJanggiSettings((s) => s.labels);
  const solve = useJanggiStudyProgress((s) => s.solve);
  const miss = useJanggiStudyProgress((s) => s.miss);
  const [state, setState] = useState<JanggiState | null>(() =>
    found ? puzzleState(found.puzzle) : null,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<Status>("play");
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [explain, setExplain] = useState<string[]>([]);
  const [shown, setShown] = useState<Move | null>(null);
  const [missed, setMissed] = useState(false);

  // 상대(한)가 받는다.
  useEffect(() => {
    if (status !== "waiting" || !state) return;
    const timer = setTimeout(() => {
      const reply = defenseFor(state);
      const result = step(state, 1, reply);
      if (!result.ok) return;
      setState(result.state);
      if (reply.type === "move") {
        setLastMove({ from: reply.from, to: reply.to });
        playUiCue(state.board[reply.to] ? "capture" : "piece");
      }
      setStepIndex((i) => i + 1);
      setStatus("play");
    }, REPLY_MS);
    return () => clearTimeout(timer);
  }, [status, state]);

  if (!found || !state) return null;
  const { set, index, puzzle } = found;
  const text = TEXT[puzzle.kind];
  const nextId = set.puzzles[index + 1]?.id ?? null;

  const restart = () => {
    setState(puzzleState(puzzle));
    setStepIndex(0);
    setStatus("play");
    setSelected(null);
    setLastMove(null);
    setExplain([]);
    setShown(null);
  };

  const play = (move: Move) => {
    const verdict = judgeMove(puzzle, state, move, stepIndex);
    const before = state;
    const result = step(state, 0, { type: "move", ...move });
    if (!result.ok) return;
    setState(result.state);
    setLastMove(move);
    playUiCue(before.board[move.to] ? "capture" : "piece");
    if (verdict === "solved") {
      setExplain(
        puzzle.kind === "trade"
          ? explainTrade(before.board, move, parseMove(puzzle.trap))
          : puzzle.kind === "fork"
            ? explainFork(before.board, move)
            : explainMate(before.board, move),
      );
      setStatus("solved");
      playUiCue("win");
      // 정답 보기를 누른 뒤 푼 것은 푼 것으로 치지 않는다.
      if (!shown) solve(puzzle.id);
    } else if (verdict === "next") setStatus("waiting");
    else {
      setStatus("wrong");
      playUiCue("invalid");
      if (!missed) {
        miss(puzzle.id);
        setMissed(true);
      }
    }
  };

  /** 정답 보기: 지금 둘 정답 수를 판에 보인다(두 수 문제의 둘째 수는 외통 수 하나) */
  const reveal = () => {
    restart();
    setShown(parseMove(puzzle.solution));
    setSelected(parseMove(puzzle.solution).from);
  };

  const legal = status === "play" ? legalFor(state, 0) : [];
  const outcome: Outcome | null =
    status === "solved" ? "win" : status === "wrong" ? "loss" : null;
  const prompt =
    puzzle.kind !== "mate" || puzzle.mateIn === 1
      ? text.prompt
      : stepIndex === 0
        ? "두 수 만에 외통: 첫 수를 두세요"
        : "이제 외통을 만드세요";
  const statusText =
    status === "solved"
      ? text.solved
      : status === "wrong"
        ? text.wrong
        : status === "waiting"
          ? "한이 받는 중…"
          : prompt;

  return (
    <main
      data-game="janggi"
      className="flex min-h-dvh flex-col items-center gap-3 bg-[#1c1917] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[auto_minmax(0,18rem)] short-landscape:grid-rows-[auto_auto_1fr] short-landscape:content-center short-landscape:justify-center short-landscape:gap-x-6"
    >
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-start-2 short-landscape:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 목록
        </button>
        <span className="ml-auto font-semibold">
          {set.title} {index + 1}/{set.puzzles.length}
        </span>
      </header>

      <div className="aspect-[924/1024] w-[min(100%,calc((100dvh-17rem)*0.9))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-3 short-landscape:row-start-1 short-landscape:w-[calc((100dvh-1.5rem)*0.9)]">
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
            play(m);
          }}
          lastMove={lastMove}
          checkedKing={status === "solved" ? kingOf(state.board, "h") : null}
          labels={labels}
        />
      </div>

      <div className="flex w-full max-w-xl flex-col items-center gap-3 short-landscape:col-start-2 short-landscape:row-start-2">
        <RoundOutcome
          outcome={outcome}
          status={statusText}
          summary={
            status === "solved"
              ? shown
                ? "정답을 본 뒤 풀었어요. 다음에 다시 풀어 보세요"
                : "맞혔어요!"
              : status === "wrong"
                ? text.wrongHint
                : undefined
          }
        />
        {status === "solved" && (
          <ul className="w-full list-inside list-disc rounded-xl bg-white/5 p-3 text-sm text-white/85">
            {explain.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {status === "play" && !shown && (
            <button
              type="button"
              onClick={() => setSelected(parseMove(puzzle.solution).from)}
              className={cn(
                "rounded-xl bg-white/10 px-4 py-2",
                stepIndex > 0 && "hidden",
              )}
            >
              힌트
            </button>
          )}
          {(status === "wrong" || status === "play") && (
            <button
              type="button"
              onClick={reveal}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              정답 보기
            </button>
          )}
          {status === "wrong" && (
            <button
              type="button"
              onClick={restart}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
          )}
          {status === "solved" && nextId && (
            <button
              type="button"
              onClick={() => onOpen(nextId)}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다음 문제
            </button>
          )}
          {status === "solved" && !nextId && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              목록으로
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
