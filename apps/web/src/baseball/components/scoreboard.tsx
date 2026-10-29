"use client";

import {
  type BaseballView,
  type GuessEntry,
  timeControlOf,
} from "@mighty/baseball-engine";
import { useEffect, useRef, useState } from "react";

import { GameClock } from "@/components/GameClock";
import { cn } from "@/lib/cn";

import {
  CALL_TEXT,
  type CallKind,
  callOf,
  inningOf,
  inningText,
} from "../call";
import { CountLamps } from "./parts";

/** 전광판에 비워 두는 회 수(실제 야구처럼 9회까지 칸을 둔다) */
const INNINGS = 9;

/** 마지막으로 답이 나온 물음(볼카운트·주자에 보인다) */
export function lastAnswered(
  guesses: readonly GuessEntry[],
): (GuessEntry & { index: number }) | null {
  for (let i = guesses.length - 1; i >= 0; i--) {
    const g = guesses[i];
    if (g && g.strikes !== null && g.balls !== null) return { ...g, index: i };
  }
  return null;
}

/** 주자 표시: 스트라이크 수만큼 1루부터 나가고, 다 맞히면 홈까지 */
export function BaseDiamond({
  strikes,
  digits,
  className,
}: {
  strikes: number;
  digits: number;
  className?: string;
}) {
  const homerun = strikes === digits;
  // 1루(오른쪽)·2루(위)·3루(왼쪽)
  const bases = [
    { x: 30, y: 20, on: strikes >= 1 },
    { x: 20, y: 10, on: strikes >= 2 },
    { x: 10, y: 20, on: strikes >= 3 },
  ];
  return (
    <svg viewBox="0 0 40 34" aria-hidden="true" className={className}>
      <path
        d="M20 30 L32 20 L20 8 L8 20 Z"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      {bases.map((b) => (
        <rect
          key={`${b.x}${b.y}`}
          x={b.x - 4}
          y={b.y - 4}
          width={8}
          height={8}
          transform={`rotate(45 ${b.x} ${b.y})`}
          fill={b.on || homerun ? "#fcd34d" : "rgba(255,255,255,0.12)"}
          stroke={b.on || homerun ? "#fde68a" : "rgba(255,255,255,0.25)"}
          strokeWidth={0.8}
        />
      ))}
      <path
        d="M16 28 H24 V31 L20 33.5 L16 31 Z"
        fill={homerun ? "#fcd34d" : "rgba(255,255,255,0.4)"}
      />
    </svg>
  );
}

/**
 * 야구장 전광판: 지금 몇 회 초·말인지, 마지막 답의 볼카운트와 주자,
 * 두 팀(선이 원정, 후공이 홈)의 회마다 스트라이크 수와 이긴 판 수.
 * 아래 줄에는 내 비밀 수, 남은 후보 수, 개인 시간
 */
