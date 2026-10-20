"use client";

import { cn } from "@/lib/cn";
import { LESSONS } from "@/tutorial/lessons";
import { lessonStates, useTutorialProgress } from "@/tutorial/progress";

/** 튜토리얼 단원 목록. 언어 학습 앱처럼 한 단원씩 쌓아 간다 */
export function TutorialHome({
  onOpen,
  onBack,
}: {
  onOpen: (lessonId: string) => void;
  onBack: () => void;
}) {
  const completed = useTutorialProgress((s) => s.completed);
  const states = lessonStates(completed);
  const doneCount = states.filter((s) => s === "done").length;

  return (
    <main className="flex min-h-dvh justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">마이티 배우기</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
              style={{ width: `${(doneCount / LESSONS.length) * 100}%` }}
            />
          </div>
          <span className="text-sm tabular-nums opacity-80">
            {doneCount}/{LESSONS.length}
          </span>
        </div>
        <ol className="flex flex-col gap-2">
          {LESSONS.map((lesson, i) => {
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
      </div>
    </main>
  );
}
