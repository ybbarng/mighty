"use client";

import { cardOf, sortCards } from "@mighty/hwatu";
import {
  floorMatches,
  type MinhwatuView,
  type RoundResult,
  sumPoints,
  type TurnRecord,
  YAK_NAMES,
  yaksOf,
} from "@mighty/minhwatu-engine";
import { type ReactNode, useEffect, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import {
  HwatuBacks,
  HwatuCaptured,
  HwatuDeck,
  HwatuFloor,
} from "@/hwatu/components/HwatuLayout";
import { cn } from "@/lib/cn";

import { MINHWATU_LEVELS } from "../settings";
import { useMinhwatu } from "../store";

/** 민화투 화면 바탕 */
export const MINHWATU_BG =
  "bg-[radial-gradient(ellipse_at_top,#166534_0%,#052e16_75%)]";

/** 화면 크기에 맞춘 카드 너비(px). 미리 그린 HTML은 PC 크기다 */
function useCardSizes(handLength: number) {
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const update = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const { w, h } = size;
  const shortLandscape = w > h && h <= 600;
  const n = Math.max(handLength, 5);
  if (shortLandscape) {
    // 높이가 모자라 카드를 작게 둔다(손패 높이 ≈ 너비 × 1.6)
    const hand = Math.min(44, Math.floor((h - 260) / 1.6));
    return { hand: Math.max(30, hand), floor: 30, captured: 15, back: 13 };
  }
  if (w < 640) {
    const hand = Math.min(56, Math.floor((w - 32 - (n - 1) * 4) / n));
    return {
      hand,
      floor: Math.min(42, Math.floor(w / 9.5)),
      captured: 17,
      back: 13,
    };
  }
  return { hand: 60, floor: 52, captured: 22, back: 18 };
}

/** 이 자리의 이름 */
export function useSeatName(view: MinhwatuView | null) {
  const seatNames = useMinhwatu((s) => s.seatNames);
  const botNames = useSettings((s) => s.botNames);
  return (seat: number) =>
    view && seat === view.seat
      ? "나"
      : (seatNames?.[seat] ?? botName(botNames, seat));
}

/** 방금 한 차례를 한 줄로 */
function turnText(turn: TurnRecord, name: (seat: number) => string): string {
  const parts = [`${name(turn.seat)}: ${cardOf(turn.played).name}`];
  parts.push(
    turn.playTook.length > 0
      ? `→ ${turn.playTook.length}장 먹음`
      : "→ 바닥에 놓음",
  );
  if (turn.flipped) {
    parts.push(`· 뒤집어 ${cardOf(turn.flipped).name}`);
    if (turn.flipTook.length > 0)
      parts.push(`→ ${turn.flipTook.length}장 먹음`);
  }
  return parts.join(" ");
}

/** 먹은 패 요약: 카드 점수와 이룬 약 */
function CapturedSummary({ view, seat }: { view: MinhwatuView; seat: number }) {
  const ids = view.captured[seat] ?? [];
  const yaks = yaksOf(ids, view.rules);
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      <span className="tabular-nums" data-points={sumPoints(ids)}>
        {sumPoints(ids)}점
      </span>
      {yaks.map((y) => (
        <span
          key={y.id}
          className="rounded bg-amber-300 px-1 font-bold text-[10px] text-black"
        >
          {YAK_NAMES[y.id]}
        </span>
      ))}
    </span>
  );
}

/** 상대 한 사람: 이름·손패 장수·먹은 패 */
function Opponent({
  view,
  seat,
  name,
  cardWidth,
  backWidth,
}: {
  view: MinhwatuView;
  seat: number;
  name: string;
  cardWidth: number;
  backWidth: number;
}) {
  const turn =
    (view.phase === "play" || view.phase === "pick") && view.turn === seat;
  return (
    <section
      aria-label={`${name} 자리`}
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border px-2 py-1.5",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-black/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-semibold text-sm">{name}</span>
        {view.dealer === seat && (
          <span className="rounded bg-white/15 px-1 text-[10px]">선</span>
        )}
        <CapturedSummary view={view} seat={seat} />
        <span className="ml-auto shrink-0">
          <HwatuBacks count={view.handCounts[seat] ?? 0} width={backWidth} />
        </span>
        <span className="shrink-0 text-[10px] text-white/60 tabular-nums">
          {view.handCounts[seat] ?? 0}장
        </span>
      </div>
      <HwatuCaptured
        piCount="cards"
        ids={view.captured[seat] ?? []}
        width={cardWidth}
        label={name}
      />
    </section>
  );
}

