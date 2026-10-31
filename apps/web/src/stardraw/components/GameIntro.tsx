"use client";

import { createRng, nextInt } from "@mighty/engine";
import { realClock } from "@mighty/fair-play";
import { useEffect, useState } from "react";

import { constellationOf } from "../celebrate";
import type { HdrGlow } from "../hdr-glow";
import { starOf } from "../sky";
import { MOTION_MS, type SkyMotion } from "../sky-draw";
import { LottoBall } from "./parts";
import { SkyBoard } from "./SkyBoard";

export interface IntroExample {
  numbers: readonly number[];
  bonus: number;
}

/** 정답 예시 하나: 당첨 별 6개(작은 번호부터) + 보너스 1개 */
export function introExample(next: (max: number) => number): IntroExample {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const pick: number[] = [];
  for (let k = 0; k < 7; k++) pick.push(...pool.splice(next(pool.length), 1));
  const bonus = pick.pop() as number;
  return { numbers: pick.sort((a, b) => a - b), bonus };
}

/** 첫 그림(서버 그림과 어긋나지 않게 씨앗 고정, 움직임 줄이기면 이것만 보인다). 그 뒤로는 매번 새로 무작위 */
const FIRST_EXAMPLE = (() => {
  const rng = createRng(1031);
  return introExample((max) => nextInt(rng, max));
})();
const randomExample = () =>
  introExample((max) => Math.floor(Math.random() * max));

/**
 * 한 예시의 흐름(ms). 번호 공 순서(작은 번호부터, 보너스가 마지막)대로 별이 하나씩 켜지고, 당첨 별 6개로 별자리 선을
 * 하나씩 긋고, 같은 순서로 별이 한 번씩 반짝인 뒤 전체가 한 번에 흐려진다. 켜진 별의 빛은 추첨 하늘과 같은 코드로
 * 그린다(SkyState.motion). 하나씩 걷히는 것은 어색했다(사용자)
 */
export const INTRO_TIMING = {
  /** 켜질 때 한 단계 사이 */
  inStep: 300,
  /** 다 생긴 뒤 첫 반짝임까지 */
  beforeTwinkle: 400,
  /** 별 하나 반짝임 사이 */
  twinkleStep: 240,
  /** 마지막 반짝임 뒤 흐려지기까지 */
  afterTwinkle: 800,
  /** 다 꺼진 뒤 다음 예시까지 */
  pause: 500,
} as const;

/** 단계 수: 당첨 별 6개(번호순) → 보너스 → 별자리 선 5개 */
const STEPS = 12;
/** v단계까지 보일 때 번호순 i번째 별, 보너스, k번째 선이 보이는지 */
const starShown = (i: number, v: number) => v >= i + 1;
const bonusShown = (v: number) => v >= 7;
const edgeShown = (k: number, v: number) => v >= 8 + k;

const NO_MOTION: SkyMotion = { lit: {}, sparkle: {}, fadeFrom: null };

/**
 * 첫 화면 정답 예시: 별자리판에서 별 6개와 보너스가 차례로 켜지고 가짜 별자리가 이어지며, 그 번호 공이 함께 떠오른다.
 * 움직임 줄이기면 첫 예시가 다 그려진 채 멈춘다
 */
