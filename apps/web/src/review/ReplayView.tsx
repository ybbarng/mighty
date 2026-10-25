"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GameTable } from "@/components/GameTable";
import { SuitMark, SuitText } from "@/components/SuitText";
import type { GameKit } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";
import { type AttachableHost, useGame } from "@/game/store";
import { HeartsTable } from "@/hearts/components/HeartsTable";
import { heartsKit } from "@/hearts/kit";
import { type HeartsHost, useHearts } from "@/hearts/store";
import { cn } from "@/lib/cn";

import { CardChip } from "./CardChip";
import type { Replayed } from "./replay";
import { ReplayHost } from "./replay-host";
import type { RoundSpan } from "./rounds";

type AnyKit = GameKit<unknown, unknown, unknown, unknown, unknown, unknown>;

/** 상황판에 쓰는 상태 모양(마이티·하트 공통으로 있는 것만) */
interface BoardState {
  round: {
    hands: string[][];
    trick: { plays: { seat: number; card: string }[] } | null;
    tricks: { plays: { seat: number; card: string }[] }[];
  };
}

const SUITS = ["S", "H", "D", "C"] as const;

/**
 * 다시 보기: 게임 화면을 그대로 쓰고, 위에 앞뒤로 움직이는 단추와 상황판(모든 패·나온 카드)을 얹는다
 */
export function ReplayView({
  game,
  replayed,
  seat,
  seatNames,
  spans,
  startIndex,
  name,
  onExit,
  log,
}: {
  game: string;
  replayed: Replayed<unknown, unknown>;
  /** 행동 기록(다음 수를 고수의 수와 견준다) */
  log: readonly { seat: number; action: unknown }[];
  seat: number;
  seatNames: string[] | null;
  spans: readonly RoundSpan[];
  startIndex: number;
  name: (seat: number) => string;
  onExit: () => void;
}) {
  const hearts = game === "hearts";
  const kit = (hearts ? heartsKit : mightyKit) as unknown as AnyKit;
  const host = useRef<ReplayHost<
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown
  > | null>(null);
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(false);
  const [board, setBoard] = useState(false);
  /** 기록을 화면 상태에 붙인 뒤에 게임 화면을 그린다(화면 크기 재기가 첫 그림에 붙는다) */
  const [ready, setReady] = useState(false);
  const last = replayed.states.length - 1;
  const mightyIdle = useGame((s) => !s.busy && s.queue.length === 0);
  const heartsIdle = useHearts((s) => !s.busy && s.queue.length === 0);
  const idle = hearts ? heartsIdle : mightyIdle;

  const jump = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(last, i));
      const next = new ReplayHost(kit, replayed, seat, target);
      host.current = next;
      setIndex(target);
      if (hearts)
        useHearts
          .getState()
          .attachReplay(next as unknown as HeartsHost, seatNames);
      else
        useGame
          .getState()
          .attachReplay(next as unknown as AttachableHost, seatNames);
    },
    [hearts, kit, last, replayed, seat, seatNames],
  );

  const forward = useCallback(() => {
    if (host.current?.forward()) setIndex(host.current.index);
    else setPlaying(false);
  }, []);

  // 처음 열 때 그 걸음으로 간다.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    jump(startIndex);
    setReady(true);
  }, [jump, startIndex]);

  // 재생: 화면이 사건을 다 보여 주면 다음 걸음.
  useEffect(() => {
    if (!playing || !idle) return;
    const timer = setTimeout(forward, 120);
    return () => clearTimeout(timer);
  }, [playing, idle, forward]);

  const span =
    [...spans].reverse().find((s) => s.start <= index) ?? spans[0] ?? null;
  const nextSpan = spans.find((s) => s.start > index) ?? null;
  const state = replayed.states[index] as BoardState | undefined;

  return (
    <div className="relative">
      {ready &&
        (hearts ? (
          <HeartsTable onExit={onExit} />
        ) : (
          <GameTable onExit={onExit} />
        ))}
      <div className="pointer-events-none fixed inset-x-0 top-3.5 z-[400] flex justify-center px-2">
        <div
          className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-black/85 px-2 py-1.5 text-sm shadow-2xl"
          role="toolbar"
          aria-label="다시 보기"
        >
          <span className="px-1 text-amber-200 text-xs">
            다시 보기{span ? ` · ${span.number}판` : ""} · {index}/{last}
          </span>
          <Ctl
            label="판 처음"
            onClick={() =>
              jump(
                span && index > span.start
                  ? span.start
                  : ([...spans].reverse().find((s) => s.start < index)?.start ??
                      0),
              )
            }
          >
            ⏮
          </Ctl>
          <Ctl label="한 걸음 뒤로" onClick={() => jump(index - 1)}>
            ◀
          </Ctl>
          <Ctl
            label={playing ? "멈추기" : "재생"}
            onClick={() => setPlaying((p) => !p)}
            active={playing}
          >
            {playing ? "⏸" : "▶"}
          </Ctl>
          <Ctl label="한 걸음 앞으로" onClick={forward}>
            ▶|
          </Ctl>
          <Ctl
            label="다음 판"
            onClick={() => nextSpan && jump(nextSpan.start)}
            disabled={!nextSpan}
          >
            ⏭
          </Ctl>
          <Ctl
            label="상황판"
            onClick={() => setBoard((b) => !b)}
            active={board}
          >
            상황판
          </Ctl>
          {/* 좁은 화면에서는 이 막대가 위 상태 줄을 덮으므로 나가기를 여기에도 둔다 */}
          <Ctl label="다시 보기 나가기" onClick={onExit}>
            ✕
          </Ctl>
        </div>
      </div>
      {board && state && (
        <Board
          state={state}
          name={name}
          seat={seat}
          kit={kit}
          index={index}
          next={log[index] ?? null}
        />
      )}
      {replayed.error && (
        <p className="fixed inset-x-0 bottom-2 z-[400] mx-auto w-fit rounded-lg bg-rose-800 px-3 py-1 text-xs">
          {replayed.error}
        </p>
      )}
    </div>
  );
}

