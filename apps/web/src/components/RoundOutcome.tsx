import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Outcome = "win" | "loss" | "draw";

/**
 * 판 게임(오목·장기…)의 상태 줄. 두는 중에는 작은 안내, 판이 끝나면 큰 결과 상자가 된다.
 * 가운데 띠(ResultBanner)가 사라진 뒤에도 결과가 남게 한다. 상태 글은 `role="status"`
 */
export function RoundOutcome({
  outcome,
  status,
  summary,
  className,
}: {
  /** 판이 끝났으면 내 결과, 아니면 null */
  outcome: Outcome | null;
  status: string;
  /** 판이 끝났을 때 아래 줄(예: "나 1 : 0 상대") */
  summary?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-outcome={outcome ?? undefined}
      className={cn(
        "flex flex-col items-center text-center",
        outcome &&
          "pop-in w-full max-w-xl rounded-2xl border px-6 py-3 shadow-xl",
        outcome === "win" && "border-amber-300 bg-amber-400/20",
        outcome === "loss" && "border-white/15 bg-black/40",
        outcome === "draw" && "border-white/20 bg-white/10",
        className,
      )}
    >
      <p
        role="status"
        className={cn(
          "min-h-6",
          outcome ? "font-black text-3xl tracking-tight" : "font-semibold",
          outcome === "win" && "text-amber-300",
        )}
      >
        {status}
      </p>
      {outcome && summary && (
        <p className="mt-1 text-sm text-white/80">{summary}</p>
      )}
    </div>
  );
}
