"use client";

import { createRng, nextInt } from "@mighty/engine";
import { useEffect, useState } from "react";

import { constellationOf } from "../celebrate";
import { ballColor, starOf } from "../sky";
import { LottoBall } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 정답 예시: 당첨 별 6개 + 보너스 1개(늘 같은 순서. 서버 그림과 첫 그림이 어긋나지 않게 씨앗을 고정한다) */
export const INTRO_EXAMPLES: readonly {
  numbers: readonly number[];
  bonus: number;
}[] = (() => {
  const rng = createRng(1031);
  return Array.from({ length: 8 }, () => {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    const pick: number[] = [];
    for (let k = 0; k < 7; k++)
      pick.push(...pool.splice(nextInt(rng, pool.length), 1));
    const bonus = pick.pop() as number;
    return { numbers: pick.sort((a, b) => a - b), bonus };
  });
})();

/**
 * 한 예시의 흐름(ms). 별 하나 → 그 별로 이어지는 선 → 다음 별 …으로 별자리가 생기고(하나하나 CSS 전환으로 서서히),
 * 다 보이면 생긴 차례대로(보너스는 마지막) 별이 한 번씩 반짝이고 그 공도 살짝 커졌다 돌아온 뒤,
 * 전체가 한 번에 서서히 흐려지고, 쉬었다가 다음 예시로(하나씩 걷히는 것은 어색했다, 사용자)
 */
export const INTRO_TIMING = {
  /** 켜질 때 한 단계 사이 */
  inStep: 300,
  /** 다 생긴 뒤 첫 반짝임까지 */
  beforeTwinkle: 400,
  /** 별 하나 반짝임 사이(반짝임 하나는 CSS .sd-intro-twinkle 0.65초) */
  twinkleStep: 240,
  /** 마지막 반짝임 뒤 흐려지기까지 */
  afterTwinkle: 800,
  /** 전체가 흐려지는 시간(CSS .sd-intro-fade 전환과 같게) */
  fade: 700,
  /** 다 꺼진 뒤 다음 예시까지 */
  pause: 500,
} as const;

/** 단계 수: 첫 별, 별 다섯 개마다 별 하나 + 선 하나, 마지막에 보너스 별(별자리 선 없이 따로) */
const STEPS = 12;
const bonusShown = (v: number) => v >= STEPS;

/** v단계까지 보일 때 k번째(생기는 차례) 별·선이 보이는지 */
const starShown = (k: number, v: number) => (k === 0 ? v >= 1 : v >= 2 * k);
const edgeShown = (k: number, v: number) => v >= 2 * k + 3;

/**
 * 처음 온 사람에게 무엇을 하는 곳인지 보인다: 별자리판에서 정답 예시 별 6개에 차례로 불이 들어오며
 * 가짜 별자리가 이어지고, 그 6개 번호 공이 함께 떠오른다. 움직임 줄이기면 첫 예시가 다 그려진 채 멈춘다
 */
