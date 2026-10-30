"use client";

import { type CSSProperties, useId } from "react";

import { Seal } from "../astronaut/marks";
import { type CelebrationPlan, LINE_MS, METEOR_MS } from "../celebrate";
import { starOf } from "../sky";

/**
 * 당첨 축하의 하늘 쪽(SkyBoard `overlay`): 나만의 별자리(별이 하나씩 켜지고 선이 그어진다), 짧은 반짝임, 별똥별.
 * 움직임은 모두 CSS 지연으로 낸다(시각은 `celebrationPlan`). 움직임 줄이기면 별자리가 처음부터 다 보이고 별똥별은 없다.
 */
export function SkyCelebration({ plan }: { plan: CelebrationPlan }) {
  const ms = (v: number): CSSProperties => ({ animationDelay: `${v}ms` });
  const glow = `sd-cel-glow-${useId().replace(/:/g, "")}`;
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
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
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
        {plan.order.map((n, i) => {
          const s = starOf(n);
          return (
            <g key={n} className="sd-cel-star" style={ms(plan.starAt[i] ?? 0)}>
              <circle
                cx={s.x * 100}
                cy={s.y * 100}
                r={2.6}
                fill="#fde68a"
                opacity={0.55}
                filter={`url(#${glow})`}
              />
              <circle cx={s.x * 100} cy={s.y * 100} r={0.9} fill="#fffbea" />
            </g>
          );
        })}
        {/* 별자리가 다 생기면 별마다 빛 고리가 한 번(등수가 높으면 두 번) 퍼진다 */}
        {plan.order.map((n) => {
          const s = starOf(n);
          return (
            <circle
              key={`ring-${n}`}
              cx={s.x * 100}
              cy={s.y * 100}
              r={4}
              className="sd-cel-ring"
              style={{
                ...ms(plan.sparkleAt),
                animationIterationCount: plan.rank <= 3 ? 2 : 1,
              }}
            />
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
