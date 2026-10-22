"use client";

import { type ReactNode, useState } from "react";

import { cn } from "@/lib/cn";

/*
 * 내 기록 화면의 조각. 어두운 화면 하나만 쓴다(앱 전체가 어둡다).
 * 색은 한 가지 뜻만 진다: 파랑 = 이긴 비율·크기(한 색의 밝기 차이), 회색 = 바탕·진 것.
 * 글자는 늘 흰 글자 단계로 쓰고, 색은 막대·점 같은 표시에만 쓴다.
 */

const ACCENT = "#3987e5";
/** 막대 바탕(0%도 비어 보이게 중립 회색) */
const TRACK = "rgba(255,255,255,0.12)";
const MUTED = "#55534e";

export function pct(won: number, n: number): string {
  return n === 0 ? "—" : `${Math.round((won / n) * 100)}%`;
}

/** 숫자 하나: 이름, 값, 덧붙임 */
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-white/[0.06] px-4 py-3">
      <div className="truncate text-white/60 text-xs">{label}</div>
      <div className="font-semibold text-2xl text-white">{value}</div>
      {sub && <div className="truncate text-white/55 text-xs">{sub}</div>}
    </div>
  );
}

/** 이긴 비율 막대(같은 파랑의 어두운 바탕 위에 채운다) */
export function RateBar({
  label,
  won,
  n,
}: {
  label: ReactNode;
  won: number;
  n: number;
}) {
  const ratio = n === 0 ? 0 : won / n;
  return (
    <div className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
      <div className="truncate text-white/85">{label}</div>
      <div
        className="h-2.5 overflow-hidden rounded-full"
        style={{ background: n === 0 ? MUTED : TRACK }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${ratio * 100}%`, background: ACCENT }}
        />
      </div>
      <div className="text-right text-white/70 tabular-nums">
        <b className="text-white">{pct(won, n)}</b>{" "}
        <span className="text-xs">
          {won}/{n}
        </span>
      </div>
    </div>
  );
}

/** 세로 막대 여럿(항목마다 이긴 비율). 막대에 손을 대면 값이 뜬다 */
export function RateColumns({
  items,
}: {
  items: { label: string; won: number; n: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 96;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-end gap-1.5" style={{ height: H }}>
        {items.map((item, i) => {
          const ratio = item.n === 0 ? 0 : item.won / item.n;
          return (
            <button
              type="button"
              key={item.label}
              aria-label={`${item.label}: ${pct(item.won, item.n)} (${item.won}/${item.n})`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className="block w-full max-w-6 rounded-t"
                style={{
                  height: Math.max(2, ratio * (H - 18)),
                  background: ACCENT,
                  opacity: hover === null || hover === i ? 1 : 0.55,
                }}
              />
              <span
                className="absolute text-[11px] text-white/80 tabular-nums"
                style={{ bottom: Math.max(2, ratio * (H - 18)) + 2 }}
              >
                {item.n > 0 ? pct(item.won, item.n) : ""}
              </span>
              {hover === i && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg bg-black/90 px-2 py-1 text-xs"
                >
                  <b>{pct(item.won, item.n)}</b>{" "}
                  <span className="text-white/60">
                    {item.label} · {item.won}/{item.n}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex-1 text-center text-[11px] text-white/70"
          >
            {item.label}
            <div className="text-[10px] text-white/45">{item.n}판</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 최근 판 결과 줄: 이긴 판은 파랑 "승", 진 판은 회색 "패" */
export function ResultStrip({
  results,
  title,
}: {
  results: { won: boolean; title?: string }[];
  title: string;
}) {
  return (
    <ol className="flex flex-wrap gap-1" aria-label={title}>
      {results.map((r, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: 판 순서가 곧 정체다
          key={i}
          title={r.title}
          className="flex size-6 items-center justify-center rounded font-semibold text-[11px]"
          style={{
            background: r.won ? ACCENT : MUTED,
            color: "#fff",
          }}
        >
          {r.won ? "승" : "패"}
        </li>
      ))}
    </ol>
  );
}

/** 쌓인 값의 흐름(선 하나). 손을 대면 그 판의 값이 뜬다 */
export function TrendLine({
  values,
  unit,
  label,
}: {
  values: number[];
  unit: string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2)
    return (
      <p className="text-sm text-white/50">판이 더 쌓이면 흐름을 그립니다.</p>
    );
  const W = 320;
  const H = 120;
  const pad = 6;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");
  const last = values.length - 1;
  const shown = hover ?? last;
  const value = values[shown] ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-white/70">
        {hover === null ? "지금" : `${hover + 1}번째 판`}{" "}
        <b className="text-white tabular-nums">
          {value > 0 ? "+" : ""}
          {value.toLocaleString()}
          {unit}
        </b>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${label}: 처음 ${values[0]}${unit}, 지금 ${values[last]}${unit}`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(last, Math.round(ratio * last))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1={pad}
          x2={W - pad}
          y1={y(0)}
          y2={y(0)}
          stroke="#ffffff"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
        <path
          d={path}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad}
            y2={H - pad}
            stroke="#ffffff"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        )}
        <circle
          cx={x(shown)}
          cy={y(value)}
          r={4}
          fill={ACCENT}
          stroke="#111"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/35 p-4",
        className,
      )}
    >
      <h2 className="font-bold text-white/90">{title}</h2>
      {children}
    </section>
  );
}

/** 명장면 횟수(작은 칸 여럿) */
export function Moments({
  items,
}: {
  items: { icon: string; label: string; count: number }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((m) => (
        <div
          key={m.label}
          className={cn(
            "flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2",
            m.count === 0 && "opacity-45",
          )}
        >
          <span aria-hidden className="text-lg">
            {m.icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-white/80">
            {m.label}
          </span>
          <b className="text-white tabular-nums">{m.count}</b>
        </div>
      ))}
    </div>
  );
}