export function Scoreboard({
  view,
  me,
  names,
  secret,
  secretNote,
  candidates,
}: {
  view: BaseballView;
  me: number;
  /** 자리마다 보일 이름 */
  names: string[];
  /** 내 비밀 수 줄(서로 맞히기) */
  secret: React.ReactNode;
  secretNote?: React.ReactNode;
  /** 지금까지 답과 맞는 후보 수(도움말을 켰을 때) */
  candidates: number | null;
}) {
  const digits = view.rules.digits;
  const puzzle = view.rules.mode === "puzzle";
  const inning = inningOf(view);
  const last = lastAnswered(view.guesses);
  const control = timeControlOf(view.rules);
  const order = puzzle ? [me] : [view.starter, 1 - view.starter];
  const perSeat = (seat: number) => view.guesses.filter((g) => g.seat === seat);
  const played = Math.max(...order.map((s) => perSeat(s).length), 0);
  const columns = Math.max(INNINGS, played);
  const table = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 회가 늘면 오른쪽 끝을 보인다
  useEffect(() => {
    const el = table.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [played]);

  const batting = inning?.batter ?? null;
  const headline =
    view.phase === "setup"
      ? "경기 전"
      : inning
        ? inningText(inning)
        : "경기 끝";
  const batterName =
    batting === null
      ? null
      : batting === me
        ? "내 공격"
        : `${names[batting]} 공격`;

  return (
    <section
      aria-label="전광판"
      className="scoreboard w-full overflow-hidden rounded-2xl border-[3px] border-zinc-700/80 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
    >
      <div className="flex items-center gap-3 border-white/10 border-b px-3 py-2 short-landscape:py-1">
        <div className="flex min-w-0 flex-col">
          <span
            data-inning={headline}
            className="flex items-center gap-1 font-black font-mono text-amber-300 text-lg leading-tight tracking-wider [text-shadow:0_0_6px_rgba(252,211,77,0.6)]"
          >
            {inning?.half === "top" && <span className="text-xs">▲</span>}
            {inning?.half === "bottom" && <span className="text-xs">▼</span>}
            {headline}
          </span>
          {batterName && (
            <span className="truncate text-[11px] text-white/60">
              {batterName}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <CountLamps
            strikes={last?.strikes ?? null}
            balls={last?.balls ?? null}
            digits={digits}
          />
          <BaseDiamond
            strikes={last?.strikes ?? 0}
            digits={digits}
            className="h-10 w-12 short-landscape:h-8 short-landscape:w-10"
          />
        </div>
      </div>

      <div ref={table} className="overflow-x-auto px-2 py-1.5">
        <table className="w-full border-separate border-spacing-x-0.5 font-mono text-xs">
          <thead>
            <tr className="text-[10px] text-white/45">
              <th className="w-full min-w-16 text-left font-normal">
                {puzzle ? "" : "팀"}
              </th>
              {Array.from({ length: columns }, (_, i) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: 회 번호가 곧 칸이다
                  key={i}
                  className="w-5 min-w-5 text-center font-normal"
                >
                  {i + 1}
                </th>
              ))}
              <th className="w-7 min-w-7 text-center font-normal text-amber-200/80">
                {puzzle ? "물음" : "승"}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.map((seat) => {
              const mine = perSeat(seat);
              const isBatting = batting === seat;
              return (
                <tr key={seat} data-team={seat === me ? "me" : "opponent"}>
                  <td className="max-w-0 py-0.5 pr-1">
                    <span className="flex items-center gap-1">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          isBatting
                            ? "bg-amber-300 shadow-[0_0_6px_#fcd34d]"
                            : "bg-transparent",
                        )}
                      />
                      <span
                        className={cn(
                          "truncate font-sans font-semibold",
                          isBatting ? "text-white" : "text-white/75",
                        )}
                      >
                        {names[seat]}
                      </span>
                    </span>
                  </td>
                  {Array.from({ length: columns }, (_, i) => {
                    const g = mine[i];
                    const pending = g && g.strikes === null;
                    const homerun = g && g.strikes === digits;
                    return (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: 회 번호가 곧 칸이다
                        key={i}
                        title={
                          g
                            ? `${i + 1}회 ${g.guess}${g.strikes === null ? "" : ` ${g.strikes}S ${g.balls}B`}`
                            : undefined
                        }
                        className={cn(
                          "h-5 rounded-sm bg-white/[0.04] text-center font-bold",
                          homerun
                            ? "bg-amber-300 text-black"
                            : g?.strikes
                              ? "text-amber-300"
                              : "text-white/40",
                          i === mine.length - 1 && !homerun && "bg-white/10",
                        )}
                      >
                        {g ? (pending ? "·" : homerun ? "H" : g.strikes) : ""}
                      </td>
                    );
                  })}
                  <td className="rounded-sm bg-amber-300/10 text-center font-black text-amber-300 text-sm">
                    {puzzle ? mine.length : (view.wins[seat] ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(secret || candidates !== null || control) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-white/10 border-t px-3 py-1.5 text-xs">
          {secret}
          {control &&
            view.clocks &&
            order.map((seat) =>
              view.clocks?.[seat] ? (
                <span key={seat} className="flex items-center gap-1">
                  <span className="text-white/60">
                    {seat === me ? "나" : names[seat]}
                  </span>
                  <GameClock
                    clock={view.clocks[seat]}
                    control={control}
                    running={view.phase === "play" && view.turn === seat}
                  />
                </span>
              ) : null,
            )}
          {candidates !== null && (
            <span
              data-candidates={candidates}
              className="ml-auto text-white/60"
            >
              남은 후보 <b className="font-mono text-amber-200">{candidates}</b>
              개
            </span>
          )}
          {secretNote}
        </div>
      )}
    </section>
  );
}

/** 판정 하나: 누가 물은 어떤 수에 어떤 답이 나왔나 */
export interface PitchCallInfo {
  /** 한 판에서 몇 번째 물음인가(guesses 번호)와 판 번호로 만든 열쇠 */
  id: string;
  kind: CallKind;
  guess: string;
  strikes: number;
  balls: number;
  digits: number;
  mine: boolean;
}

/** 판정이 보이는 시간(ms). 다음 판정이 기다리면 조금 줄인다 */
const CALL_MS = 1300;
const CALL_MS_BUSY = 800;
const CALL_MS_REDUCED = 900;

/** 판정 연출을 줄여야 하나(움직임 줄이기) */
function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * 답이 나오면 투구 → 심판 콜을 짧게 띄운다. 공이 날아와 미트에 꽂히고(0.2초)
 * "스트라이크!"·"볼!"·"아웃!"·"홈런!"이 튀어나왔다 사라진다. 누르기는 막지 않고,
 * 화면 읽기 프로그램에는 기록 줄이 같은 내용을 알려 주므로 숨긴다.
 * 움직임 줄이기에서는 공 없이 글자만 잠깐 보인다
 */
export function PitchCall({
  call,
  busy,
  onDone,
}: {
  call: PitchCallInfo;
  /** 뒤에 기다리는 판정이 있다 */
  busy: boolean;
  onDone: () => void;
}) {
  const [reduced] = useState(prefersReduced);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ms = reduced ? CALL_MS_REDUCED : busy ? CALL_MS_BUSY : CALL_MS;
    const id = setTimeout(() => done.current(), ms);
    return () => clearTimeout(id);
  }, [reduced, busy]);

  const color =
    call.kind === "homerun"
      ? "text-amber-300"
      : call.kind === "strike"
        ? "text-amber-200"
        : call.kind === "ball"
          ? "text-emerald-300"
          : "text-rose-400";
  const detail =
    call.kind === "homerun"
      ? `${call.digits}S`
      : call.kind === "out"
        ? "0S 0B"
        : `${call.strikes}S ${call.balls}B`;
  return (
    <div
      aria-hidden="true"
      data-call={call.kind}
      className="pointer-events-none fixed inset-x-0 top-[26%] z-40 flex justify-center px-4"
    >
      <div className="relative flex flex-col items-center">
        {call.kind === "homerun" && (
          <div className="homerun-rays absolute top-1/2 left-1/2 -mt-40 -ml-40 size-80 rounded-full" />
        )}
        <svg
          viewBox="0 0 20 20"
          className="pitch-ball absolute top-2 size-9"
          aria-hidden="true"
        >
          <circle cx={10} cy={10} r={9} fill="#f8fafc" stroke="#cbd5e1" />
          <path
            d="M5 3.5 Q9 10 5 16.5 M15 3.5 Q11 10 15 16.5"
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.1}
            strokeDasharray="1.4 1"
          />
        </svg>
        <div className="umpire-call flex flex-col items-center rounded-2xl border-2 border-white/15 bg-zinc-950/95 px-6 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <span className="text-[11px] text-white/60">
            {call.mine ? "내 물음" : "상대 물음"}{" "}
            <span className="font-mono text-white/85 tracking-widest">
              {call.guess}
            </span>
          </span>
          <span
            className={cn(
              "font-black text-4xl italic tracking-tight [text-shadow:0_0_14px_currentColor] sm:text-5xl",
              color,
            )}
          >
            {CALL_TEXT[call.kind]}
          </span>
          <span className="font-bold font-mono text-white/80 text-xs">
            {detail}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 새로 나온 답을 판정 연출 차례로 모은다. 처음 붙을 때(이어 하기) 있던 답은 띄우지 않는다 */
export function usePitchCalls(view: BaseballView | null, me: number) {
  const [queue, setQueue] = useState<PitchCallInfo[]>([]);
  const seen = useRef<{ round: number; count: number } | null>(null);
  const round = view?.roundNumber ?? 0;
  const guesses = view?.guesses;
  useEffect(() => {
    if (!guesses) return;
    const answered = guesses.filter((g) => g.strikes !== null).length;
    const prev = seen.current;
    seen.current = { round, count: answered };
    // 처음 보거나 판이 바뀌었거나 무르기로 줄었으면 띄우지 않는다.
    if (!prev || prev.round !== round || answered <= prev.count) {
      if (prev && (prev.round !== round || answered < prev.count)) setQueue([]);
      return;
    }
    const fresh: PitchCallInfo[] = [];
    let k = 0;
    guesses.forEach((g, i) => {
      if (g.strikes === null || g.balls === null) return;
      k++;
      if (k <= prev.count) return;
      fresh.push({
        id: `${round}:${i}`,
        kind: callOf(g.strikes, g.balls, g.guess.length),
        guess: g.guess,
        strikes: g.strikes,
        balls: g.balls,
        digits: g.guess.length,
        mine: g.seat === me,
      });
    });
    // 너무 밀리지 않게 둘까지만 기다린다.
    setQueue((q) => [...q, ...fresh].slice(-2));
  }, [guesses, round, me]);
  const current = queue[0] ?? null;
  return {
    current,
    busy: queue.length > 1,
    next: () => setQueue((q) => q.slice(1)),
  };
}

/** 잔디 위 내야(흙과 안쪽 잔디, 파울선). 화면 아래에 깔리는 꾸밈이다. 베이스는 숫자 패드와 겹쳐 보여 그리지 않는다 */
export function Infield({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 260"
      aria-hidden="true"
      className={cn("pointer-events-none", className)}
    >
      <defs>
        <radialGradient id="bb-dirt" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#a16207" stopOpacity={0.55} />
          <stop offset="70%" stopColor="#78350f" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#78350f" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* 내야 흙 */}
      <path d="M200 250 L360 110 Q200 -40 40 110 Z" fill="url(#bb-dirt)" />
      {/* 내야 잔디 */}
      <path
        d="M200 215 L290 135 L200 55 L110 135 Z"
        fill="#166534"
        opacity={0.7}
      />
      {/* 파울선 */}
      <path
        d="M200 250 L400 75 M200 250 L0 75"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
