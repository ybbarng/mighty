"use client";

import { digitPool, type GuessEntry } from "@mighty/baseball-engine";
import { useEffect } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

import { scoreText } from "../kit";

/** 야구장 볼카운트처럼: 스트라이크 노랑, 볼 초록, 아웃 빨강 */
export const LIGHT = {
  strike: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]",
  ball: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  out: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
} as const;

/** 전광판 숫자 칸 */
export function DigitBox({
  digit,
  size = "md",
  tone = "lit",
}: {
  digit: string | null;
  size?: "sm" | "md" | "lg";
  tone?: "lit" | "dim" | "hit" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-black font-mono tabular-nums",
        size === "sm" && "h-7 w-6 text-base",
        size === "md" && "h-9 w-8 text-xl",
        size === "lg" && "h-14 w-12 text-3xl",
        tone === "lit" && "border-amber-200/30 bg-black text-amber-200",
        tone === "dim" && "border-white/10 bg-black/50 text-white/30",
        tone === "hit" && "border-amber-300 bg-amber-300 text-black",
        tone === "bad" && "border-rose-400 bg-rose-950 text-rose-200",
      )}
    >
      {digit ?? ""}
    </span>
  );
}

/** 수 하나를 전광판 칸으로 */
export function NumberBoxes({
  value,
  digits,
  size,
  tone,
  label,
}: {
  value: string;
  digits: number;
  size?: "sm" | "md" | "lg";
  tone?: "lit" | "dim" | "hit" | "bad";
  label?: string;
}) {
  return (
    <span
      className="inline-flex gap-1"
      role="img"
      aria-label={label ?? (value ? value.split("").join(" ") : "빈 칸")}
    >
      {Array.from({ length: digits }, (_, i) => (
        <DigitBox
          // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 칸이다
          key={i}
          digit={value[i] ?? null}
          {...(size ? { size } : {})}
          tone={tone ?? (value[i] ? "lit" : "dim")}
        />
      ))}
    </span>
  );
}

/** 불빛 자리 이름(네 자리까지) */
const SLOTS = ["a", "b", "c", "d"] as const;

/** 답을 볼카운트 불빛과 글자로 */
export function ScoreLights({
  strikes,
  balls,
  digits,
}: {
  strikes: number;
  balls: number;
  digits: number;
}) {
  const out = strikes === 0 && balls === 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {SLOTS.slice(0, strikes).map((k) => (
          <span
            key={`s${k}`}
            className={cn("size-2.5 rounded-full", LIGHT.strike)}
          />
        ))}
        {SLOTS.slice(0, balls).map((k) => (
          <span
            key={`b${k}`}
            className={cn("size-2.5 rounded-full", LIGHT.ball)}
          />
        ))}
        {out && <span className={cn("size-2.5 rounded-full", LIGHT.out)} />}
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-bold text-sm",
          strikes === digits
            ? "text-amber-300"
            : out
              ? "text-rose-300"
              : "text-white/90",
        )}
      >
        {strikes === digits ? `${strikes}S` : scoreText(strikes, balls, digits)}
      </span>
    </span>
  );
}

/** 물어본 수 기록 한 줄씩. 답을 기다리는 줄은 "답 기다리는 중" */
export function GuessLog({
  title,
  entries,
  digits,
  wrongAt,
  empty,
  seat,
}: {
  title: string;
  /** [guesses 번호, 그 줄] */
  entries: [number, GuessEntry][];
  digits: number;
  /** 공개에서 거짓으로 드러난 답(guesses 번호) */
  wrongAt: number | null;
  empty: string;
  seat: number;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-white/10 bg-black/30 p-2">
      <h2 className="px-1 font-semibold text-white/70 text-xs">{title}</h2>
      {entries.length === 0 ? (
        <p className="px-1 py-2 text-white/40 text-xs">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entries.map(([index, g], k) => (
            <li
              key={index}
              data-guess={g.guess}
              data-seat={seat}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-0.5",
                wrongAt === index && "bg-rose-900/60 ring-1 ring-rose-400",
              )}
            >
              <span className="w-4 text-right text-white/40 text-xs tabular-nums">
                {k + 1}
              </span>
              <NumberBoxes
                value={g.guess}
                digits={digits}
                size="sm"
                tone={g.strikes === digits ? "hit" : "lit"}
              />
              {g.strikes === null || g.balls === null ? (
                <span className="text-white/50 text-xs">답 기다리는 중…</span>
              ) : (
                <ScoreLights
                  strikes={g.strikes}
                  balls={g.balls}
                  digits={digits}
                />
              )}
              {wrongAt === index && (
                <span className="ml-auto text-rose-200 text-xs">거짓 답</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 숫자 패드: 겹치지 않는 숫자를 차례로 넣는다. 키보드 숫자·Backspace·Enter도 된다.
 * 이미 넣은 숫자와 쓸 수 없는 0은 누를 수 없다
 */
export function NumberPad({
  value,
  onChange,
  onSubmit,
  digits,
  zero,
  submitLabel,
  disabled,
  extra,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  digits: number;
  zero: boolean;
  submitLabel: string;
  disabled: boolean;
  /** 지우기 옆에 둘 단추(무작위 등) */
  extra?: React.ReactNode;
}) {
  const pool = digitPool({ zero });
  const full = value.length === digits;
  const press = (d: string) => {
    if (disabled || value.includes(d) || full || !pool.includes(d)) return;
    playUiCue("click");
    onChange(value + d);
  };
  const erase = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
      else if (e.key === "Enter" && full && !disabled) onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key = (d: string) => (
    <button
      key={d}
      type="button"
      disabled={disabled || value.includes(d) || full || !pool.includes(d)}
      onClick={() => press(d)}
      className="h-11 rounded-xl border border-white/10 bg-white/10 font-bold font-mono text-xl hover:bg-white/20 disabled:opacity-25 short-landscape:h-9"
    >
      {d}
    </button>
  );
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <NumberBoxes
        value={value}
        digits={digits}
        size="lg"
        label={`넣은 수 ${value || "없음"}`}
      />
      <div className="grid w-full max-w-xs grid-cols-5 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(key)}
      </div>
      <div className="flex w-full max-w-xs gap-1.5">
        <button
          type="button"
          onClick={erase}
          disabled={disabled || value.length === 0}
          className="flex-1 rounded-xl bg-white/10 py-2 text-sm disabled:opacity-40"
        >
          지우기
        </button>
        {extra}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !full}
          className="flex-[2] rounded-xl bg-amber-300 py-2 font-semibold text-black disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
