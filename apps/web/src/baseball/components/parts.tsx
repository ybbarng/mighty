"use client";

import { digitPool, type GuessEntry } from "@mighty/baseball-engine";
import { useEffect, useRef, useState } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

import { scoreText } from "../kit";

/** 야구장 볼카운트처럼: 스트라이크 노랑, 볼 초록, 아웃 빨강 */
export const LIGHT = {
  strike: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]",
  ball: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  out: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
} as const;

/** 꺼진 램프: 같은 색을 아주 흐리게 */
const LIGHT_OFF = {
  strike: "bg-amber-300/15",
  ball: "bg-emerald-400/15",
  out: "bg-rose-500/15",
} as const;

/**
 * 전광판 도트 글꼴(가로 5 × 세로 7). 글꼴 파일 없이 점을 그린다.
 * 줄마다 다섯 글자, 1이 켜진 점이다
 */
const DOT_FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

const DOTS = Array.from({ length: 35 }, (_, i) => ({
  x: i % 5,
  y: Math.floor(i / 5),
}));

/** 숫자 하나를 전광판 점으로. 숫자가 없으면 꺼진 점만 */
export function DotDigit({
  digit,
  className,
}: {
  digit: string | null;
  className?: string;
}) {
  const rows = digit ? DOT_FONT[digit] : undefined;
  return (
    <svg viewBox="0 0 5 7" aria-hidden="true" className={className}>
      {DOTS.map(({ x, y }) => {
        const lit = rows?.[y]?.[x] === "1";
        return (
          <circle
            key={`${x}${y}`}
            cx={x + 0.5}
            cy={y + 0.5}
            r={0.4}
            fill="currentColor"
            opacity={lit ? 1 : 0.13}
          />
        );
      })}
    </svg>
  );
}

type Tone = "lit" | "dim" | "hit" | "bad";
type Size = "sm" | "md" | "lg";

/** 전광판 숫자 칸 */
export function DigitBox({
  digit,
  size = "md",
  tone = "lit",
  active = false,
}: {
  digit: string | null;
  size?: Size;
  tone?: Tone;
  /** 다음에 넣을 칸(깜빡이는 테두리) */
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border",
        size === "sm" && "h-7 w-[1.375rem]",
        size === "md" && "h-9 w-7",
        size === "lg" && "h-14 w-11",
        tone === "lit" && "border-amber-200/25 bg-black text-amber-300",
        tone === "dim" && "border-white/10 bg-black/60 text-amber-200/70",
        tone === "hit" && "border-amber-300 bg-amber-300 text-amber-950",
        tone === "bad" && "border-rose-400 bg-rose-950 text-rose-300",
        active && "border-amber-300 ring-1 ring-amber-300/70",
      )}
    >
      <DotDigit
        digit={digit}
        className={cn(
          size === "sm" && "h-[1.1rem]",
          size === "md" && "h-6",
          size === "lg" && "h-9",
        )}
      />
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
  cursor = false,
}: {
  value: string;
  digits: number;
  size?: Size;
  tone?: Tone;
  label?: string;
  /** 다음에 넣을 칸을 표시한다(숫자 패드) */
  cursor?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 gap-1"
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
          active={cursor && i === value.length}
        />
      ))}
    </span>
  );
}

/** 램프 하나 */
export function Lamp({
  kind,
  on,
  className,
}: {
  kind: keyof typeof LIGHT;
  on: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        on ? LIGHT[kind] : LIGHT_OFF[kind],
        className,
      )}
    />
  );
}

/** 불빛 자리 이름(네 자리까지) */
const SLOTS = ["a", "b", "c", "d"] as const;

/**
 * 전광판 볼카운트: S·B는 자릿수만큼 램프, O는 하나. 답이 없으면 모두 꺼진다.
 * 실제 전광판처럼 S(노랑)·B(초록)·O(빨강) 세 줄
 */
export function CountLamps({
  strikes,
  balls,
  digits,
  className,
}: {
  strikes: number | null;
  balls: number | null;
  digits: number;
  className?: string;
}) {
  const answered = strikes !== null && balls !== null;
  const out = answered && strikes === 0 && balls === 0;
  const row = (
    letter: string,
    kind: keyof typeof LIGHT,
    count: number,
    lit: number,
  ) => (
    <span className="flex items-center gap-1">
      <span className="w-3 font-black font-sans text-[11px] text-white/60">
        {letter}
      </span>
      {SLOTS.slice(0, count).map((k, i) => (
        <Lamp
          key={k}
          kind={kind}
          on={i < lit}
          className="size-3 short-landscape:size-2.5"
        />
      ))}
    </span>
  );
  return (
    <span
      data-count={answered ? `${strikes}-${balls}` : "none"}
      aria-hidden="true"
      className={cn("flex flex-col gap-1 short-landscape:gap-0.5", className)}
    >
      {row("S", "strike", digits, strikes ?? 0)}
      {row("B", "ball", digits, balls ?? 0)}
      {row("O", "out", 1, out ? 1 : 0)}
    </span>
  );
}

