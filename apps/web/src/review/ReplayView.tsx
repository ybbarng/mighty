"use client";

import type { Card } from "@mighty/engine";
import { useCallback, useEffect, useRef, useState } from "react";

import { GameTable } from "@/components/GameTable";
import { SuitMark, SuitText } from "@/components/SuitText";
import type { Commentary, GameKit, Verdict } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";
import { type AttachableHost, useGame } from "@/game/store";
import { HeartsTable } from "@/hearts/components/HeartsTable";
import { heartsKit } from "@/hearts/kit";
import { type HeartsHost, useHearts } from "@/hearts/store";
import { cn } from "@/lib/cn";

import { CardChip } from "./CardChip";
import { VERDICT_LABEL } from "./commentary";
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
  /** 다른 사람 손패를 앞면으로 펼친다 */
  const [reveal, setReveal] = useState(false);
  /** 기록을 화면 상태에 붙인 뒤에 게임 화면을 그린다(화면 크기 재기가 첫 그림에 붙는다) */
  const [ready, setReady] = useState(false);
  const last = replayed.states.length - 1;
  const mightyIdle = useGame((s) => !s.busy && s.queue.length === 0);
  const heartsIdle = useHearts((s) => !s.busy && s.queue.length === 0);
  const idle = hearts ? heartsIdle : mightyIdle;
  const compact = useNarrowPortrait();

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
  const openHands =
    reveal && state
      ? // 기록의 카드 문자열은 엔진 카드 그대로다.
        (state.round.hands.map((hand) =>
          kit.review.sortHand(state, hand),
        ) as Card[][])
      : null;

  return (
    <div className="relative">
      {ready &&
        (hearts ? (
          <HeartsTable onExit={onExit} openHands={openHands} />
        ) : (
          <GameTable onExit={onExit} openHands={openHands} />
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
          <Ctl
            label="한 걸음 뒤로"
            onClick={() => {
              setPlaying(false);
              jump(index - 1);
            }}
          >
            ◀
          </Ctl>
          <Ctl
            label="한 걸음 앞으로"
            onClick={() => {
              setPlaying(false);
              forward();
            }}
          >
            ▶
          </Ctl>
          <Ctl
            label="다음 판"
            onClick={() => nextSpan && jump(nextSpan.start)}
            disabled={!nextSpan}
          >
            ⏭
          </Ctl>
          {/* 한 걸음씩과 헷갈리지 않게 자동 재생은 따로 글자로 둔다 */}
          <Ctl
            label={playing ? "자동 재생 멈추기" : "자동 재생"}
            onClick={() => setPlaying((p) => !p)}
            active={playing}
          >
            {playing ? "⏸ 멈춤" : "자동 재생"}
          </Ctl>
          <Ctl
            label={reveal ? "모든 패 숨기기" : "모든 패 보기"}
            onClick={() => setReveal((r) => !r)}
            active={reveal}
          >
            {reveal ? "패 숨기기" : "패 보기"}
          </Ctl>
          <Ctl
            label="상황판"
            onClick={() => {
              // 세로 휴대폰 상황판은 손패 목록을 빼고, 손패는 자리 판 아래에 펼쳐 본다.
              if (!board && compact) setReveal(true);
              setBoard((b) => !b);
            }}
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
          compact={compact}
          after={(replayed.states[index + 1] as BoardState | undefined) ?? null}
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

/** 다음 수 해설. 고수의 계산을 다시 하므로 그린 뒤에 한다 */
function useCommentary(
  kit: AnyKit,
  state: unknown,
  next: { seat: number; action: unknown } | null,
  after: unknown,
  index: number,
  name: (seat: number) => string,
): Commentary | null {
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  useEffect(() => {
    setCommentary(null);
    if (!next) return;
    const timer = setTimeout(() => {
      try {
        setCommentary(kit.review.explain(state, next, after, index, name));
      } catch {
        setCommentary(null);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [kit, state, next, after, index, name]);
  return commentary;
}

/** 상황판: 다음 수와 고수의 수, 점수, 모든 자리의 패와 떨어진 무늬, 이 판에 나온 카드(무늬별) */
function Board({
  state,
  name,
  seat,
  kit,
  index,
  next,
  after,
  compact,
}: {
  state: BoardState;
  name: (seat: number) => string;
  seat: number;
  kit: AnyKit;
  index: number;
  next: { seat: number; action: unknown } | null;
  after: BoardState | null;
  /** 세로 휴대폰: 아래에 낮게 붙이고, 남의 손패 목록은 빼고(자리 판 아래 펼친 패로 본다) 내 패만 둔다 */
  compact: boolean;
}) {
  const situation = kit.review.situation(state);
  const expert = useExpertMove(kit, state, next, index);
  const commentary = useCommentary(kit, state, next, after, index, name);
  const actual = next ? kit.review.describe(next.action) : null;
  const played = [
    ...state.round.tricks.flatMap((t) => t.plays),
    ...(state.round.trick?.plays ?? []),
  ].map((p) => p.card);
  return (
    // 오른쪽 위는 게임 화면의 설정 메뉴가 열리는 곳이라 왼쪽에 둔다.
    // 세로 휴대폰은 다른 사람 패와 가운데 턴 카드를 가리지 않게 아래(내 손패 자리)에 낮게 붙인다.
    <aside
      className={cn(
        "fixed z-[400] flex flex-col overflow-y-auto rounded-2xl bg-black/90 text-sm shadow-2xl",
        compact
          ? "inset-x-2 bottom-2 max-h-[40dvh] gap-2 bg-black/95 p-2"
          : "top-28 left-2 max-h-[calc(100dvh-8rem)] w-80 max-w-[calc(100vw-1rem)] gap-3 p-3",
      )}
      aria-label="상황판"
    >
      {next && (
        <section>
          <h3 className="mb-1 font-bold text-white/80 text-xs">
            다음 수 · {name(next.seat)}
          </h3>
          <div
            className={cn(
              "flex text-xs",
              compact ? "flex-wrap gap-x-3" : "flex-col gap-0.5",
            )}
          >
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
          <Explanation commentary={commentary} compact={compact} />
        </section>
      )}
      {compact && situation.tally.length > 0 && (
        <p className="text-white/70 text-xs">
          {situation.tally
            .map((t) =>
              t.seat !== undefined
                ? `${name(t.seat)} ${t.value}`
                : `${t.label.replace(" 점수 카드", "")} ${t.value}`,
            )
            .join(" · ")}
        </p>
      )}
      {!compact && situation.tally.length > 0 && (
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
        {/* 좁은 화면은 제목 줄을 빼서 높이를 줄인다(내 패 줄 앞에 "나"가 있다) */}
        {!compact && (
          <h3 className="mb-1 font-bold text-white/80 text-xs">모든 패</h3>
        )}
        {state.round.hands.map((hand, s) =>
          compact && s !== seat ? null : (
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
              {kit.review.sortHand(state, hand).map((c) => (
                <CardChip key={c} card={c} />
              ))}
              {(situation.voids[s] ?? []).length > 0 && (
                <span className="ml-1 rounded bg-rose-900/70 px-1 text-[10px] text-rose-200">
                  <SuitText text={(situation.voids[s] ?? []).join("")} /> 없음
                </span>
              )}
            </div>
          ),
        )}
        {compact &&
          situation.voids.some((v, s) => s !== seat && v.length > 0) && (
            <p className="text-[11px] text-white/60">
              무늬가 없다고 드러난 사람:{" "}
              <SuitText
                text={situation.voids
                  .map((v, s) =>
                    v.length > 0 && s !== seat
                      ? `${name(s)} ${v.join("")}`
                      : null,
                  )
                  .filter(Boolean)
                  .join(", ")}
              />
            </p>
          )}
        {!compact && situation.voids.some((v) => v.length > 0) && (
          <p className="mt-1 text-[11px] text-white/50">
            "<SuitText text="♣" /> 없음"은 그 무늬가 나왔을 때 따라 내지 못해,
            그 무늬가 손에 없다는 게 드러났다는 뜻입니다.
          </p>
        )}
      </section>
      <section>
        <h3
          className={cn(
            "font-bold text-white/80 text-xs",
            compact ? "sr-only" : "mb-1",
          )}
        >
          이 판에 나온 카드
        </h3>
        {compact && played.length === 0 && (
          <span className="text-white/30 text-xs">아직 없음</span>
        )}
        {SUITS.map((suit) => {
          const cards = played.filter((c) => c.startsWith(suit));
          // 좁은 화면은 빈 무늬 줄을 빼서 높이를 줄인다.
          if (compact && cards.length === 0) return null;
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

const VERDICT_STYLE: Record<Verdict, string> = {
  good: "bg-emerald-500/25 text-emerald-200",
  fine: "bg-sky-500/25 text-sky-200",
  slip: "bg-amber-500/25 text-amber-200",
  bad: "bg-rose-500/30 text-rose-200",
};

/** 걸음 해설: 평가, 상황, 판단과 근거. 좁은 화면에서는 근거를 접어 둔다 */
function Explanation({
  commentary,
  compact,
}: {
  commentary: Commentary | null;
  compact: boolean;
}) {
  if (commentary === null)
    return <p className="mt-2 text-white/40 text-xs">해설을 계산하는 중…</p>;
  const { situation, verdict, reasons } = commentary;
  if (situation.length === 0 && reasons.length === 0) return null;
  if (compact)
    return (
      <details className="mt-1 rounded-xl bg-white/5 p-2 text-xs">
        <summary className="cursor-pointer">
          {verdict && (
            <span
              className={cn(
                "mr-1 rounded-md px-1.5 py-0.5 font-bold",
                VERDICT_STYLE[verdict],
              )}
            >
              {VERDICT_LABEL[verdict]}
            </span>
          )}
          <span className="text-white/70">
            <SuitText text={situation[0] ?? ""} />
          </span>
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          {situation.slice(1).map((line) => (
            <p key={line} className="text-white/70">
              <SuitText text={line} />
            </p>
          ))}
          {reasons.map((line) => (
            <p key={line} className="leading-snug">
              · <SuitText text={line} />
            </p>
          ))}
        </div>
      </details>
    );
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-xl bg-white/5 p-2 text-xs">
      {verdict && (
        <span
          className={cn(
            "w-fit rounded-md px-1.5 py-0.5 font-bold",
            VERDICT_STYLE[verdict],
          )}
        >
          {VERDICT_LABEL[verdict]}
        </span>
      )}
      {situation.map((line) => (
        <p key={line} className="text-white/70">
          <SuitText text={line} />
        </p>
      ))}
      {reasons.map((line) => (
        <p key={line} className="leading-snug">
          · <SuitText text={line} />
        </p>
      ))}
    </div>
  );
}

/** 세로로 든 좁은 화면(휴대폰)인가 */
function useNarrowPortrait(): boolean {
  const query = "(max-width: 639px) and (orientation: portrait)";
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    setNarrow(media.matches);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
