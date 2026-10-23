"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;
  /** 답을 고른 뒤 보이는 풀이 */
  why: string;
}

/** 확인 퀴즈: 고르면 바로 맞았는지와 풀이를 보인다. 다 맞히면 `onPass` */
export function Quiz({
  items,
  onPass,
}: {
  items: QuizItem[];
  onPass: () => void;
}) {
  const [picked, setPicked] = useState<(number | null)[]>(() =>
    items.map(() => null),
  );
  const pick = (i: number, option: number) => {
    const next = picked.map((p, k) => (k === i ? option : p));
    setPicked(next);
    if (next.every((p, k) => p === items[k]?.answer)) onPass();
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/20 bg-amber-950/20 p-4">
      <div className="font-semibold text-amber-200 text-xs tracking-wide">
        ✎ 확인해 보기
      </div>
      {items.map((item, i) => {
        const chosen = picked[i];
        return (
          <div key={item.q} className="flex flex-col gap-1.5">
            <p className="font-semibold text-sm">
              {i + 1}. {item.q}
            </p>
            <div className="flex flex-col gap-1">
              {item.options.map((o, k) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => pick(i, k)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-left text-sm",
                    chosen === k
                      ? k === item.answer
                        ? "border-emerald-400 bg-emerald-900/50"
                        : "border-rose-400 bg-rose-900/50"
                      : "border-white/15 bg-white/5 hover:bg-white/10",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
            {chosen !== null && (
              <p
                className={cn(
                  "text-xs",
                  chosen === item.answer ? "text-emerald-200" : "text-rose-200",
                )}
              >
                {chosen === item.answer ? "맞았다. " : "다시 생각해 보자. "}
                {chosen === item.answer ? item.why : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
