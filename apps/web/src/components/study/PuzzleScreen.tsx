"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

/*
 * 수 배우기 문제 화면의 공통 틀(docs/23). 장기·체스·바둑이 함께 쓴다.
 * - `usePuzzleRun`: 문제 하나를 푸는 흐름(내 수 판정 → 상대 응수 → 풀었나/틀렸나, 진행 기록)
 * - `PuzzleScreen`: 머리줄·판 자리·상태 줄·해설·단추(힌트, 정답 보기, 다시 하기, 다음 문제)
 * 게임마다 다른 것(판 그림, 수 판정, 상대 응수, 해설)은 넘겨받는다.
 */

export type PuzzleStatus = "play" | "waiting" | "wrong" | "solved";

/** 상대가 받는 수를 보이기 전에 잠깐 기다린다 */
const REPLY_MS = 600;

/** 수를 둔 결과: 새 판과 잡았는지(소리) */
export interface Applied<S> {
  state: S;
  capture: boolean;
}

export interface PuzzleRules<S, M> {
  /** 문제 처음 판 */
  initial: () => S;
  /** 내 수 판정. `step`은 지금까지 둔 내 수 */
  judge: (state: S, move: M, step: number) => "solved" | "next" | "wrong";
  /** 내 수를 둔다. 둘 수 없으면 null */
  apply: (state: S, move: M) => Applied<S> | null;
  /** 상대가 받는다. 받은 수(판에 보일 것)와 새 판 */
  reply?: (state: S) => (Applied<S> & { move: M | null }) | null;
  /** 푼 뒤 해설. 둔 수 앞의 판과 둔 수로 만든다 */
  explain: (before: S, move: M) => string[];
  /** 진행 기록 */
  solve: () => void;
  miss: () => void;
}

/** 문제 하나를 푸는 흐름. 판 그림은 부르는 쪽이 그린다 */
export function usePuzzleRun<S, M>(rules: PuzzleRules<S, M>) {
  const [state, setState] = useState<S>(rules.initial);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<PuzzleStatus>("play");
  const [lastMove, setLastMove] = useState<M | null>(null);
  const [explain, setExplain] = useState<string[]>([]);
  const [shown, setShown] = useState<M | null>(null);
  const [missed, setMissed] = useState(false);
  // 상대 응수는 늘 마지막으로 받은 규칙으로 둔다(다시 그릴 때마다 기다림이 처음부터 시작하지 않게).
  const latest = useRef(rules);
  latest.current = rules;
  const hasReply = Boolean(rules.reply);

  // 상대가 받는다.
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setTimeout(() => {
      const answer = latest.current.reply?.(state);
      if (!answer) return;
      setState(answer.state);
      if (answer.move !== null) {
        setLastMove(answer.move);
        playUiCue(answer.capture ? "capture" : "piece");
      }
      setStep((i) => i + 1);
      setStatus("play");
    }, REPLY_MS);
    return () => clearTimeout(timer);
  }, [status, state]);

  const restart = () => {
    setState(rules.initial());
    setStep(0);
    setStatus("play");
    setLastMove(null);
    setExplain([]);
    setShown(null);
  };

  const play = (move: M) => {
    const verdict = rules.judge(state, move, step);
    const done = rules.apply(state, move);
    if (!done) return;
    const before = state;
    setState(done.state);
    setLastMove(move);
    playUiCue(done.capture ? "capture" : "piece");
    if (verdict === "solved") {
      setExplain(rules.explain(before, move));
      setStatus("solved");
      playUiCue("win");
      // 정답 보기를 누른 뒤 푼 것은 푼 것으로 치지 않는다.
      if (!shown) rules.solve();
    } else if (verdict === "next") {
      if (hasReply) setStatus("waiting");
      else setStep((i) => i + 1);
    } else {
      setStatus("wrong");
      playUiCue("invalid");
      if (!missed) {
        rules.miss();
        setMissed(true);
      }
    }
  };

  /** 정답 보기: 처음 판으로 돌려 첫 정답 수를 보인다 */
  const reveal = (answer: M) => {
    restart();
    setShown(answer);
  };

  return {
    state,
    step,
    status,
    lastMove,
    explain,
    shown,
    play,
    restart,
    reveal,
  };
}

/** 문제 화면 틀: 머리줄, 판, 상태 줄, 해설, 단추 */
export function PuzzleScreen({
  game,
  setTitle,
  index,
  total,
  board,
  boardClassName,
  status,
  prompt,
  waitingText,
  solvedText,
  wrongText,
  wrongHint,
  shown,
  explain,
  canHint,
  onHint,
  onReveal,
  onRestart,
  onNext,
  onExit,
  extraButtons,
}: {
  /** `data-game` 값(게임마다 판 색 등) */
  game: string;
  setTitle: string;
  /** 묶음 안 번호(0부터) */
  index: number;
  total: number;
  board: ReactNode;
  /** 판 자리 크기(게임마다 판 비율이 다르다) */
  boardClassName: string;
  status: PuzzleStatus;
  prompt: string;
  waitingText: string;
  solvedText: string;
  wrongText: string;
  wrongHint: string;
  /** 정답 보기를 눌렀나 */
  shown: boolean;
  explain: readonly string[];
  /** 힌트 단추를 보일까(첫 수에서만) */
  canHint: boolean;
  onHint: () => void;
  onReveal: () => void;
  onRestart: () => void;
  /** 다음 문제. 묶음 끝이면 null */
  onNext: (() => void) | null;
  onExit: () => void;
  /** 판 밑에 더 둘 단추(바둑 쉬기 등) */
  extraButtons?: ReactNode;
}) {
  const outcome: Outcome | null =
    status === "solved" ? "win" : status === "wrong" ? "loss" : null;
  const statusText =
    status === "solved"
      ? solvedText
      : status === "wrong"
        ? wrongText
        : status === "waiting"
          ? waitingText
          : prompt;
  return (
    <main
      data-game={game}
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
          {setTitle} {index + 1}/{total}
        </span>
      </header>

      <div
        className={cn(
          "max-w-xl short-landscape:col-start-1 short-landscape:row-span-3 short-landscape:row-start-1",
          boardClassName,
        )}
      >
        {board}
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
                ? wrongHint
                : undefined
          }
        />
        {status === "solved" && explain.length > 0 && (
          <ul className="w-full list-inside list-disc rounded-xl bg-white/5 p-3 text-sm text-white/85">
            {explain.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {status === "play" && extraButtons}
          {status === "play" && !shown && canHint && (
            <button
              type="button"
              onClick={onHint}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              힌트
            </button>
          )}
          {(status === "wrong" || status === "play") && (
            <button
              type="button"
              onClick={onReveal}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              정답 보기
            </button>
          )}
          {status === "wrong" && (
            <button
              type="button"
              onClick={onRestart}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
          )}
          {status === "solved" && (
            <button
              type="button"
              onClick={onNext ?? onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              {onNext ? "다음 문제" : "목록으로"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/** 묶음 목록에서 문제 하나를 찾는다 */
export function findInSets<P extends { id: string }>(
  sets: readonly { title: string; puzzles: readonly P[] }[],
  id: string,
) {
  for (const set of sets) {
    const index = set.puzzles.findIndex((p) => p.id === id);
    if (index >= 0) return { set, index, puzzle: set.puzzles[index] as P };
  }
  return null;
}