function Ctl({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-w-9 rounded-lg px-2 py-1 font-semibold disabled:opacity-30",
        active ? "bg-amber-300 text-black" : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}

/** 다음 수를 고수(실력 단계 2)라면 어떻게 두었을까. 계산이 무거울 수 있어 그린 뒤에 한다 */
function useExpertMove(
  kit: AnyKit,
  state: unknown,
  next: { seat: number; action: unknown } | null,
  index: number,
): string | null {
  const [move, setMove] = useState<string | null>(null);
  useEffect(() => {
    setMove(null);
    const bot = kit.botFor?.(2);
    if (!next || !bot) return;
    const timer = setTimeout(() => {
      try {
        const view = kit.viewOf(state, next.seat) as { decision: unknown };
        if (!view.decision) return;
        setMove(kit.review.describe(bot.decide(view, { seed: index })));
      } catch {
        setMove(null);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [kit, state, next, index]);
  return move;
}

/** 상황판: 다음 수와 고수의 수, 점수, 모든 자리의 패와 떨어진 무늬, 이 판에 나온 카드(무늬별) */
function Board({
  state,
  name,
  seat,
  kit,
  index,
  next,
}: {
  state: BoardState;
  name: (seat: number) => string;
  seat: number;
  kit: AnyKit;
  index: number;
  next: { seat: number; action: unknown } | null;
}) {
  const situation = kit.review.situation(state);
  const expert = useExpertMove(kit, state, next, index);
  const actual = next ? kit.review.describe(next.action) : null;
  const played = [
    ...state.round.tricks.flatMap((t) => t.plays),
    ...(state.round.trick?.plays ?? []),
  ].map((p) => p.card);
  return (
    <aside className="fixed top-28 right-2 z-[400] flex max-h-[70dvh] w-72 max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-black/90 p-3 text-sm shadow-2xl">
      {next && (
        <section>
          <h3 className="mb-1 font-bold text-white/80 text-xs">
            다음 수 · {name(next.seat)}
          </h3>
          <div className="flex flex-col gap-0.5 text-xs">
            <span>
              실제: <b>{actual && <SuitText text={actual} />}</b>
            </span>
            <span className="text-white/70">
              고수라면:{" "}
              {expert === null ? (
                "생각하는 중…"
              ) : (
                <b
                  className={
                    expert === actual ? "text-sky-300" : "text-amber-200"
                  }
                >
                  <SuitText text={expert} />
                  {expert === actual ? " (같다)" : ""}
                </b>
              )}
            </span>
          </div>
        </section>
      )}
      {situation.tally.length > 0 && (
        <section>
          <h3 className="mb-1 font-bold text-white/80 text-xs">점수</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-xs">
            {situation.tally.map((t) => (
              <div key={`${t.seat ?? ""}${t.label}`} className="contents">
                <dt className="text-white/60">
                  {t.seat !== undefined ? `${name(t.seat)} ` : ""}
                  {t.label}
                </dt>
                <dd className="text-right tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h3 className="mb-1 font-bold text-white/80 text-xs">
          모든 패{" "}
          <span className="font-normal text-white/50">(떨어진 무늬)</span>
        </h3>
        {state.round.hands.map((hand, s) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={s}
            className="mb-1 flex flex-wrap items-center gap-0.5"
          >
            <span
              className={cn(
                "w-14 truncate text-xs",
                s === seat ? "text-amber-200" : "text-white/60",
              )}
            >
              {name(s)}
            </span>
            {hand.map((c) => (
              <CardChip key={c} card={c} />
            ))}
            {(situation.voids[s] ?? []).length > 0 && (
              <span className="ml-1 rounded bg-rose-900/70 px-1 text-[10px] text-rose-200">
                <SuitText text={(situation.voids[s] ?? []).join("")} /> 없음
              </span>
            )}
          </div>
        ))}
      </section>
      <section>
        <h3 className="mb-1 font-bold text-white/80 text-xs">
          이 판에 나온 카드
        </h3>
        {SUITS.map((suit) => {
          const cards = played.filter((c) => c.startsWith(suit));
          return (
            <div
              key={suit}
              className="mb-1 flex flex-wrap items-center gap-0.5"
            >
              <span className="w-5 text-white/60">
                <SuitMark suit={suit} />
              </span>
              {cards.length === 0 ? (
                <span className="text-white/30 text-xs">없음</span>
              ) : (
                cards.map((c) => <CardChip key={c} card={c} />)
              )}
            </div>
          );
        })}
        {played.includes("JK") && (
          <div className="flex items-center gap-1">
            <span className="w-5" />
            <CardChip card="JK" />
          </div>
        )}
      </section>
    </aside>
  );
}
