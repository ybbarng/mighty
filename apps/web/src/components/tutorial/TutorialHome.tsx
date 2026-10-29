"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { track } from "@/stats/track";

import { lessonStates } from "@/tutorial/progress";
import { GlossarySheet } from "./GlossarySheet";
import type { TutorialKit } from "./kit";

/** 튜토리얼 단원 목록. 언어 학습 앱처럼 한 단원씩 쌓아 간다 */
export function TutorialHome<View, Event, Scenario, Action>({
  tutorial,
  onOpen,
  onBack,
  extra,
}: {
  onOpen: (lessonId: string) => void;
  onBack: () => void;
  /** 단원 목록 아래 다음 단계 안내(판 게임의 "수 배우기") */
  extra?: { title: string; detail: string; onClick: () => void };
  tutorial: TutorialKit<View, Event, Scenario, Action>;
}) {
  const { lessons } = tutorial;
  // 배우기 목록은 주소가 바뀌지 않아 페이지 보기로 잡히지 않는다(docs/33 2-2절).
  const game = tutorial.progress.game;
  useEffect(() => {
    track("learn-open", { game });
  }, [game]);
  const completed = tutorial.progress((s) => s.completed);
  const states = lessonStates(lessons, completed);
  const doneCount = states.filter((s) => s === "done").length;
  const [glossary, setGlossary] = useState(false);

  return (
    <main
      className={cn("flex min-h-dvh justify-center p-4", tutorial.background)}
    >
      <div className="flex w-full max-w-md flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">{tutorial.title}</h1>
          <div className="flex gap-1.5">
            {tutorial.glossary && (
              <button
                type="button"
                onClick={() => setGlossary(true)}
                className="rounded-lg bg-white/10 px-3 py-1 text-sm"
              >
                용어 사전
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm"
            >
              처음으로
            </button>
          </div>
        </div>
        {glossary && <GlossarySheet onClose={() => setGlossary(false)} />}
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
              style={{ width: `${(doneCount / lessons.length) * 100}%` }}
            />
          </div>
          <span className="text-sm tabular-nums opacity-80">
            {doneCount}/{lessons.length}
          </span>
        </div>
        {doneCount === lessons.length && (
          <div className="pop-in flex flex-col gap-2 rounded-2xl border border-emerald-300/50 bg-emerald-500/15 p-4">
            <p className="font-bold">모든 단원을 마쳤어요! 🎉</p>
            <p className="text-sm opacity-80">
              이제 컴퓨터와 한 판, 친구와 한 판 해 보세요. 단원은 언제든 다시 볼
              수 있어요.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl bg-amber-400 px-4 py-2 font-semibold text-black"
            >
              게임하러 가기
            </button>
          </div>
        )}
        <ol className="flex flex-col gap-2">
          {lessons.map((lesson, i) => {
            const state = states[i];
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  disabled={state === "locked"}
                  onClick={() => onOpen(lesson.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                    state === "next" &&
                      "border-amber-300 bg-amber-400/15 shadow-[0_0_20px_rgba(251,191,36,0.25)]",
                    state === "done" && "border-white/10 bg-white/10",
                    state === "locked" &&
                      "border-white/5 bg-black/20 opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black",
                      state === "done"
                        ? "bg-emerald-400 text-black"
                        : state === "next"
                          ? "bg-amber-400 text-black"
                          : "bg-white/10",
                    )}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-bold">{lesson.title}</span>
                    <span className="text-xs opacity-70">{lesson.summary}</span>
                  </span>
                  {state === "next" && (
                    <span className="ml-auto text-amber-300 text-sm">
                      시작 →
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        {extra && (
          <button
            type="button"
            onClick={extra.onClick}
            className="flex items-center gap-3 rounded-2xl border border-sky-300/60 bg-sky-500/15 p-3 text-left hover:bg-sky-500/25"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-400 font-black text-black">
              ♟
            </span>
            <span className="flex flex-col">
              <span className="font-bold">{extra.title}</span>
              <span className="text-xs opacity-70">{extra.detail}</span>
            </span>
            <span className="ml-auto text-sky-200 text-sm">열기 →</span>
          </button>
        )}
      </div>
    </main>
  );
}