/** 판 점수표: 자리마다 광·열끗·띠, 약 주고받기, 본, 판 점수, 합계 */
export function ScoreTable({
  result,
  totals,
  name,
}: {
  result: RoundResult;
  totals: readonly number[];
  name: (seat: number) => string;
}) {
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  return (
    <table className="mt-2 w-full text-xs tabular-nums [&_td]:px-1 [&_td]:text-right [&_th]:px-1 [&_th]:text-right">
      <thead className="text-white/60">
        <tr>
          <th className="!text-left font-normal">이름</th>
          <th className="font-normal">광</th>
          <th className="font-normal">열끗</th>
          <th className="font-normal">띠</th>
          <th className="font-normal">약</th>
          <th className="font-normal">본</th>
          <th className="font-normal">판</th>
          <th className="font-normal">합계</th>
        </tr>
      </thead>
      <tbody>
        {result.scores.map((s, seat) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            data-seat-score={seat}
            className={cn(result.winners.includes(seat) && "text-amber-200")}
          >
            <td className="!text-left">
              {name(seat)}
              {s.yaks.length > 0 && (
                <span className="ml-1 text-[10px] text-amber-300">
                  {s.yaks.map((y) => YAK_NAMES[y.id]).join("·")}
                </span>
              )}
            </td>
            <td>{s.gwang}</td>
            <td>{s.animal}</td>
            <td>{s.ribbon}</td>
            <td>{signed(s.yakNet)}</td>
            <td>−{s.base}</td>
            <td className="font-bold">{signed(s.total)}</td>
            <td>{signed(totals[seat] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 내 손패. 마우스는 올리면 짝이 보이고 누르면 낸다. 터치는 한 번 눌러 겨누고 다시 눌러 낸다 */
function MyHand({
  ids,
  width,
  enabled,
  selected,
  onPreview,
  onAct,
}: {
  ids: readonly string[];
  width: number;
  enabled: boolean;
  selected: string | null;
  onPreview: (id: string | null) => void;
  onAct: (id: string, touch: boolean) => void;
}) {
  const [touch, setTouch] = useState(false);
  return (
    <section
      aria-label="내 손패"
      className="flex flex-wrap justify-center gap-1 pt-2"
    >
      {sortCards(ids).map((id) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 누르기는 안쪽 카드 단추가 받고, 여기서는 마우스 올림(미리 보기)과 누른 도구(터치·마우스)만 본다
        <span
          key={id}
          className="inline-flex"
          onPointerDown={(e) => setTouch(e.pointerType !== "mouse")}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && enabled) onPreview(id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") onPreview(null);
          }}
          onFocus={() => enabled && onPreview(id)}
        >
          <HwatuCardView
            id={id}
            width={width}
            selected={selected === id}
            dim={!enabled}
            {...(enabled ? { onClick: () => onAct(id, touch) } : {})}
          />
        </span>
      ))}
    </section>
  );
}

/** 대국 화면 */
export function MinhwatuTable({
  onExit,
  mission,
  hints = false,
}: {
  onExit: () => void;
  /** 튜토리얼 미션이면 목표 띠를 얹는다 */
  mission?: MissionProps;
  /** 추천 카드를 보인다(튜토리얼 실전) */
  hints?: boolean;
}) {
  const { view, host, local, notice, level, reconnecting, hostLeft, events } =
    useMinhwatu();
  const submit = useMinhwatu((s) => s.submit);
  const undo = useMinhwatu((s) => s.undo);
  const canUndo = useMinhwatu((s) => s.canUndo());
  const clearNotice = useMinhwatu((s) => s.clearNotice);
  const name = useSeatName(view);
  const sizes = useCardSizes(view?.hand.length ?? 7);
  /** 터치로 겨눈 카드, 또는 같은 달 둘 중 고르기를 기다리는 카드 */
  const [selected, setSelected] = useState<string | null>(null);
  const [needTarget, setNeedTarget] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 차례가 바뀌면 고른 카드를 놓는다.
  const turnKey = `${view?.roundNumber}-${view?.hand.length}-${view?.phase}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 차례가 바뀔 때만 푼다
  useEffect(() => {
    setSelected(null);
    setNeedTarget(false);
    setPreview(null);
  }, [turnKey]);

  if (!view || !host) return null;
  const me = view.seat;
  const n = view.handCounts.length;
  const online = local === null;
  const myPlay = view.decision?.kind === "play";
  const myPick = view.decision?.kind === "pick";
  const levelName = MINHWATU_LEVELS.find((l) => l.value === level)?.label ?? "";
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);

  // 바닥 강조: 고를 때는 고를 수 있는 패, 아니면 미리 보는 손패와 같은 달
  const focus = selected ?? preview;
  const targets = myPick
    ? (view.pending?.options ?? [])
    : focus && myPlay
      ? floorMatches(view.floor, focus)
      : [];

  const play = (card: string, target?: string) => {
    const result = submit({
      type: "play",
      card,
      ...(target ? { target } : {}),
    });
    if (result.ok) {
      setSelected(null);
      setNeedTarget(false);
    }
  };

  const onAct = (id: string, touch: boolean) => {
    if (!myPlay) return;
    // 터치: 처음 누르면 겨누기만 한다
    if (touch && selected !== id) {
      playUiCue("pickCard");
      setSelected(id);
      setNeedTarget(false);
      return;
    }
    const matches = floorMatches(view.floor, id);
    if (matches.length === 2) {
      setSelected(id);
      setNeedTarget(true);
      return;
    }
    play(id);
  };

  const onFloorPick = (target: string) => {
    if (myPick) {
      submit({ type: "pick", target });
      return;
    }
    if (myPlay && selected && targets.includes(target)) play(selected, target);
  };

  const result = view.result;
  const gameOver = view.phase === "gameOver";
  const over = view.phase === "roundEnd" || gameOver;

  let status: string;
  if (view.phase === "pick")
    status = myPick
      ? `뒤집은 ${cardOf(view.pending?.flipped ?? "01g").name}와 짝: 먹을 바닥 패를 고르세요`
      : `${name(view.turn)}가 먹을 패를 고르는 중`;
  else if (view.phase === "play")
    status = myPlay
      ? needTarget
        ? "같은 달 바닥 패가 둘이에요. 먹을 패를 누르세요"
        : selected
          ? "한 번 더 누르면 냅니다"
          : "내 차례 — 낼 패를 누르세요"
      : online
        ? `${name(view.turn)}의 차례`
        : `${name(view.turn)}(컴퓨터)가 생각하는 중…`;
  else if (view.retired) status = "게임을 끝냈어요";
  else if (gameOver) {
    const best = Math.max(...view.totals);
    const winners = view.totals.flatMap((t, s) => (t === best ? [s] : []));
    status = winners.includes(me)
      ? winners.length > 1
        ? "공동 1등!"
        : "게임 1등!"
      : `${winners.map(name).join("·")} 1등`;
  } else {
    const mine = result?.scores[me]?.total ?? 0;
    status = result?.winners.includes(me)
      ? `판 1등! ${mine > 0 ? "+" : ""}${mine}점`
      : `이번 판 ${mine > 0 ? "+" : ""}${mine}점`;
  }

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const roundEnded = events.find((e) => e.type === "roundEnded");
  const gameEnded = events.find((e) => e.type === "gameEnded");
  let banner: Banner | null = null;
  if (!mission && gameEnded?.type === "gameEnded" && !gameEnded.retired) {
    const top = gameEnded.winners;
    banner = {
      won: top.includes(me),
      ...(top.includes(me) && top.length > 1 ? { draw: true } : {}),
      detail: `합계 ${view.totals[me] ?? 0}점`,
    };
  } else if (!mission && roundEnded?.type === "roundEnded") {
    const top = roundEnded.result.winners;
    const mine = roundEnded.result.scores[me]?.total ?? 0;
    banner = {
      won: top.includes(me),
      ...(top.includes(me) && top.length > 1 ? { draw: true } : {}),
      detail: `${mine > 0 ? "+" : ""}${mine}점`,
    };
  }
  let outcome: Outcome | null = null;
  if (over && !view.retired) {
    const winners = gameOver
      ? view.totals.flatMap((t, s) =>
          t === Math.max(...view.totals) ? [s] : [],
        )
      : (result?.winners ?? []);
    outcome = winners.includes(me)
      ? winners.length > 1
        ? "draw"
        : "win"
      : "loss";
  }
  const summary: ReactNode = result ? (
    <ScoreTable result={result} totals={view.totals} name={name} />
  ) : null;

  const lastTurn = view.current ?? view.last;
  const hint =
    hints && myPlay
      ? view.hand.find((id) => floorMatches(view.floor, id).length > 0)
      : undefined;

  return (
    <main
      data-game="minhwatu"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-2 overflow-x-hidden px-3 py-3 text-white",
        "short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] short-landscape:grid-rows-[auto_auto_1fr_auto] short-landscape:items-start short-landscape:gap-x-3 short-landscape:py-2",
        MINHWATU_BG,
        mission && "pt-16 short-landscape:pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-3xl items-center gap-2 text-sm short-landscape:col-start-2 short-landscape:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 민화투
        </button>
        <span className="ml-auto text-white/60">
          {online ? "친구와" : `컴퓨터(${levelName})`} · {view.roundNumber}/
          {view.rules.rounds}판
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-3xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-start-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      <div
        className={cn(
          "grid w-full max-w-3xl gap-1.5 short-landscape:col-start-1 short-landscape:row-start-1",
          n === 4 ? "sm:grid-cols-3" : n === 3 ? "sm:grid-cols-2" : "",
          n >= 3 &&
            "short-landscape:grid-cols-[repeat(auto-fit,minmax(0,1fr))]",
        )}
      >
        {others.map((seat) => (
          <Opponent
            key={seat}
            view={view}
            seat={seat}
            name={name(seat)}
            cardWidth={sizes.captured}
            backWidth={sizes.back}
          />
        ))}
      </div>

      <section
        aria-label="판"
        className="relative flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-black/15 p-2 short-landscape:col-start-1 short-landscape:row-start-2 short-landscape:row-span-2 short-landscape:min-h-0"
      >
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0 flex-1">
            <HwatuFloor
              ids={view.floor}
              width={sizes.floor}
              highlight={(id) => targets.includes(id)}
              {...(myPick || needTarget ? { onPick: onFloorPick } : {})}
            />
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <HwatuDeck count={view.deckCount} width={sizes.floor * 0.8} />
            {view.pending && (
              <div className="flex flex-col items-center gap-0.5 text-[10px] text-amber-200">
                <HwatuCardView
                  id={view.pending.flipped}
                  width={sizes.floor * 0.8}
                  highlight
                />
                뒤집은 패
              </div>
            )}
          </div>
        </div>
        <p
          aria-live="polite"
          className="min-h-4 text-center text-white/75 text-xs"
        >
          {lastTurn ? turnText(lastTurn, name) : ""}
        </p>
        <ResultBanner
          banner={banner}
          seq={view.roundNumber * 2 + (gameOver ? 1 : 0)}
        />
      </section>

      <section
        aria-label="내 먹은 패"
        className="flex w-full max-w-3xl items-center gap-2 short-landscape:col-start-2 short-landscape:row-start-2"
      >
        <div className="flex shrink-0 flex-col items-start gap-0.5">
          <span className="font-semibold text-sm">
            나
            {view.dealer === me && (
              <span className="ml-1 rounded bg-white/15 px-1 text-[10px]">
                선
              </span>
            )}
          </span>
          <CapturedSummary view={view} seat={me} />
        </div>
        <HwatuCaptured
          piCount="cards"
          ids={view.captured[me] ?? []}
          width={sizes.captured + 2}
          label="나"
        />
      </section>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={summary}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <div className="w-full max-w-3xl short-landscape:col-start-1 short-landscape:row-start-4">
        <MyHand
          ids={view.hand}
          width={sizes.hand}
          enabled={myPlay}
          selected={selected}
          onPreview={setPreview}
          onAct={onAct}
        />
        {hint && (
          <p className="mt-1 text-center text-amber-200 text-xs">
            추천: {cardOf(hint).name}(바닥에 짝이 있어요)
          </p>
        )}
      </div>

      <div className="flex w-full max-w-3xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4">
        {!over && !online && !mission && (
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => {
              setSelected(null);
              undo();
            }}
            className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
          >
            무르기
          </button>
        )}
        {!over && !online && !mission && (
          <button
            type="button"
            onClick={() => submit({ type: "retire" })}
            className="rounded-xl bg-white/10 px-4 py-2"
          >
            그만하기
          </button>
        )}
        {view.phase === "roundEnd" && !view.continued[me] && (
          <button
            type="button"
            onClick={() => submit({ type: "continue" })}
            className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
          >
            다음 판
          </button>
        )}
        {view.phase === "roundEnd" && view.continued[me] && (
          <span className="py-2 text-sm text-white/70">
            다른 사람을 기다리는 중…
          </span>
        )}
        {gameOver && !mission && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
            <a href="/" className="rounded-xl bg-white/10 px-4 py-2">
              게임 목록
            </a>
          </>
        )}
      </div>

      {online && (
        <div className="w-full max-w-3xl short-landscape:col-start-2">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}
