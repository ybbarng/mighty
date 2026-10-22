"use client";

import type { MatchState } from "@mighty/hearts-engine";

import { cn } from "@/lib/cn";

import { CardChip } from "./CardChip";
import type { RoundSpan } from "./rounds";
import { TrickTable } from "./TrickTable";

const DIRECTION = {
  left: "왼쪽으로",
  right: "오른쪽으로",
  across: "건너편으로",
  none: "넘기지 않음",
} as const;

/** 하트 판 한눈에 보기: 넘긴 카드, 받은 점수, 문 슛, 처음 패, 턴 표 */
export function HeartsRound({
  span,
  states,
  seat,
  name,
  onReplay,
}: {
  span: RoundSpan;
  states: readonly MatchState[];
  seat: number;
  name: (seat: number) => string;
  onReplay: (index: number) => void;
}) {
  const start = states[span.start] as MatchState;
  const end = span.end === null ? null : (states[span.end] as MatchState);
  const round = end?.round;
  const seats = start.players;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{span.number}판</h3>
        <span className="text-white/60 text-xs">
          {DIRECTION[start.round.direction]}
        </span>
        {round?.moonShooter !== null && round?.moonShooter !== undefined && (
          <span className="rounded-full bg-amber-300 px-2 py-0.5 font-semibold text-black text-xs">
            🌙 {name(round.moonShooter)} 문 슛
          </span>
        )}
        <button
          type="button"
          onClick={() => onReplay(span.start)}
          className="ml-auto rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
        >
          ▶ 이 판 다시 보기
        </button>
      </div>
      {round?.roundPoints ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          {seats.map((s) => (
            <span
              key={s}
              className={cn(s === seat && "font-bold text-amber-200")}
            >
              {name(s)} +{round.roundPoints?.[s] ?? 0} (합 {end?.scores[s]})
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-white/60">아직 끝나지 않은 판</p>
      )}
      {round && round.passes.some((p) => p && p.length > 0) && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-white/60 text-xs">넘긴 카드</span>
          {seats.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-1">
              <span className="w-16 truncate text-white/60 text-xs">
                {name(s)}
              </span>
              {(round.passes[s] ?? []).map((c) => (
                <CardChip key={c} card={c} />
              ))}
            </div>
          ))}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-white/70">
          처음 패
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          {seats.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-1">
              <span className="w-16 truncate text-white/60 text-xs">
                {name(s)}
              </span>
              {(start.round.hands[s] ?? []).map((c) => (
                <CardChip key={c} card={c} />
              ))}
            </div>
          ))}
        </div>
      </details>
      {round && round.tricks.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-sm text-white/70">
            턴 표
          </summary>
          <div className="mt-2">
            <TrickTable
              tricks={round.tricks}
              seats={seats}
              name={name}
              mark={(card) => (card === "SQ" ? "♠Q" : null)}
            />
          </div>
        </details>
      )}
    </section>
  );
}
