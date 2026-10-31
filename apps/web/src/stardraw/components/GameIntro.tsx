"use client";

import { createRng, nextInt } from "@mighty/engine";
import { useEffect, useState } from "react";

import { constellationOf } from "../celebrate";
import { starOf } from "../sky";
import { LottoBall } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 정답 예시 6개짜리 묶음(늘 같은 순서. 서버 그림과 첫 그림이 어긋나지 않게 씨앗을 고정한다) */
export const INTRO_EXAMPLES: readonly (readonly number[])[] = (() => {
  const rng = createRng(1031);
  return Array.from({ length: 8 }, () => {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    const pick: number[] = [];
    for (let k = 0; k < 6; k++)
      pick.push(...pool.splice(nextInt(rng, pool.length), 1));
    return pick.sort((a, b) => a - b);
  });
})();

/** 예시가 바뀌는 간격 */
export const INTRO_MS = 3600;

/**
 * 처음 온 사람에게 무엇을 하는 곳인지 보인다: 별자리판에서 정답 예시 별 6개에 불이 들어오고 가짜 별자리가 이어진다.
 * 몇 초마다 다른 예시로 바뀌고, 움직임 줄이기면 첫 예시에 멈춘다
 */
export function GameIntro() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % INTRO_EXAMPLES.length),
      INTRO_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const numbers = INTRO_EXAMPLES[index] ?? [];
  const { edges } = constellationOf(numbers);
  return (
    <section
      aria-label="정답 예시"
      data-intro={numbers.join(",")}
      className="flex flex-col items-center gap-3"
    >
      <h2 className="font-bold text-lg">별 6개를 맞혀 보세요</h2>
      <SkyBoard
        state={{
          mode: "draw",
          picked: [],
          focus: null,
          lit: numbers,
          bonus: null,
        }}
        label={`정답 예시 별: ${numbers.map((n) => starOf(n).ko).join(", ")}`}
        className="w-full"
        overlay={
          <svg
            key={index}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
          >
            {edges.map(([a, b], i) => {
              const p = starOf(a);
              const q = starOf(b);
              return (
                <line
                  key={`${a}-${b}`}
                  x1={p.x * 100}
                  y1={p.y * 100}
                  x2={q.x * 100}
                  y2={q.y * 100}
                  pathLength={1}
                  className="sd-cel-line"
                  style={{ animationDelay: `${200 + i * 160}ms` }}
                />
              );
            })}
          </svg>
        }
      />
      <div key={index} className="flex flex-wrap justify-center gap-1.5">
        {numbers.map((n) => (
          <LottoBall key={n} n={n} className="sd-pop" />
        ))}
      </div>
    </section>
  );
}
