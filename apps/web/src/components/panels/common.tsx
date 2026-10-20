"use client";

import {
  type Card,
  type Kiruda,
  RANKS,
  type Rank,
  SUITS,
  type Suit,
} from "@mighty/engine";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { isRedSuit, kirudaName, kirudaSymbol, SUIT_SYMBOL } from "@/game/terms";
import { cn } from "@/lib/cn";

import { TermQuestion } from "../TermHint";

export function Panel({
  title,
  term,
  children,
}: {
  title: string;
  /** 제목 옆 "?"를 누르면 이 용어의 뜻을 보여 준다 */
  term?: string;
  children: ReactNode;
}) {
  return (
    <div className="panel flex max-h-full min-h-0 w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-black/70 p-4 shadow-2xl backdrop-blur">
      <h2 className="text-center font-bold text-base">
        {title}
        {term && <TermQuestion id={term} />}
      </h2>
      {children}
    </div>
  );
}

export function ActionButton({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      className={cn(
        "action-button rounded-xl px-4 py-2 font-semibold text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-amber-400 text-black hover:bg-amber-300",
        variant === "secondary" && "bg-white/15 hover:bg-white/25",
        variant === "danger" && "bg-red-500/80 hover:bg-red-500",
        className,
      )}
      {...props}
    />
  );
}

export function KirudaPicker({
  value,
  onChange,
  enabled,
}: {
  value: Kiruda;
  onChange: (kiruda: Kiruda) => void;
  enabled: (kiruda: Kiruda) => boolean;
}) {
  const options: Kiruda[] = [...SUITS, "NT"];
  return (
    <div className="flex justify-center gap-1.5">
      {options.map((k) => (
        <button
          key={k}
          type="button"
          title={kirudaName(k)}
          disabled={!enabled(k)}
          onClick={() => onChange(k)}
          className={cn(
            "h-10 min-w-10 rounded-lg border px-2 font-bold text-lg transition disabled:opacity-25",
            value === k
              ? "border-amber-300 bg-white text-black"
              : "border-white/20 bg-white/10",
            value === k && isRedSuit(k) && "text-red-600",
            k === "NT" && "text-sm",
          )}
        >
          {kirudaSymbol(k)}
        </button>
      ))}
    </div>
  );
}

export function ScoreStepper({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (n: number) => void;
}) {
  const index = options.indexOf(value);
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        aria-label="낮추기"
        disabled={index <= 0}
        onClick={() => onChange(options[index - 1] as number)}
        className="h-10 w-10 rounded-full bg-white/15 text-xl disabled:opacity-25"
      >
        −
      </button>
      <span className="panel-number w-12 text-center font-bold text-3xl tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="올리기"
        disabled={index < 0 || index >= options.length - 1}
        onClick={() => onChange(options[index + 1] as number)}
        className="h-10 w-10 rounded-full bg-white/15 text-xl disabled:opacity-25"
      >
        +
      </button>
    </div>
  );
}

/** 무늬 줄 + 숫자 줄로 카드 한 장 고르기 */
export function CardPicker({
  value,
  onChange,
  available,
  allowJoker,
}: {
  value: Card | null;
  onChange: (card: Card) => void;
  available: (card: Card) => boolean;
  allowJoker: boolean;
}) {
  const suit: Suit | null = value && value !== "JK" ? (value[0] as Suit) : null;
  // 아직 아무것도 안 골랐으면 ♠를 고른 것으로 보여 준다(숫자 단추가 ♠ 기준으로 동작한다).
  const currentSuit = suit ?? "S";
  const shownSuit = value === "JK" ? null : currentSuit;
  return (
    <div className="card-picker flex flex-col gap-1.5">
      <div className="flex justify-center gap-1">
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              const rank =
                value && value !== "JK" ? (value.slice(1) as Rank) : "A";
              onChange(`${s}${rank}`);
            }}
            className={cn(
              "h-8 w-9 rounded-md border text-base",
              shownSuit === s
                ? "border-amber-300 bg-white"
                : "border-white/20 bg-white/10",
              shownSuit === s && (isRedSuit(s) ? "text-red-600" : "text-black"),
            )}
          >
            {SUIT_SYMBOL[s]}
          </button>
        ))}
        {allowJoker && (
          <button
            type="button"
            disabled={!available("JK")}
            onClick={() => onChange("JK")}
            className={cn(
              "h-8 rounded-md border px-2 text-xs disabled:opacity-25",
              value === "JK"
                ? "border-amber-300 bg-white text-black"
                : "border-white/20 bg-white/10",
            )}
          >
            조커
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {[...RANKS].reverse().map((rank) => {
          const card: Card = `${currentSuit}${rank}`;
          return (
            <button
              key={rank}
              type="button"
              disabled={!available(card)}
              onClick={() => onChange(card)}
              className={cn(
                "h-8 min-w-8 rounded-md border px-1 text-sm disabled:opacity-25",
                value === card
                  ? "border-amber-300 bg-white text-black"
                  : "border-white/20 bg-white/10",
              )}
            >
              {rank}
            </button>
          );
        })}
      </div>
    </div>
  );
}
