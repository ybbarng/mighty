"use client";

import {
  BAK_NAMES,
  type GameEvent,
  type GostopView,
  goThreshold,
  type Settlement,
  SPECIAL_NAMES,
  settlementLines,
} from "@mighty/gostop-engine";
import { cardOf, MONTH_NAMES, monthOf } from "@mighty/hwatu";
import { useEffect, useState } from "react";

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
  HwatuCaptured,
  HwatuDeck,
  HwatuFloor,
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";
import { HwatuFairBar } from "@/hwatu/fair-bar";
import { useSentLock } from "@/hwatu/sent-lock";
import { cn } from "@/lib/cn";

import { GOSTOP_LEVELS } from "../settings";
import { useGostop } from "../store";
import { type CardSizes, useCardSizes } from "./sizes";

/** 이름 고르기: 온라인은 방 이름, 혼자 하기는 나·컴퓨터 이름 */
export function useSeatName(me: number): (seat: number) => string {
  const seatNames = useGostop((s) => s.seatNames);
  const botNames = useSettings((s) => s.botNames);
  return (seat) =>
    seat === me ? "나" : (seatNames?.[seat] ?? botName(botNames, seat));
}

/** 자리 표: 이름, 손패 장수, 지금 점수, 고·흔들기·뻑, 게임 점수, 먹은 패 */
function SeatPanel({
  view,
  seat,
  name,
  sizes,
  mine = false,
}: {
  view: GostopView;
  seat: number;
  name: string;
  sizes: CardSizes;
  mine?: boolean;
}) {
  const turn = view.phase === "play" && view.turn === seat;
  const tags = [
    view.dealer === seat ? "선" : null,
    view.goCount[seat] ? `${view.goCount[seat]}고` : null,
    view.shakes[seat] ? `흔들 ${view.shakes[seat]}` : null,
    view.ppeok[seat] ? `뻑 ${view.ppeok[seat]}` : null,
  ].filter(Boolean);
  return (
    <section
      aria-label={`${name} 자리`}
      data-seat={seat}
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border px-2 py-1.5",
        turn
          ? "border-amber-300 bg-amber-300/10"
          : "border-white/10 bg-black/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="truncate font-semibold text-sm">{name}</span>
        {!mine && (
          // 뒷면을 겹쳐 늘어놓으면 좁은 화면에서 이름을 가린다. 한 장과 장수만 보인다.
          <span
            role="img"
            aria-label={`뒷면 ${view.handCounts[seat] ?? 0}장`}
            className="flex items-center gap-1 text-white/80"
          >
            <HwatuCardView faceDown width={sizes.backs} />
            <span aria-hidden="true" className="tabular-nums">
              ×{view.handCounts[seat] ?? 0}
            </span>
          </span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="rounded bg-white/15 px-1 text-[10px] text-white/90"
          >
            {t}
          </span>
        ))}
        <span className="ml-auto whitespace-nowrap tabular-nums text-white/80">
          <b data-live-score={seat} className="text-amber-200">
            {view.liveScores[seat] ?? 0}점
          </b>{" "}
          · 합 {view.scores[seat] ?? 0}
        </span>
      </div>
      {(view.revealed[seat]?.length ?? 0) > 0 && !mine && (
        <div className="flex items-center gap-1 text-[10px] text-white/70">
          흔들어 보인 패
          {view.revealed[seat]?.map((id) => (
            <HwatuCardView key={id} id={id} width={sizes.backs + 4} />
          ))}
        </div>
      )}
      <HwatuCaptured
        ids={view.captured[seat] ?? []}
        width={sizes.captured}
        label={name}
      />
    </section>
  );
}