export function GameIntro() {
  const [index, setIndex] = useState(0);
  /** 지금 보이는 단계 수(0~STEPS) */
  const [shown, setShown] = useState(STEPS);
  /** 전체가 흐려지는 중 */
  const [fading, setFading] = useState(false);
  /** 지금 반짝이는 별(생기는 차례, 6이면 보너스, -1이면 없음) */
  const [twinkle, setTwinkle] = useState(-1);
  useEffect(() => {
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let alive = true;
    let timer = 0;
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        timer = window.setTimeout(r, ms);
      });
    const { inStep, beforeTwinkle, twinkleStep, afterTwinkle, fade, pause } =
      INTRO_TIMING;
    void (async () => {
      // 첫 예시는 다 그려진 채로 보이므로(첫 그림) 머문 뒤 걷히는 것부터
      let first = true;
      for (let i = 0; alive; i = (i + 1) % INTRO_EXAMPLES.length) {
        setIndex(i);
        if (!first) {
          setShown(0);
          setFading(false);
          await wait(pause);
          for (let v = 1; v <= STEPS && alive; v++) {
            await wait(inStep);
            setShown(v);
          }
        }
        first = false;
        await wait(beforeTwinkle);
        for (let k = 0; k <= 6 && alive; k++) {
          setTwinkle(k);
          await wait(twinkleStep);
        }
        await wait(afterTwinkle);
        setTwinkle(-1);
        setFading(true);
        await wait(fade);
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  const example = INTRO_EXAMPLES[index];
  const numbers = example?.numbers ?? [];
  const bonus = example?.bonus ?? 0;
  const b = starOf(bonus || 1);
  const { order, edges } = constellationOf(numbers);
  const at = (n: number) => order.indexOf(n);
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
          lit: [],
          bonus: null,
        }}
        label={`정답 예시 별: ${numbers.map((n) => starOf(n).ko).join(", ")}, 보너스 ${b.ko}`}
        className="w-full"
        overlay={
          <svg
            data-fading={fading || undefined}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="sd-intro-fade pointer-events-none absolute inset-0 size-full"
          >
            <defs>
              {order.map((n) => (
                <radialGradient key={n} id={`sd-intro-glow-${n}`}>
                  <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
                  <stop
                    offset="0.25"
                    stopColor={ballColor(n)}
                    stopOpacity="0.75"
                  />
                  <stop offset="1" stopColor={ballColor(n)} stopOpacity="0" />
                </radialGradient>
              ))}
              {[...order, bonus].map((n) => (
                <radialGradient key={`ray-${n}`} id={`sd-intro-ray-${n}`}>
                  <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
                  <stop
                    offset="0.3"
                    stopColor={ballColor(n)}
                    stopOpacity="0.65"
                  />
                  <stop offset="1" stopColor={ballColor(n)} stopOpacity="0" />
                </radialGradient>
              ))}
              <radialGradient id={`sd-intro-glow-${bonus}`}>
                <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
                <stop
                  offset="0.25"
                  stopColor={ballColor(bonus)}
                  stopOpacity="0.75"
                />
                <stop offset="1" stopColor={ballColor(bonus)} stopOpacity="0" />
              </radialGradient>
            </defs>
            {edges.map(([a, b], k) => {
              const p = starOf(a);
              const q = starOf(b);
              return (
                <line
                  key={`${index}-${a}-${b}`}
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
            {order.map((n, k) => {
              const s = starOf(n);
              return (
                <g
                  key={`${index}-${n}`}
                  className="sd-intro-star"
                  style={{ opacity: starShown(k, shown) ? 1 : 0 }}
                >
                  <circle
                    cx={s.x * 100}
                    cy={s.y * 100}
                    r={3.2}
                    fill={`url(#sd-intro-glow-${n})`}
                  />
                  <Rays x={s.x * 100} y={s.y * 100} n={n} len={3.4} />
                  <circle
                    cx={s.x * 100}
                    cy={s.y * 100}
                    r={0.45}
                    fill="#fffbea"
                  />
                  {twinkle === k && (
                    <Twinkle x={s.x * 100} y={s.y * 100} n={n} />
                  )}
                </g>
              );
            })}
            {/* 보너스: 별자리에 잇지 않고 따로, 빛줄기는 대각선(✕). 결과 화면과 같은 표시 */}
            <g
              key={`${index}-bonus-${bonus}`}
              className="sd-intro-star"
              style={{ opacity: bonusShown(shown) ? 1 : 0 }}
            >
              <circle
                cx={b.x * 100}
                cy={b.y * 100}
                r={3.2}
                fill={`url(#sd-intro-glow-${bonus})`}
              />
              <Rays x={b.x * 100} y={b.y * 100} n={bonus} len={3.4} diag />
              <circle cx={b.x * 100} cy={b.y * 100} r={0.45} fill="#fffbea" />
              {twinkle === 6 && (
                <Twinkle x={b.x * 100} y={b.y * 100} n={bonus} diag />
              )}
            </g>
          </svg>
        }
      />
      <div
        data-fading={fading || undefined}
        className="sd-intro-fade flex flex-wrap justify-center gap-1.5"
      >
        {numbers.map((n) => (
          <span
            key={`${index}-${n}`}
            className="sd-intro-ball"
            data-shown={starShown(at(n), shown) || undefined}
          >
            <span
              className="sd-intro-pop"
              data-twinkle={twinkle === at(n) || undefined}
            >
              <LottoBall n={n} />
            </span>
          </span>
        ))}
        <span
          key={`${index}-bonus`}
          className="sd-intro-ball"
          data-shown={bonusShown(shown) || undefined}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-white/40">+</span>
            <span
              className="sd-intro-pop"
              data-twinkle={twinkle === 6 || undefined}
            >
              <LottoBall n={bonus || 1} />
            </span>
          </span>
        </span>
      </div>
    </section>
  );
}

/** 별 하나가 한 번 반짝인다: 빛 번짐과 빛줄기(당첨 별 ＋, 보너스 ✕)가 잠깐 커졌다 사라진다 */
function Twinkle({
  x,
  y,
  n,
  diag = false,
}: {
  x: number;
  y: number;
  n: number;
  diag?: boolean;
}) {
  return (
    <g className="sd-intro-twinkle">
      <circle cx={x} cy={y} r={5} fill={`url(#sd-intro-glow-${n})`} />
      <Rays x={x} y={y} n={n} len={7} diag={diag} />
      <circle cx={x} cy={y} r={0.8} fill="#ffffff" />
    </g>
  );
}

/**
 * 가는 십자 빛줄기(세로가 조금 길다, 하늘 그림·축하 별자리와 같은 결): 가늘고 긴 마름모 둘에
 * 가운데 흰빛 → 별빛 색 → 투명 그라디언트를 채워 끝으로 갈수록 가늘고 흐리다. 보너스는 대각선(✕)
 */
function Rays({
  x,
  y,
  n,
  len,
  diag = false,
}: {
  x: number;
  y: number;
  n: number;
  len: number;
  diag?: boolean;
}) {
  const w = len * 0.07;
  const v = diag ? len : len * 1.15;
  return (
    <g
      transform={diag ? `rotate(45 ${x} ${y})` : undefined}
      fill={`url(#sd-intro-ray-${n})`}
    >
      <polygon
        points={`${x - len},${y} ${x},${y - w} ${x + len},${y} ${x},${y + w}`}
      />
      <polygon
        points={`${x},${y - v} ${x + w},${y} ${x},${y + v} ${x - w},${y}`}
      />
    </g>
  );
}
