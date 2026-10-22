"use client";

import type { MatchState } from "@mighty/engine";
import { mightyOf } from "@mighty/engine";

import { friendLabel, goalLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

import { CardChip } from "./CardChip";
import type { RoundSpan } from "./rounds";
import { TrickTable } from "./TrickTable";

const MULTIPLIER: Record<string, string> = {
  run: "런",
  reverseRun: "백런",
  noKiruda: "노기루다",
  noFriend: "노프렌드",
};

/** 마이티 판 한눈에 보기: 주공·공약·프렌드·버린 카드·성패·돈, 처음 패, 턴 표 */
export function MightyRound({
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
  const result = round?.result ?? null;
  const goal = round?.goal ?? null;
  const declarer = round?.declarer ?? null;
  const seats = start.order;
  const mighty = goal ? mightyOf(start.rules, goal.kiruda) : null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{span.number}판</h3>
        {result && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold text-xs",
              result.rulingWon ? "bg-sky-600" : "bg-white/15",
            )}
          >
            여당 {result.rulingWon ? "성공" : "실패"} · 점수 카드{" "}
            {result.rulingPoints}장
          </span>
        )}
        {result?.multipliers.map((m) => (
          <span
            key={m}
            className="rounded-full bg-amber-300 px-2 py-0.5 font-semibold text-black text-xs"
          >
            {MULTIPLIER[m] ?? m}
          </span>
        ))}
        <button
          type="button"
          onClick={() => onReplay(span.start)}
          className="ml-auto rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
        >
          ▶ 이 판 다시 보기
        </button>
      </div>
      {round && goal && declarer !== null ? (
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-white/60">주공</dt>
          <dd>
            {name(declarer)} · {goalLabel(goal, start.rules.playerCount)}
          </dd>
          <dt className="text-white/60">프렌드</dt>
          <dd>
            {round.friendDeclaration
              ? friendLabel(round.friendDeclaration, name)
              : "—"}
            {round.friend !== null && round.friend !== undefined
              ? ` → ${name(round.friend)}`
              : ""}
          </dd>
          {round.discarded.length > 0 && (
            <>
              <dt className="text-white/60">버린 카드</dt>
              <dd className="flex flex-wrap gap-1">
                {round.discarded.map((c) => (
                  <CardChip key={c} card={c} />
                ))}
              </dd>
            </>
          )}
          {result && (
            <>
              <dt className="text-white/60">돈</dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                {seats.map((s) => {
                  const delta = (result.money[s] ?? 0) - (start.money[s] ?? 0);
                  return (
                    <span
                      key={s}
                      className={cn(s === seat && "font-bold text-amber-200")}
                    >
                      {name(s)} {delta > 0 ? "+" : ""}
                      {delta}
                    </span>
                  );
                })}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm text-white/60">
          {end ? "공약 없이 끝난 판" : "아직 끝나지 않은 판"}
        </p>
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
          {start.round.deck.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-16 text-white/60 text-xs">바닥</span>
              {start.round.deck.map((c) => (
                <CardChip key={c} card={c} />
              ))}
            </div>
          )}
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
              mark={(card) => (card === mighty ? "마이티" : null)}
            />
          </div>
        </details>
      )}
    </section>
  );
}
