"use client";

import { type CSSProperties, useId } from "react";

import { Seal } from "../astronaut/marks";
import { type CelebrationPlan, LINE_MS, METEOR_MS } from "../celebrate";
import { starLight, starOf } from "../sky";

/**
 * 당첨 축하의 하늘 쪽(SkyBoard `overlay`): 나만의 별자리(별이 하나씩 켜지고 선이 그어진다), 빛줄기 반짝임, 별똥별.
 * 움직임은 모두 CSS 지연으로 낸다(시각은 `celebrationPlan`). 움직임 줄이기면 별자리가 처음부터 다 보이고 별똥별은 없다.
 */
export function SkyCelebration({
  plan,
  bonus = null,
}: {
  plan: CelebrationPlan;
  /** 보너스 번호: 별자리에 들어가면 빛줄기를 대각선(✕)으로(하늘과 같은 표시) */
  bonus?: number | null;
}) {
  const ms = (v: number): CSSProperties => ({ animationDelay: `${v}ms` });
  const id = useId().replace(/:/g, "");
  const glow = `sd-cel-glow-${id}`;
  const ray = `sd-cel-ray-${id}`;
  return (
    <div
      aria-hidden="true"
      data-celebration={plan.rank}
      data-constellation={plan.order.join(",")}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <filter id={glow} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
          {/* 빛줄기: 가운데 흰색 → 그 별의 진한 별빛 색 → 투명(가는 마름모에 채워 끝으로 갈수록 가늘고 흐리다) */}
          {plan.order.map((n) => (
            <radialGradient key={n} id={`${ray}-${n}`}>
              <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="0.3" stopColor={starLight(n)} stopOpacity="0.6" />
              <stop offset="1" stopColor={starLight(n)} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {plan.edges.map(([a, b], i) => {
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
              style={{
                ...ms(plan.lineAt[i] ?? 0),
                animationDuration: `${LINE_MS}ms`,
              }}
            />
          );
        })}
        {/* 별: 작고 또렷한 점 + 흐린 빛 번짐 + 가는 십자 빛줄기(하늘의 별과 같은 결) */}
        {plan.order.map((n, i) => {
          const s = starOf(n);
          const x = s.x * 100;
          const y = s.y * 100;
          return (
            <g key={n} className="sd-cel-star" style={ms(plan.starAt[i] ?? 0)}>
              <circle
                cx={x}
                cy={y}
                r={1.5}
                fill={starLight(n)}
                opacity={0.5}
                filter={`url(#${glow})`}
              />
              <Rays
                x={x}
                y={y}
                len={2.8}
                fill={`url(#${ray}-${n})`}
                diag={n === bonus}
              />
              <circle cx={x} cy={y} r={0.42} fill="#fffbea" />
            </g>
          );
        })}
        {/* 별자리가 다 생기면 별마다 빛줄기가 한 번(등수가 높으면 두 번) 길게 뻗었다 사라진다 */}
        {plan.order.map((n) => {
          const s = starOf(n);
          return (
            <g
              key={`flare-${n}`}
              className="sd-cel-ring"
              style={{
                ...ms(plan.sparkleAt),
                animationIterationCount: plan.rank <= 3 ? 2 : 1,
              }}
            >
              <Rays
                x={s.x * 100}
                y={s.y * 100}
                len={6}
                fill={`url(#${ray}-${n})`}
                diag={s.n === bonus}
              />
            </g>
          );
        })}
      </svg>
      {plan.meteors.map((m, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 별똥별은 차례로만 가른다
          key={i}
          className="sd-cel-meteor"
          style={
            {
              left: `${m.x}%`,
              top: `${m.y}%`,
              width: `${m.length}%`,
              "--sd-angle": `${m.angle}deg`,
              animationDelay: `${m.at}ms`,
              animationDuration: `${METEOR_MS}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 가는 십자 빛줄기(가로 len, 세로는 1.15배). 가늘고 긴 마름모 둘에 방사 그라디언트를 채운다 */
function Rays({
  x,
  y,
  len,
  fill,
  diag = false,
}: {
  x: number;
  y: number;
  len: number;
  fill: string;
  /** 대각선(✕): 보너스 별 */
  diag?: boolean;
}) {
  const w = len * 0.06;
  const v = len * 1.15;
  if (diag)
    return (
      <g transform={`rotate(45 ${x} ${y})`}>
        <polygon
          points={`${x - len},${y} ${x},${y - w} ${x + len},${y} ${x},${y + w}`}
          fill={fill}
        />
        <polygon
          points={`${x},${y - len} ${x + w},${y} ${x},${y + len} ${x - w},${y}`}
          fill={fill}
        />
      </g>
    );
  return (
    <>
      <polygon
        points={`${x - len},${y} ${x},${y - w} ${x + len},${y} ${x},${y + w}`}
        fill={fill}
      />
      <polygon
        points={`${x},${y - v} ${x + w},${y} ${x},${y + v} ${x - w},${y}`}
        fill={fill}
      />
    </>
  );
}

/** 당첨 직인: 등록증 직인과 같은 붉은 인장에 "당첨". 마지막에 위에서 내려와 찍힌다 */
export function WinSeal({ at }: { at: number }) {
  return (
    <span
      className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 sm:right-4"
      data-win-seal
    >
      <span
        className="sd-cel-stamp block"
        style={{ animationDelay: `${at}ms` }}
      >
        <Seal
          text="당첨"
          label="카노푸스 우주국 당첨 직인"
          className="size-16 sm:size-20"
        />
      </span>
    </span>
  );
}
