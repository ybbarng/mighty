"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** 직접 해 보는 상자(별 따기 밤하늘 톤) */
export function Toy({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div
      data-toy={id}
      className="sd-glass flex min-w-0 flex-col gap-3 rounded-2xl p-4"
    >
      <div className="font-semibold text-amber-100/80 text-xs tracking-wide">
        ▶ 직접 해 보기 · {title}
      </div>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  active = false,
  disabled = false,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-40",
        primary
          ? "border-amber-200 bg-amber-200 font-semibold text-slate-900 hover:bg-amber-100"
          : active
            ? "border-amber-300 bg-amber-300/90 text-slate-900"
            : "border-white/20 bg-white/5 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

/** 확인 결과 한 줄. ok가 null이면 아직 계산 중 */
export function Verdict({
  ok,
  children,
  testId,
}: {
  ok: boolean | null;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-verdict={testId}
      data-ok={ok === null ? "wait" : ok ? "pass" : "fail"}
      className={cn(
        "rounded-lg px-3 py-2 text-xs leading-relaxed",
        ok === null && "bg-white/5 text-white/60",
        ok === true && "bg-emerald-900/60 text-emerald-100",
        ok === false && "bg-rose-900/60 text-rose-100",
      )}
    >
      {ok === null ? "… " : ok ? "✓ " : "✗ "}
      {children}
    </div>
  );
}

/** 짧은 hex·값 */
export function Mono({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "warn" | "good" | "bad";
}) {
  return (
    <code
      className={cn(
        "break-all rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]",
        tone === "plain" && "text-amber-100/90",
        tone === "warn" && "text-amber-300",
        tone === "good" && "text-emerald-300",
        tone === "bad" && "text-rose-300",
      )}
    >
      {children}
    </code>
  );
}

/** 이름: 값 한 줄 */
export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      <span className="shrink-0 text-white/55">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/85 leading-relaxed">{children}</p>;
}
