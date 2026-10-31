"use client";

import type React from "react";

import { cn } from "@/lib/cn";

import { ballColor, type SkyStar, starOf } from "../sky";

/** 번호 공 하나(스스로 빛나는 별처럼, 숫자). 색은 그 별의 빛깔, 모양은 globals.css .sd-ball */
export function LottoBall({
  n,
  size = "md",
  dim = false,
  ring = false,
  className,
}: {
  n: number;
  size?: "sm" | "md" | "lg";
  dim?: boolean;
  /** 맞힌 번호 강조(고리 대신 더 밝고 크게 빛난다) */
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      data-ball={n}
      className={cn(
        "sd-ball inline-grid shrink-0 place-items-center rounded-full font-bold text-neutral-900 tabular-nums",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-12 text-lg",
        dim && "opacity-35",
        ring && "sd-ball-hit",
        className,
      )}
      style={
        {
          "--ball": ballColor(n),
          // 공마다 반짝임 박자와 표면 얼룩 자리를 어긋나게(같은 무늬로 함께 움직이지 않게)
          "--twinkle-delay": `-${((n * 0.73) % 2.7).toFixed(2)}s`,
          "--boil-delay": `-${((n * 7.3) % 44).toFixed(1)}s`,
        } as React.CSSProperties
      }
    >
      {n}
    </span>
  );
}

/** 별 한 줄 정보: "7 베텔게우스 · 오리온자리"와 한 줄 문구 */
export function StarLine({
  star,
  compact = false,
}: {
  star: SkyStar;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <LottoBall n={star.n} size={compact ? "sm" : "md"} />
      <div className="flex min-w-0 flex-col">
        <span
          className={cn("font-semibold", compact ? "text-sm" : "text-base")}
        >
          {star.ko}{" "}
          <span className="font-normal text-white/55 text-xs">{star.con}</span>
        </span>
        <span
          className={cn(
            "break-keep text-white/70",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {star.fact}
        </span>
      </div>
    </div>
  );
}

/** 누른 별의 정보 칸(응모 화면 하늘 아래) */
export function StarInfo({ n }: { n: number | null }) {
  if (n === null)
    return (
      <div className="min-h-20 rounded-xl border border-white/10 bg-white/5" />
    );
  return (
    <div
      aria-live="polite"
      data-star-info={n}
      className="min-h-20 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
    >
      <StarLine star={starOf(n)} />
    </div>
  );
}

export const RANK_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

/** 응모권 id를 사람이 읽기 좋게(앞 12글자를 넷씩) */
export function shortId(hex: string): string {
  return hex.slice(0, 12).replace(/(.{4})(?=.)/g, "$1 ");
}

const TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTime(seconds: number): string {
  return TIME.format(new Date(seconds * 1000));
}

/** 남은 시간 "42:13", 한 시간 넘으면 "1:02:03" */
export function formatLeft(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** 회차 시각 안내. 마감은 늘 추첨 5분 전(docs/36 3절) */
export function scheduleLine(length: number): string {
  if (length === 3600) return "매시 정각 추첨 · 55분 마감";
  const every =
    length % 3600 === 0 ? `${length / 3600}시간` : `${length / 60}분`;
  return `${every}마다 추첨 · 추첨 5분 전 마감`;
}

export const TAGLINE = "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?";

/** 제목과 소개 문구(첫 화면·응모 화면이 같은 머리말을 쓴다) */
export function StardrawTitle() {
  return (
    <div className="sd-title flex flex-col gap-1 text-center">
      <h1 className="font-black text-3xl tracking-tight">하늘의 별 따기</h1>
      <p className="break-keep text-sm text-white/65">{TAGLINE}</p>
    </div>
  );
}

/**
 * 추첨을 아직 열어 보지 않은 내 회차의 결과 자리(spoiler.ts). 숫자 대신 이 단추 하나만 둔다.
 * `onDraw`가 없으면 단추 모양만 그린다(바깥이 이미 누를 수 있는 단추일 때)
 */
export function DrawFirst({
  round,
  onDraw,
  className,
}: {
  round: number;
  onDraw?: (() => void) | undefined;
  className?: string;
}) {
  const look = cn(
    "inline-flex items-center justify-center rounded-lg border border-amber-200/50 bg-amber-200/10 px-3 py-1.5 font-semibold text-amber-100 text-sm",
    onDraw && "hover:bg-amber-200/20",
    className,
  );
  return onDraw ? (
    <button
      type="button"
      onClick={onDraw}
      data-draw-first={round}
      className={look}
    >
      추첨 보기
    </button>
  ) : (
    <span data-draw-first={round} className={look}>
      추첨 보기
    </span>
  );
}