export function GameIntro() {
  const [example, setExample] = useState<IntroExample>(FIRST_EXAMPLE);
  // 빈 하늘에서 시작해 하나씩 생긴다(움직임 줄이기면 아래에서 바로 다 그린다)
  const [shown, setShown] = useState(0);
  const [motion, setMotion] = useState<SkyMotion | undefined>(NO_MOTION);
  /** 지금 반짝이는 공(번호순, 6이면 보너스, -1이면 없음) */
  const [twinkle, setTwinkle] = useState(-1);
  useEffect(() => {
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMotion(undefined);
      setShown(STEPS);
      return;
    }
    let alive = true;
    let timer = 0;
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        timer = window.setTimeout(r, ms);
      });
    const { inStep, beforeTwinkle, twinkleStep, afterTwinkle, pause } =
      INTRO_TIMING;
    void (async () => {
      for (let first = true; alive; first = false) {
        const ex = first ? FIRST_EXAMPLE : randomExample();
        const order = [...ex.numbers, ex.bonus];
        let m: SkyMotion = NO_MOTION;
        setExample(ex);
        setShown(0);
        setMotion(m);
        await wait(pause);
        for (let v = 1; v <= STEPS && alive; v++) {
          await wait(inStep);
          const n = order[v - 1];
          if (n !== undefined)
            m = { ...m, lit: { ...m.lit, [n]: realClock.now() } };
          setMotion(m);
          setShown(v);
        }
        await wait(beforeTwinkle);
        for (let k = 0; k < order.length && alive; k++) {
          const n = order[k] as number;
          m = { ...m, sparkle: { ...m.sparkle, [n]: realClock.now() } };
          setMotion(m);
          setTwinkle(k);
          await wait(twinkleStep);
        }
        await wait(afterTwinkle);
        setTwinkle(-1);
        m = { ...m, fadeFrom: realClock.now() };
        setMotion(m);
        await wait(MOTION_MS.fade);
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  const { numbers, bonus } = example;
  const b = starOf(bonus);
  const { edges } = constellationOf(numbers);
  const fading = motion?.fadeFrom != null;
  const lit = numbers.filter((_, i) => starShown(i, shown));
  // HDR 화면이면 별이 켜지는 순간 한 번 번쩍인다(추첨 하늘에서 별이 켜질 때와 같다, 보너스는 ✕ 그림)
  const hdr: HdrGlow[] = fading
    ? []
    : [
        ...lit.map((n): HdrGlow => ({ n, kind: "flash" })),
        ...(bonusShown(shown)
          ? [{ n: bonus, kind: "flash", diag: true } as HdrGlow]
          : []),
      ];
  return (
    <section
      aria-label="정답 예시"
      data-intro={`${numbers.join(",")}+${bonus}`}
      className="flex flex-col items-center gap-3"
    >
      <h2 className="text-balance text-center font-bold text-lg">
        45개의 별 중 이번에 빛날 별 6개를 맞혀 보세요
      </h2>
      <SkyBoard
        state={{
          mode: "draw",
          picked: [],
          focus: null,
          lit,
          bonus: bonusShown(shown) ? bonus : null,
          ...(motion ? { motion } : {}),
        }}
        label={`정답 예시 별: ${numbers.map((n) => starOf(n).ko).join(", ")}, 보너스 ${b.ko}`}
        className="w-full"
        hdr={hdr}
        overlay={
          <svg
            data-fading={fading || undefined}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="sd-intro-fade pointer-events-none absolute inset-0 size-full"
          >
            {edges.map(([p0, q0], k) => {
              const p = starOf(p0);
              const q = starOf(q0);
              return (
                <line
                  key={`${numbers.join("-")}-${p0}-${q0}`}
                  x1={p.x * 100}
                  y1={p.y * 100}
                  x2={q.x * 100}
                  y2={q.y * 100}
                  pathLength={1}
                  className="sd-intro-line"
                  style={{ strokeDashoffset: edgeShown(k, shown) ? 0 : 1 }}
                />
              );
            })}
          </svg>
        }
      />
      <div
        data-fading={fading || undefined}
        className="sd-intro-fade flex flex-wrap justify-center gap-1.5"
      >
        {numbers.map((n, i) => (
          <span
            key={`${numbers.join("-")}-${n}`}
            className="sd-intro-ball"
            data-shown={starShown(i, shown) || undefined}
          >
            <span
              className="sd-intro-pop"
              data-twinkle={twinkle === i || undefined}
            >
              <LottoBall n={n} />
            </span>
          </span>
        ))}
        <span
          key={`${numbers.join("-")}-bonus`}
          className="sd-intro-ball"
          data-shown={bonusShown(shown) || undefined}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-white/40">+</span>
            <span
              className="sd-intro-pop"
              data-twinkle={twinkle === 6 || undefined}
            >
              <LottoBall n={bonus} />
            </span>
          </span>
        </span>
      </div>
    </section>
  );
}