/** 지난 걸음 한 줄 요약: 누가 무엇을 내고 무엇을 뒤집었나, 뻑·쪽… */
function lastStepText(
  events: readonly GameEvent[],
  name: (seat: number) => string,
): string | null {
  const parts: string[] = [];
  for (const e of events) {
    if (e.type === "played")
      parts.push(
        `${name(e.seat)}: ${cardOf(e.card).name}${e.shake ? " 흔들기" : ""}`,
      );
    else if (e.type === "bombed")
      parts.push(
        `${name(e.seat)}: ${MONTH_NAMES[monthOf(e.cards[0] as string)]} 폭탄`,
      );
    else if (e.type === "flipOnly") parts.push(`${name(e.seat)}: 뒤집기만`);
    else if (e.type === "flipped") parts.push(`뒤집기 ${cardOf(e.card).name}`);
    else if (e.type === "special") parts.push(`${SPECIAL_NAMES[e.kind]}!`);
    else if (e.type === "stolen")
      parts.push(`${name(e.from)} → ${name(e.to)} 피 한 장`);
    else if (e.type === "go") parts.push(`${name(e.seat)} ${e.count}고!`);
    else if (e.type === "stopped") parts.push(`${name(e.seat)} 스톱!`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 판 끝 정산 상자: 점수 내역, 박, 자리마다 점수 변화 */
function SettlementBox({
  s,
  name,
  players,
  className,
}: {
  s: Settlement;
  name: (seat: number) => string;
  players: number;
  className?: string;
}) {
  return (
    <section
      aria-label="판 정산"
      className={cn(
        "w-full max-w-xl rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm",
        className,
      )}
    >
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {settlementLines(s).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <ul className="mt-2 flex flex-col gap-0.5">
        {Array.from({ length: players }, (_, seat) => {
          const baks = s.baks[seat] ?? [];
          const delta = s.deltas[seat] ?? 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            <li key={seat} className="flex justify-between gap-2">
              <span>
                {name(seat)}
                {baks.length > 0 && (
                  <span className="ml-1 text-rose-300">
                    {baks.map((b) => BAK_NAMES[b]).join("·")}
                  </span>
                )}
                {s.payer === seat && (
                  <span className="ml-1 text-rose-300">(독박)</span>
                )}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  delta > 0 && "text-amber-300",
                  delta < 0 && "text-white/70",
                )}
              >
                {delta > 0 ? `+${delta}` : delta}점
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 가운데에 띄우는 물음 창(고·스톱, 고르기, 흔들기·폭탄) */
function Prompt({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-label={label}
        className="pop-in flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-amber-300/50 bg-[#0a3622] p-4 text-center shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

/** 대국 화면 */
export function GostopTable({
  onExit,
  mission,
}: {
  onExit: () => void;
  /** 튜토리얼 미션이면 목표 띠를 얹는다 */
  mission?: MissionProps;
}) {
  const {
    view,
    host,
    local,
    notice,
    level,
    reconnecting,
    hostLeft,
    events,
    seq,
  } = useGostop();
  const submit = useGostop((s) => s.submit);
  const undo = useGostop((s) => s.undo);
  const canUndo = useGostop((s) => s.canUndo());
  const clearNotice = useGostop((s) => s.clearNotice);
  const sizes = useCardSizes();
  const [selected, setSelected] = useState<string | null>(null);
  /** 흔들기·폭탄을 물을 카드 */
  const [asking, setAsking] = useState<string | null>(null);
  /** 보낸 행동의 결과(다음 장면이나 거절)를 기다리는 동안은 결정을 다시 보이지 않는다 */
  const sent = useSentLock(seq, notice);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 새 장면이 오면 고른 카드를 놓는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장면 번호가 바뀔 때만 푼다
  useEffect(() => {
    setSelected(null);
    setAsking(null);
  }, [seq]);

  const name = useSeatName(view?.mySeat ?? 0);
  if (!view || !host) return null;
  const me = host.seat;
  const n = view.rules.players;
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const online = local === null;
  // 행동을 보낸 뒤 다음 장면이 오기 전에는 손패·물음 창·단추를 닫는다(두 번 내기 방지)
  const d = sent.waiting ? null : view.decision;
  const myPlay = d?.kind === "play" ? d : null;
  const levelName = GOSTOP_LEVELS.find((l) => l.value === level)?.label ?? "";
  const result = view.result;
  const ended = view.phase !== "play" && result !== null;

  /** 행동을 보낸다. 받아들여지면 다음 장면이 올 때까지 화면을 잠그고, 고른 카드와 물음 창을 닫는다 */
  const send = (action: Parameters<typeof submit>[0]) => {
    const result = submit(action);
    if (result.ok) {
      sent.mark();
      setSelected(null);
      setAsking(null);
    }
  };
  const play = (card: string, extra?: { shake?: true; bomb?: boolean }) => {
    if (extra?.bomb) send({ type: "bomb", month: monthOf(card) });
    else send({ type: "play", card, ...(extra?.shake ? { shake: true } : {}) });
  };
  /** 손패를 누른다: 처음엔 고르고(짝 맞는 바닥 강조), 다시 누르면 낸다 */
  const pick = (card: string) => {
    if (!myPlay) return;
    if (selected !== card) {
      playUiCue("click");
      setSelected(card);
      return;
    }
    const canShake = myPlay.shakeable.includes(card);
    const canBomb = myPlay.bombs.includes(monthOf(card));
    if (canShake || canBomb) setAsking(card);
    else play(card);
  };

  let status: string;
  if (view.phase === "play") {
    if (sent.waiting) status = "보내는 중…";
    else if (d?.kind === "play")
      status = selected
        ? "한 번 더 누르면 냅니다"
        : d.cards.length === 0
          ? "뒤집기만 하세요"
          : "내 차례 — 낼 카드를 고르세요";
    else if (d?.kind === "choose") status = "먹을 바닥 카드를 고르세요";
    else if (d?.kind === "goStop") status = `${d.score}점! 고 또는 스톱`;
    else status = `${name(view.turn)} 차례…`;
  } else if (result?.winner === me)
    status = result.kind === "chongtong" ? "총통으로 이겼어요!" : "이겼어요!";
  else if (result?.winner === null) status = "나가리";
  else status = `${name(result?.winner ?? 0)} 승리`;

  // 판이 막 끝난 장면이면 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const endedNow = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    endedNow?.type === "roundEnded" && !mission
      ? {
          won: endedNow.settlement.winner === me,
          ...(endedNow.settlement.winner === null ? { draw: true } : {}),
          detail:
            endedNow.settlement.winner === null
              ? "다음 판 두 배"
              : `${(endedNow.settlement.deltas[me] ?? 0) > 0 ? "+" : ""}${endedNow.settlement.deltas[me] ?? 0}점`,
        }
      : null;
  const outcome: Outcome | null = !ended
    ? null
    : result?.winner === null
      ? "draw"
      : result?.winner === me
        ? "win"
        : "loss";

  const highlightMonth =
    d?.kind === "play" && selected ? monthOf(selected) : null;
  const chooseOptions = d?.kind === "choose" ? d.options : [];
  const pendingCard = view.pending?.card ?? null;
  const pendingFlip =
    view.pending && d?.kind === "choose" && view.pending.flipped;
  const last = lastStepText(events, name);
  const threshold = goThreshold(view.rules);

  return (
    <main
      data-game="gostop"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-2 overflow-x-hidden bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] px-3 py-2 text-white",
        "short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] short-landscape:content-start short-landscape:items-start short-landscape:gap-x-3",
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-3xl items-center gap-2 text-sm short-landscape:col-span-2">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 고스톱
        </button>
        <span className="ml-auto text-right text-white/60 text-xs">
          {n === 2 ? "맞고" : "3명"} · {view.roundNumber}/{view.rules.rounds}판
          · {threshold}점부터 고
          {view.nagari > 0 ? ` · 나가리 ×${2 ** view.nagari}` : ""}
          {online ? "" : ` · ${levelName}`}
        </span>
      </header>

      {online && <HwatuFairBar me={me} over={view.phase === "gameOver"} />}
      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-3xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      <div className="flex w-full max-w-3xl flex-col gap-2 short-landscape:col-start-1">
        <div
          className={cn(
            "grid w-full gap-2",
            others.length === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {others.map((seat) => (
            <SeatPanel
              key={seat}
              view={view}
              seat={seat}
              name={name(seat)}
              sizes={sizes}
            />
          ))}
        </div>

        {/* 바닥과 더미. 판 끝 띠는 이 상자 가운데에 뜬다 */}
        <div className="relative flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/15 p-2">
          <div className="flex flex-col items-center gap-1">
            <HwatuDeck count={view.deckCount} width={sizes.deck} />
            {pendingCard && d?.kind === "choose" && (
              <div className="flex flex-col items-center text-[10px] text-white/70">
                {pendingFlip ? "뒤집은 카드" : "낸 카드"}
                <HwatuCardView
                  id={
                    pendingFlip
                      ? (view.pending?.flipped ?? pendingCard)
                      : pendingCard
                  }
                  width={sizes.deck}
                  selected
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <HwatuFloor
              ids={view.floor}
              width={sizes.floor}
              highlight={(id) =>
                chooseOptions.length > 0
                  ? chooseOptions.includes(id)
                  : highlightMonth !== null && monthOf(id) === highlightMonth
              }
              {...(chooseOptions.length > 0
                ? {
                    onPick: (id: string) => send({ type: "choose", card: id }),
                  }
                : {})}
            />
            {view.stacks.length > 0 && (
              <p className="mt-1 text-center text-[10px] text-white/60">
                뻑:{" "}
                {view.stacks
                  .map(
                    (x) =>
                      `${MONTH_NAMES[x.month]}${x.owner === null ? "" : `(${name(x.owner)})`}`,
                  )
                  .join(", ")}
              </p>
            )}
          </div>
          <ResultBanner banner={banner} seq={seq} />
        </div>
        <p
          aria-live="off"
          data-last-step
          className="min-h-4 text-center text-[11px] text-white/70"
        >
          {last ?? ""}
        </p>
        {/* 휴대폰 가로는 오른쪽 칸이 낮아 정산을 왼쪽(바닥 아래)에 둔다 */}
        {ended && result && (
          <SettlementBox
            s={result}
            name={name}
            players={n}
            className="hidden self-center short-landscape:block"
          />
        )}
      </div>

      <div className="flex w-full max-w-3xl flex-col items-center gap-2 short-landscape:col-start-2 short-landscape:row-start-2 short-landscape:row-span-3">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={
            result
              ? `나 ${view.scores[me] ?? 0}점 · ${others.map((s) => `${name(s)} ${view.scores[s] ?? 0}점`).join(" · ")}`
              : undefined
          }
        />
        {ended && result && (
          <SettlementBox
            s={result}
            name={name}
            players={n}
            className="short-landscape:hidden"
          />
        )}

        <div className="w-full">
          <SeatPanel view={view} seat={me} name="나" sizes={sizes} mine />
        </div>

        <HwatuHand
          ids={view.hand}
          width={sizes.hand}
          overlap={sizes.overlap}
          selected={selected}
          playable={() => myPlay !== null}
          onSelect={pick}
        />

        <div className="flex flex-wrap justify-center gap-2">
          {myPlay && selected && (
            <button
              type="button"
              onClick={() => pick(selected)}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              내기
            </button>
          )}
          {myPlay?.flip && (
            <button
              type="button"
              onClick={() => send({ type: "flip" })}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              뒤집기만
            </button>
          )}
          {view.phase === "play" && !online && !mission && (
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
          {view.phase === "roundEnd" && !view.continued[me] && (
            <button
              type="button"
              onClick={() => send({ type: "continue" })}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다음 판
            </button>
          )}
          {view.phase === "gameOver" && !mission && (
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
          <div className="w-full">
            <ChatBox mySeat={me} />
          </div>
        )}
      </div>

      {d?.kind === "goStop" && (
        <Prompt label="고 또는 스톱">
          <p className="font-black text-3xl text-amber-300">{d.score}점</p>
          <p className="text-sm text-white/80">
            {d.goCount > 0 ? `지금 ${d.goCount}고. ` : ""}
            고를 부르면 더 하고(점수 덤·두 배), 지면 고박입니다. 스톱하면 지금
            점수로 이깁니다.
          </p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => send({ type: "go" })}
              className="flex-1 rounded-xl bg-rose-600 py-3 font-black text-xl"
            >
              고
            </button>
            <button
              type="button"
              onClick={() => send({ type: "stop" })}
              className="flex-1 rounded-xl bg-amber-300 py-3 font-black text-black text-xl"
            >
              스톱
            </button>
          </div>
        </Prompt>
      )}

      {d?.kind === "choose" && (
        <Prompt label="먹을 카드 고르기">
          <p className="text-sm">
            같은 달이 바닥에 둘 있어요. 어느 카드를 먹을까요?
          </p>
          <div className="flex gap-3">
            {d.options.map((id) => (
              <HwatuCardView
                key={id}
                id={id}
                width={64}
                highlight
                onClick={() => send({ type: "choose", card: id })}
              />
            ))}
          </div>
        </Prompt>
      )}

      {asking && myPlay && (
        <Prompt label="흔들기·폭탄">
          <p className="text-sm">
            {myPlay.bombs.includes(monthOf(asking))
              ? `${MONTH_NAMES[monthOf(asking)]} 석 장을 들고 바닥에 한 장이 있어요. 폭탄으로 넉 장을 다 먹고 점수를 두 배로 할까요?`
              : `${MONTH_NAMES[monthOf(asking)]} 석 장을 들고 있어요. 흔들어 보이고 점수를 두 배로 할까요?`}
          </p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() =>
                myPlay.bombs.includes(monthOf(asking))
                  ? play(asking, { bomb: true })
                  : play(asking, { shake: true })
              }
              className="flex-1 rounded-xl bg-rose-600 py-2 font-bold"
            >
              {myPlay.bombs.includes(monthOf(asking)) ? "폭탄" : "흔들기"}
            </button>
            <button
              type="button"
              onClick={() => play(asking)}
              className="flex-1 rounded-xl bg-white/15 py-2"
            >
              한 장만 내기
            </button>
          </div>
        </Prompt>
      )}
    </main>
  );
}