/** 기록 줄의 답: 켜진 램프와 글자. 좁은 상자에서는 램프를 빼고 글자만 */
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
  const homerun = strikes === digits;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className="hidden shrink-0 gap-0.5 @[16rem]:inline-flex"
        aria-hidden="true"
      >
        {SLOTS.slice(0, strikes).map((k) => (
          <Lamp key={`s${k}`} kind="strike" on className="size-2.5" />
        ))}
        {SLOTS.slice(0, balls).map((k) => (
          <Lamp key={`b${k}`} kind="ball" on className="size-2.5" />
        ))}
        {out && <Lamp kind="out" on className="size-2.5" />}
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-bold text-sm",
          homerun ? "text-amber-300" : out ? "text-rose-300" : "text-white/90",
        )}
      >
        {homerun ? `${strikes}S 홈런` : scoreText(strikes, balls, digits)}
      </span>
    </span>
  );
}

/**
 * 물어본 수 기록. 전광판 한 팀처럼 회마다 한 줄. 마지막 줄을 밝게 보이고,
 * 새 줄이 생기면 그 줄이 보이게 기록 상자 안에서 내린다.
 * 답을 기다리는 줄은 "답 기다리는 중"
 */
export function GuessLog({
  title,
  entries,
  digits,
  wrongAt,
  empty,
  seat,
  side,
  badge,
  batting = false,
  className,
}: {
  title: string;
  /** [guesses 번호, 그 줄] */
  entries: [number, GuessEntry][];
  digits: number;
  /** 공개에서 거짓으로 드러난 답(guesses 번호) */
  wrongAt: number | null;
  empty: string;
  seat: number;
  /** 내 기록인가 상대 기록인가(시험·탭이 찾는 표시) */
  side?: "mine" | "theirs";
  /** 제목 옆 작은 표(원정·홈) */
  badge?: string | undefined;
  /** 지금 이 쪽이 묻는 차례 */
  batting?: boolean;
  className?: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  const count = entries.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 줄 수가 바뀔 때만 내린다
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <section
      data-log={side}
      className={cn(
        "@container flex min-w-0 flex-1 flex-col gap-1 rounded-xl border bg-black/45 p-2",
        batting ? "border-amber-300/50" : "border-white/10",
        className,
      )}
    >
      <h2 className="flex items-center gap-1.5 px-1 font-semibold text-white/80 text-xs">
        {badge && (
          <span className="rounded bg-white/10 px-1 font-normal text-[10px] text-white/60">
            {badge}
          </span>
        )}
        <span className="truncate">{title}</span>
        {batting && (
          <span className="ml-auto shrink-0 text-[10px] text-amber-300">
            ● 공격 중
          </span>
        )}
      </h2>
      {entries.length === 0 ? (
        <p className="px-1 py-2 text-white/40 text-xs">{empty}</p>
      ) : (
        <ol
          ref={list}
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto"
        >
          {entries.map(([index, g], k) => {
            const last = k === entries.length - 1;
            return (
              <li
                key={index}
                data-guess={g.guess}
                data-seat={seat}
                data-last={last || undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-1 py-0.5",
                  last ? "fresh-row bg-white/10" : "opacity-80",
                  wrongAt === index && "bg-rose-900/60 ring-1 ring-rose-400",
                )}
              >
                <span className="w-8 shrink-0 whitespace-nowrap text-right font-mono text-[10px] text-white/45 tabular-nums">
                  {k + 1}회
                </span>
                <NumberBoxes
                  value={g.guess}
                  digits={digits}
                  size="sm"
                  tone={g.strikes === digits ? "hit" : "lit"}
                />
                {g.strikes === null || g.balls === null ? (
                  <span className="truncate text-white/50 text-xs">
                    답 기다리는 중…
                  </span>
                ) : (
                  <ScoreLights
                    strikes={g.strikes}
                    balls={g.balls}
                    digits={digits}
                  />
                )}
                {wrongAt === index && (
                  <span className="ml-auto shrink-0 text-rose-200 text-xs">
                    거짓 답
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** 숫자 메모: 없다고 지운 숫자, 있다고 표시한 숫자. 화면에만 있고 대국·기록에 들어가지 않는다 */
export type DigitMemo = Partial<Record<string, "no" | "yes">>;

/** 메모 차례: 없음 → 있음 → 표시 없음 */
export function nextMemo(memo: DigitMemo, d: string): DigitMemo {
  const now = memo[d];
  const next: DigitMemo = { ...memo };
  if (now === undefined) next[d] = "no";
  else if (now === "no") next[d] = "yes";
  else delete next[d];
  return next;
}

/**
 * 숫자 패드(전화기처럼 3×4): 겹치지 않는 숫자를 차례로 넣는다. 키보드 숫자·Backspace·Enter도 된다.
 * 이미 넣은 숫자와 쓸 수 없는 0은 흐리게 막는다. 메모가 있으면 숫자 위에 표시하고,
 * 메모 모드에서는 숫자를 누르면 넣지 않고 메모를 바꾼다
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
  memo,
  onMemo,
  submitDisabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  digits: number;
  zero: boolean;
  submitLabel: string;
  disabled: boolean;
  /** 숫자는 넣을 수 있지만 아직 낼 수 없다(상대 차례에 미리 넣어 두기) */
  submitDisabled?: boolean;
  /** 제출 단추 옆에 둘 단추(무작위 등) */
  extra?: React.ReactNode;
  /** 숫자 메모. onMemo가 있으면 메모 단추가 생긴다 */
  memo?: DigitMemo;
  onMemo?: (memo: DigitMemo) => void;
}) {
  const pool = digitPool({ zero });
  const full = value.length === digits;
  const [memoMode, setMemoMode] = useState(false);
  const blocked = (d: string) =>
    disabled || value.includes(d) || full || !pool.includes(d);
  const press = (d: string) => {
    if (memoMode && onMemo && memo) {
      if (!pool.includes(d)) return;
      playUiCue("beep");
      onMemo(nextMemo(memo, d));
      return;
    }
    if (blocked(d)) return;
    playUiCue("click");
    onChange(value + d);
  };
  const erase = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };
  const clear = () => {
    if (disabled || value.length === 0) return;
    onChange("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        if (!blocked(e.key)) {
          playUiCue("click");
          onChange(value + e.key);
        }
      } else if (e.key === "Backspace") erase();
      else if (e.key === "Escape") clear();
      else if (e.key === "Enter" && full && !disabled && !submitDisabled) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const inMemo = memoMode && onMemo !== undefined;
  const key = (d: string) => {
    const mark = memo?.[d];
    const off = inMemo ? !pool.includes(d) : blocked(d);
    return (
      <button
        key={d}
        type="button"
        disabled={off}
        onClick={() => press(d)}
        className={cn(
          "relative flex h-12 items-center justify-center rounded-xl border font-black font-mono text-2xl shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)] transition active:translate-y-px active:shadow-none disabled:opacity-20 disabled:shadow-none short-landscape:h-9 short-landscape:text-xl",
          inMemo
            ? "border-sky-300/40 bg-sky-950/60 hover:bg-sky-900/60"
            : "border-white/15 bg-white/15 hover:bg-white/25",
          mark === "no" && "text-white/45",
        )}
      >
        {d}
        {mark === "no" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-1/2 h-0.5 -rotate-12 rounded bg-rose-400"
          />
        )}
        {mark === "yes" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 right-1.5 size-2 rounded-full bg-emerald-400"
          />
        )}
      </button>
    );
  };
  const digitsRow = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const small =
    "flex h-12 items-center justify-center rounded-xl border border-white/10 bg-black/35 text-sm hover:bg-black/50 disabled:opacity-30 short-landscape:h-9";
  return (
    <div className="flex w-full flex-col items-center gap-2 short-landscape:gap-1.5">
      <div className="relative flex flex-col items-center">
        <NumberBoxes
          value={value}
          digits={digits}
          size="lg"
          cursor={!disabled && !full}
          label={`넣은 수 ${value || "없음"}`}
        />
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-1.5">
        {digitsRow.map(key)}
        <button
          type="button"
          onClick={clear}
          disabled={disabled || value.length === 0}
          className={small}
        >
          비우기
        </button>
        {key("0")}
        <button
          type="button"
          onClick={erase}
          disabled={disabled || value.length === 0}
          aria-label="지우기"
          className={cn(small, "text-lg")}
        >
          ⌫
        </button>
      </div>
      <div className="flex w-full max-w-xs gap-1.5">
        {onMemo && (
          <button
            type="button"
            aria-pressed={inMemo}
            onClick={() => setMemoMode((m) => !m)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm",
              inMemo
                ? "border-sky-300 bg-sky-300 font-semibold text-black"
                : "border-white/10 bg-black/35",
            )}
          >
            ✎ 메모
          </button>
        )}
        {extra}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || submitDisabled || !full}
          className="flex-[2] rounded-xl bg-amber-300 py-2 font-black text-black shadow-[0_0_18px_rgba(252,211,77,0.35)] disabled:opacity-35 disabled:shadow-none"
        >
          {submitLabel}
        </button>
      </div>
      {inMemo && (
        <p className="text-center text-sky-200 text-xs">
          숫자를 누를 때마다 없음(빨간 줄) → 있음(초록 점) → 지움. 메모는 이
          화면에만 남아요
        </p>
      )}
    </div>
  );
}
