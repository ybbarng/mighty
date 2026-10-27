"use client";

import type { Card } from "@mighty/engine";
import {
  type Decision,
  type PlayerView,
  passTarget,
  QUEEN_OF_SPADES,
} from "@mighty/hearts-engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { DealAnimation } from "@/components/DealAnimation";
import { FairOverlays, FairStatus } from "@/components/FairOverlays";
import { useHandControls } from "@/components/hand-controls";
import { OpenHand } from "@/components/OpenHand";
import { PlayingCard } from "@/components/PlayingCard";
import { ActionButton, Panel } from "@/components/panels/common";
import { ResultBanner } from "@/components/ResultBanner";
import { useRelayoutFade } from "@/components/relayout";
import { SuitText } from "@/components/SuitText";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { computeLayout, type Point } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";

import { canActHearts, HEARTS_DEAL_PATTERN, useHearts } from "../store";
import { directionLabel, sortHearts } from "../terms";
import { HeartsSettingsMenu } from "./HeartsSettingsMenu";
import { ScoreSheet } from "./ScoreSheet";

function useStageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

function tilt(card: Card): number {
  let h = 0;
  for (const ch of card) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h % 9) - 4;
}

type PlayDecision = Extract<Decision, { kind: "play" }>;

/** 하트 게임 화면 */
/** 미션 띠의 높이(두 줄일 때) */
const MISSION_BAND_H = 64;
/** 맞은편 자리 옆으로 좁힐 때 이보다 좁으면 읽기 어렵다 */
const MISSION_BAND_MIN_W = 220;

export function HeartsTable({
  onExit,
  mission,
  openHands = null,
  topInset = 0,
}: {
  onExit: () => void;
  /** 튜토리얼 미션 목표와 결과 안내 */
  mission?: MissionProps;
  /** 다시 보기: 다른 사람 손패를 앞면으로 펼친다(자리마다 정렬한 패) */
  openHands?: readonly (readonly Card[])[] | null;
  /** 다시 보기: 위에 막대가 있어 그 아래 공간에만 그린다(px) */
  topInset?: number;
}) {
  const insetStyle =
    topInset > 0
      ? { marginTop: topInset, height: `calc(100dvh - ${topInset}px)` }
      : undefined;
  const stage = useStageSize();
  const fade = useRelayoutFade(stage.width, stage.height);
  const view = useHearts((s) => s.view);
  const events = useHearts((s) => s.events);
  const seq = useHearts((s) => s.seq);
  const queue = useHearts((s) => s.queue);
  const shownTrick = useHearts((s) => s.shownTrick);
  const beforeTrick = useHearts((s) => s.beforeTrick);
  const roundResult = useHearts((s) => s.roundResult);
  const collecting = useHearts((s) => s.collecting);
  const dealing = useHearts((s) => s.dealing);
  const busy = useHearts((s) => s.busy);
  const notice = useHearts((s) => s.notice);
  const seatNames = useHearts((s) => s.seatNames);
  const network = useHearts((s) => s.network);
  const hostLeft = useHearts((s) => s.hostLeft);
  const reconnecting = useHearts((s) => s.reconnecting);
  const offlineSeats = useHearts((s) => s.offlineSeats);
  const invalid = useHearts((s) => s.invalid);
  const incident = useHearts((s) => s.incident);
  const shuffling = useHearts((s) => s.shuffling);
  const fair = useHearts((s) => s.fair);
  const endGame = useHearts((s) => s.endGame);
  const endVote = useHearts((s) => s.endVote);
  const voteEnd = useHearts((s) => s.voteEnd);
  const submit = useHearts((s) => s.submit);
  const clearNotice = useHearts((s) => s.clearNotice);
  const botNames = useSettings((s) => s.botNames);
  const chatOpen = useChat((s) => s.open);
  const setChatOpen = useChat((s) => s.setOpen);
  const chatUnread = useChat((s) => s.unread);

  const [passPick, setPassPick] = useState<Card[]>([]);
  // 넘기기를 누른 뒤 방장이 받았다고 알려 오기 전까지(온라인) 넘긴 카드
  const [sentPass, setSentPass] = useState<Card[] | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [showScores, setShowScores] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const controls = useHandControls();

  const phaseKey = `${view?.roundNumber}-${view?.phase}-${view?.trickIndex}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀔 때만 비운다
  useEffect(() => {
    setPassPick([]);
    setSentPass(null);
    setSelected(null);
  }, [phaseKey]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  if (!view)
    return <div ref={stage.ref} className="h-dvh w-full" style={insetStyle} />;

  const me = view.seat;
  const offsetOf = (seat: number) => (seat - me + 4) % 4;
  const seatName = (seat: number) =>
    seat === me
      ? "나"
      : (seatNames?.[seat] ?? botName(botNames, offsetOf(seat)));
  // 넘긴 카드는 모두 고를 때까지 엔진 손패에 남아 있다. 화면에서는 손패에서 빼 따로 보인다.
  const outgoing = view.phase === "passing" ? (view.myPass ?? sentPass) : null;
  const hand = sortHearts(view.hand).filter((c) => !outgoing?.includes(c));
  const layout =
    stage.width > 0
      ? computeLayout({
          width: stage.width,
          height: stage.height,
          playerCount: 4,
          handCount: Math.max(hand.length, 1),
        })
      : null;

  const acting = canActHearts({ queue, view, shownTrick, dealing });
  const decision = acting ? view.decision : null;
  const playable =
    decision?.kind === "play"
      ? new Set((decision as PlayDecision).cards)
      : null;
  const passing = decision?.kind === "pass" && outgoing === null;
  const trick = shownTrick ?? view.trick;
  const trickPlays = trick?.plays ?? [];
  const received = new Set(
    view.phase === "play" && view.trickIndex === 0 ? view.received : [],
  );
  // 받은 카드에는 첫 턴 동안만 "받음" 표를 단다.

  const plateCenter = (seat: number): Point => {
    if (!layout) return { x: 0, y: 0 };
    const s = layout.seats[offsetOf(seat)];
    if (!s) return { x: 0, y: 0 };
    return offsetOf(seat) === 0
      ? s.anchor
      : { x: s.plate.x + s.plate.w / 2, y: s.plate.y + s.plate.h / 2 };
  };
  const fanCard = layout
    ? (() => {
        const h = Math.min(
          56,
          Math.max(30, (layout.seats[1]?.plate.h ?? 40) * 1.05),
        );
        return { w: (h * 5) / 7, h };
      })()
    : { w: 0, h: 0 };
  const fanSlot = (seat: number, index: number, count: number) => {
    const p = layout?.seats[offsetOf(seat)]?.plate;
    if (!p) return { x: 0, y: 0, rotate: 0 };
    const mirrored = count - 1 - index;
    const centered = mirrored - (count - 1) / 2;
    const step =
      count > 1
        ? Math.min(fanCard.w * 0.42, (p.w * 0.85 - fanCard.w) / (count - 1))
        : 0;
    const towardTable =
      p.y + p.h / 2 < (layout ? layout.center.y + layout.center.h / 2 : 0)
        ? 1
        : -1;
    const edge = towardTable === 1 ? p.y + p.h : p.y;
    return {
      x: p.x + p.w / 2 + centered * step,
      y: edge + towardTable * (fanCard.h * 0.22 - Math.abs(centered) * 0.6),
      rotate: centered * 2.5 * -towardTable,
    };
  };
  const playedSlots = new Map<Card, number>();
  for (const e of events)
    if (e.type === "played" && e.slot !== null) playedSlots.set(e.card, e.slot);

  const tableCenter: Point = layout
    ? {
        x: layout.center.x + layout.center.w / 2,
        y: layout.center.y + layout.center.h / 2,
      }
    : { x: 0, y: 0 };
  // 미션 띠는 막대 바로 아래 가운데에 둔다. 맞은편 자리(낸 카드 포함)를 가리면
  // 가로 화면은 그 왼쪽 빈 곳으로 좁히고, 세로 화면은 그 아래로 내린다.
  const missionPlace = (() => {
    if (!layout) return { top: 0 };
    const below = layout.hud.y + layout.hud.h + 8;
    const plate = layout.seats[2]?.plate;
    const slot = layout.trick.slots[2];
    if (!plate || !slot) return { top: below };
    const { w, h } = layout.trick.card;
    const acrossTop = Math.min(plate.y, slot.y - h / 2);
    if (below + MISSION_BAND_H <= acrossTop) return { top: below };
    const width = Math.min(plate.x, slot.x - w / 2) - 2 * layout.gutter;
    if (stage.width > stage.height && width >= MISSION_BAND_MIN_W)
      return { top: below, span: { left: layout.gutter, width } };
    return { top: Math.max(plate.y + plate.h, slot.y + h / 2) + 8 };
  })();
  const myPile: Point = layout
    ? { x: stage.width / 2, y: layout.hand.slots[0]?.y ?? layout.hand.top }
    : { x: 0, y: 0 };
  // 내 왼쪽 사람부터 차례로 받는다.
  const dealTargets = [1, 2, 3, 0].map((offset) => {
    const seat = (me + offset) % 4;
    if (seat === me) return myPile;
    const { x, y } = fanSlot(seat, 0, 1);
    return { x, y };
  });

  const act = (action: Parameters<typeof submit>[0]) => {
    const result = submit(action);
    if (result.ok) {
      setSelected(null);
      setPassPick([]);
      if (action.type === "pass") setSentPass(action.cards);
    }
  };

  const playCard = (card: Card) =>
    act({ type: "play", card, slot: hand.indexOf(card) });
  controls.update({
    stage: stage.ref.current,
    hand,
    playable,
    selected,
    setSelected,
    canPlay: playable !== null && layout !== null,
    handTop: layout?.hand.top ?? 0,
    cardHeight: layout?.hand.card.h ?? 0,
    play: playCard,
    cancel: () => setSelected(null),
  });

  const onCard = (card: Card, pointer: string) => {
    // 훑거나 끈 것은 손을 뗄 때 따로 처리한다(useHandControls).
    if (controls.gestureMoved()) return;
    if (passing && decision?.kind === "pass") {
      playUiCue("pickCard");
      setPassPick((p) =>
        p.includes(card)
          ? p.filter((c) => c !== card)
          : p.length < decision.count
            ? [...p, card]
            : p,
      );
      return;
    }
    if (!playable) return;
    if (!playable.has(card)) {
      const leading = (decision as PlayDecision).leading;
      useHearts.setState({
        notice: leading
          ? view.trickIndex === 0
            ? "첫 턴은 ♣2로 시작합니다"
            : "하트가 깨지기 전에는 하트로 선을 잡을 수 없습니다"
          : view.trickIndex === 0
            ? "첫 턴에는 하트와 ♠Q를 낼 수 없습니다"
            : "선 무늬를 따라 내야 합니다",
      });
      playUiCue("invalid");
      return;
    }
    if (pointer === "touch" && selected !== card) {
      setSelected(card);
      return;
    }
    playCard(card);
  };

  // 게임 끝 승패 문구. 하트는 판마다 승패가 없어 게임이 끝날 때만 띄운다(누가 그만둬 끝나면 띄우지 않는다).
  // 마지막 트릭을 다 모은 뒤 store가 정한 판 결과로 띄운다.
  const over = roundResult?.events.find((e) => e.type === "gameOver");
  const banner: Banner | null =
    roundResult && over && over.type === "gameOver" && !over.retired
      ? {
          won: over.winners.includes(me),
          detail: `${roundResult.view.scores[me] ?? 0}점`,
        }
      : null;
  // 이긴 카드를 모으는 동안 점수는 그 트릭 전 값을 보인다.
  const plateView = beforeTrick ?? view;

  // 효과 글자
  const effect = (() => {
    for (const e of events) {
      if (e.type === "played" && e.card === QUEEN_OF_SPADES)
        return { text: `♠Q — ${seatName(e.seat)}`, tone: "red" as const };
      if (e.type === "heartsBroken")
        return { text: "하트가 깨졌습니다 ♥", tone: "red" as const };
      if (e.type === "passed")
        return {
          text:
            view.direction === "none"
              ? "이번 판은 넘기지 않습니다"
              : `${seatName(
                  view.players.find(
                    (s) => passTarget(s, view.direction) === me,
                  ) ?? me,
                )}에게서 ${view.received.length}장을 받았습니다`,
          tone: "info" as const,
        };
      if (e.type === "roundScored" && e.moonShooter !== null)
        return {
          text: `🌙 문 슛! ${seatName(e.moonShooter)}`,
          tone: "gold" as const,
        };
    }
    return null;
  })();

  const passTo =
    view.direction === "none" ? null : passTarget(me, view.direction);
  const showPanel =
    layout !== null &&
    dealing === null &&
    shownTrick === null &&
    trickPlays.length === 0;

  return (
    <div
      ref={stage.ref}
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)]",
        fade.className,
      )}
      style={{ ...insetStyle, ...fade.style }}
      {...controls.handlers}
    >
      {layout && (
        <>
          {/* HUD */}
          <div
            className="absolute flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl bg-black/35 px-3 text-sm"
            style={{
              left: layout.hud.x,
              top: layout.hud.y,
              width: layout.hud.w,
              height: layout.hud.h,
            }}
          >
            <span className="shrink-0 font-bold text-red-300">♥ 하트</span>
            {shuffling && !dealing && !incident ? (
              <span className="min-w-0 flex-1">
                <FairStatus shuffling={shuffling} />
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate opacity-80">
                {view.roundNumber}판 ·{" "}
                {view.phase === "passing"
                  ? `넘기기: ${directionLabel(view.direction)}`
                  : view.phase === "play"
                    ? `${view.trickIndex + 1}/13턴${view.heartsBroken ? " · 하트 깨짐" : ""}`
                    : "판 끝"}
              </span>
            )}
            <span
              className="shrink-0 tabular-nums opacity-90"
              title="내 이번 판 점수와 합계"
            >
              나{" "}
              <span
                className={cn(
                  (plateView.takenPoints[me] ?? 0) > 0 && "text-red-300",
                )}
              >
                {plateView.takenPoints[me] ?? 0}
              </span>
              /{plateView.scores[me] ?? 0}
            </span>
            {network && (
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="relative shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
              >
                채팅
                {chatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] leading-4">
                    {chatUnread}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              설정
            </button>
            <button
              type="button"
              onClick={() => setShowScores(true)}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              점수판
            </button>
            <button
              type="button"
              onClick={onExit}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              나가기
            </button>
          </div>

          {/* 다른 사람 손패(뒷면). 다시 보기에서 펼치면 자리 판 아래에 칩으로 보인다 */}
          {openHands &&
            [1, 2, 3].map((offset) => {
              const seat = (me + offset) % 4;
              const p = layout.seats[offset]?.plate;
              return p ? (
                <OpenHand
                  key={`open-${seat}`}
                  cards={openHands[seat] ?? []}
                  rect={p}
                />
              ) : null;
            })}
          {!dealing &&
            !openHands &&
            view.phase !== "roundEnd" &&
            view.phase !== "gameOver" &&
            [1, 2, 3].flatMap((offset) => {
              const seat = (me + offset) % 4;
              const count = view.handCounts[seat] ?? 0;
              return Array.from({ length: count }, (_, i) => {
                const at = fanSlot(seat, i, count);
                return (
                  <PlayingCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면 카드는 자리 순서가 곧 정체다
                    key={`fan-${seat}-${i}`}
                    card={null}
                    width={fanCard.w}
                    height={fanCard.h}
                    at={{ x: at.x, y: at.y }}
                    rotate={at.rotate}
                    z={1 + i}
                  />
                );
              });
            })}

          {/* 자리 판 */}
          {[1, 2, 3].map((offset) => {
            const seat = (me + offset) % 4;
            const p = layout.seats[offset]?.plate;
            if (!p) return null;
            const active = view.turn === seat && view.phase === "play";
            const ready = view.phase === "passing" && view.passReady[seat];
            return (
              <div
                key={seat}
                className={cn(
                  "absolute flex flex-col justify-between rounded-xl border border-white/15 bg-black/45 px-2 py-1 text-xs shadow-lg backdrop-blur-sm transition-[box-shadow]",
                  active &&
                    "shadow-[0_0_0_2px_#fde68a,0_0_20px_2px_rgba(253,230,138,0.55)]",
                )}
                style={{
                  left: p.x,
                  top: p.y,
                  width: p.w,
                  height: p.h,
                  zIndex: 20,
                }}
              >
                <div className="flex items-center gap-1">
                  <span className="min-w-[3.5em] truncate font-semibold">
                    {seatName(seat)}
                  </span>
                  {ready && (
                    <span
                      className="shrink-0 rounded bg-emerald-400 px-1 text-[10px] text-black"
                      title="넘길 카드를 골랐다"
                    >
                      ✓
                    </span>
                  )}
                  <span className="ml-auto shrink-0 tabular-nums opacity-80">
                    {view.handCounts[seat] ?? 0}장
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] tabular-nums">
                  <span
                    className={cn(
                      (plateView.takenPoints[seat] ?? 0) > 0
                        ? "text-red-300"
                        : "opacity-50",
                    )}
                  >
                    이번 판 {plateView.takenPoints[seat] ?? 0}
                  </span>
                  <span className="opacity-70">
                    합 {plateView.scores[seat] ?? 0}
                  </span>
                </div>
                {incident?.seat === seat ? (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-bold text-[10px] shadow">
                    ⚠ 부정 감지
                  </div>
                ) : (
                  offlineSeats.includes(seat) && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-[10px] shadow">
                      {fair
                        ? "연결 끊김 · 기다리는 중"
                        : "연결 끊김 · 컴퓨터가 대신"}
                    </div>
                  )
                )}
              </div>
            );
          })}

          {dealing && (
            <DealAnimation
              key={dealing.key}
              center={tableCenter}
              card={layout.trick.card}
              targets={dealTargets}
              handSize={dealing.handSize}
              kittyCount={0}
              startDelay={dealing.startDelay}
              pattern={HEARTS_DEAL_PATTERN}
              shuffleMs={dealing.shuffleMs}
            />
          )}

          {mission && <MissionOverlay mission={mission} {...missionPlace} />}

          <FairOverlays
            incident={incident}
            shuffling={dealing ? null : shuffling}
            fair={fair}
            offlineNames={
              view.phase === "gameOver"
                ? []
                : offlineSeats.map((s) => seatName(s))
            }
            endGame={endGame}
            endVote={endVote}
            voteEnd={voteEnd}
            mySeat={me}
            whoName={(seat) => (seat === me ? "내 자리" : seatName(seat))}
            center={tableCenter}
            card={layout.trick.card}
            deckCount={52}
            top={layout.hud.y + layout.hud.h + 6}
          />

          {[
            ...(dealing ? [] : hand).map((card, i) => {
              const slot = layout.hand.slots[i] as Point;
              const lifted = passPick.includes(card) || selected === card;
              const canPlay = playable?.has(card) ?? false;
              return (
                <PlayingCard
                  key={card}
                  card={card}
                  width={layout.hand.card.w}
                  height={layout.hand.card.h}
                  at={{
                    x: slot.x,
                    y:
                      slot.y -
                      (lifted
                        ? layout.hand.card.h *
                          (controls.dragArmed && selected === card ? 0.6 : 0.2)
                        : acting
                          ? 0
                          : -layout.hand.card.h * 0.04),
                  }}
                  from={{ ...myPile, scale: 0.55, opacity: 0.6 }}
                  delay={Math.min(i * 25, 300)}
                  z={10 + i}
                  dim={
                    (playable !== null && !canPlay) ||
                    (!acting && view.phase === "play")
                  }
                  highlight={passPick.includes(card)}
                  fresh={received.has(card) && !lifted}
                  freshLabel="받음"
                  interactive={acting && (passing || playable !== null)}
                  onActivate={(pointer) => onCard(card, pointer)}
                />
              );
            }),
            // 넘긴 카드: 받을 사람 쪽으로 조금 옮겨 모아 둔다.
            ...(outgoing && passTo !== null
              ? outgoing.map((card, i) => {
                  const toward = plateCenter(passTo);
                  const base = {
                    x: myPile.x + (toward.x - myPile.x) * 0.55,
                    y: myPile.y + (toward.y - myPile.y) * 0.55,
                  };
                  const { w, h } = layout.trick.card;
                  return (
                    <PlayingCard
                      key={card}
                      card={card}
                      width={w}
                      height={h}
                      at={{
                        x: base.x + (i - (outgoing.length - 1) / 2) * w * 0.5,
                        y: base.y,
                      }}
                      z={60 + i}
                      fresh
                      freshLabel="넘김"
                    />
                  );
                })
              : []),
            ...trickPlays.map((play, order) => {
              const offset = offsetOf(play.seat);
              const slot = layout.trick.slots[offset] as Point;
              const target =
                collecting && shownTrick
                  ? plateCenter(shownTrick.winner)
                  : slot;
              const from =
                offset === 0
                  ? undefined
                  : (() => {
                      const s = playedSlots.get(play.card);
                      if (s === undefined)
                        return { ...plateCenter(play.seat), scale: 0.5 };
                      const count = (view.handCounts[play.seat] ?? 0) + 1;
                      const at = fanSlot(play.seat, s, count);
                      return {
                        x: at.x,
                        y: at.y,
                        scale: fanCard.w / layout.trick.card.w,
                      };
                    })();
              return (
                <PlayingCard
                  key={play.card}
                  card={play.card}
                  width={layout.trick.card.w}
                  height={layout.trick.card.h}
                  at={{
                    ...target,
                    scale: collecting ? 0.3 : 1,
                    opacity: collecting ? 0 : 1,
                  }}
                  {...(from ? { from } : {})}
                  rotate={tilt(play.card)}
                  z={100 + order}
                  highlight={
                    shownTrick !== null &&
                    !collecting &&
                    play.seat === shownTrick.winner
                  }
                />
              );
            }),
          ]}

          {/* 가운데 패널: 넘기기, 판 결과(섞는 동안은 지난 화면이라 숨긴다) */}
          {showPanel && !shuffling && (
            <div
              className="panel-area absolute z-[200] flex items-end justify-center"
              style={{
                left:
                  layout.center.x +
                  layout.center.w / 2 -
                  Math.min(170, stage.width / 2 - layout.gutter),
                width: Math.min(340, stage.width - 2 * layout.gutter),
                top: layout.center.y,
                height: layout.hand.top - layout.gutter - layout.center.y,
              }}
            >
              <div className="flex max-h-full w-full flex-col justify-end">
                {passing && decision?.kind === "pass" && passTo !== null ? (
                  <Panel
                    title={`${directionLabel(view.direction)}(${seatName(passTo)})에게 넘길 카드 ${decision.count}장`}
                  >
                    <p className="text-center text-xs opacity-70">
                      <SuitText text="높은 카드, ♠Q·♠A·♠K, 높은 하트를 넘기면 좋아요." />{" "}
                      ({passPick.length}/{decision.count})
                    </p>
                    <ActionButton
                      disabled={passPick.length !== decision.count}
                      onClick={() => act({ type: "pass", cards: passPick })}
                    >
                      넘기기
                    </ActionButton>
                  </Panel>
                ) : outgoing ? (
                  <p className="text-center text-sm opacity-80">
                    다른 사람이 카드를 고르는 중…
                  </p>
                ) : (view.phase === "roundEnd" || view.phase === "gameOver") &&
                  !busy ? (
                  <RoundPanel
                    view={view}
                    seatName={seatName}
                    onContinue={() => act({ type: "continue" })}
                    onExit={onExit}
                  />
                ) : null}
              </div>
            </div>
          )}

          <ResultBanner
            banner={banner}
            seq={roundResult?.key ?? 0}
            center={tableCenter}
            stageHeight={stage.height}
          />

          {effect && (
            <div
              key={seq}
              className={cn(
                "effect-pop pointer-events-none absolute z-[250] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl px-5 py-2 font-black text-xl shadow-2xl",
                effect.tone === "gold" &&
                  "bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950",
                effect.tone === "red" &&
                  "bg-gradient-to-b from-rose-400 to-rose-600 text-white",
                effect.tone === "info" && "bg-black/75 text-white",
              )}
              style={{
                left: tableCenter.x,
                top: layout.center.y + layout.center.h * 0.25,
              }}
            >
              <SuitText text={effect.text} />
            </div>
          )}

          {acting && decision?.kind === "play" && !notice && (
            <div
              className="pointer-events-none absolute z-[240] -translate-x-1/2 animate-pulse rounded-full bg-amber-400 px-3 py-1 font-bold text-black text-xs shadow"
              style={{ left: stage.width / 2, top: layout.hand.top - 30 }}
            >
              {(decision as PlayDecision).leading
                ? "내가 선입니다 — 낼 카드를 고르세요"
                : "내 차례 — 낼 카드를 고르세요"}
            </div>
          )}

          {notice && (
            <div
              className="absolute z-[300] -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-sm shadow"
              style={{ left: stage.width / 2, top: layout.hand.top - 36 }}
            >
              <SuitText text={notice} />
            </div>
          )}

          {network && chatOpen && (
            <div className="absolute top-14 right-3 z-[380] w-[min(92%,22rem)] rounded-2xl border border-white/15 bg-felt-dark/95 p-3 shadow-2xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-sm">채팅</span>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="rounded bg-white/10 px-2 text-xs"
                >
                  닫기
                </button>
              </div>
              <ChatBox mySeat={me} />
            </div>
          )}

          {invalid && (
            <div
              role="alert"
              className="absolute inset-x-0 z-[340] mx-auto w-fit max-w-[92%] rounded-xl bg-rose-700/95 px-3 py-1.5 text-center font-semibold text-sm shadow-xl"
              style={{ top: layout.hud.y + layout.hud.h + 6 }}
            >
              ⚠ 공정성 검증 실패 — 이 게임은 무효입니다 ({invalid})
            </div>
          )}
          {reconnecting && !hostLeft && (
            <div
              role="status"
              className="absolute inset-x-0 top-16 z-[350] mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl"
            >
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              방장과 연결이 끊겼습니다. 다시 연결하는 중…
            </div>
          )}
          {hostLeft && (
            <div className="absolute inset-x-0 top-16 z-[350] mx-auto flex w-fit items-center gap-3 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl">
              방장이 방을 나가 게임이 끝났습니다
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg bg-amber-400 px-3 py-1 font-semibold text-black"
              >
                처음으로
              </button>
            </div>
          )}

          {showSettings && (
            <HeartsSettingsMenu onClose={() => setShowSettings(false)} />
          )}
          {showScores && (
            <ScoreSheet
              names={[0, 1, 2, 3].map(seatName)}
              history={view.history}
              scores={view.scores}
              endScore={view.rules.endScore}
              mySeat={me}
              onClose={() => setShowScores(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 판이 끝났을 때: 이번 판 점수와 합계, 다음 판 */
function RoundPanel({
  view,
  seatName,
  onContinue,
  onExit,
}: {
  view: PlayerView;
  seatName: (seat: number) => string;
  onContinue: () => void;
  onExit: () => void;
}) {
  const over = view.phase === "gameOver";
  // 판 점수 없이 끝났다: 끊긴 사람을 더 기다리지 않고 중간에 끝냈다.
  const retired = over && view.roundPoints === null;
  const low = Math.min(...view.scores);
  const winners = view.players.filter((s) => view.scores[s] === low);
  const points = view.roundPoints ?? view.history.at(-1) ?? [];
  return (
    <Panel
      title={
        retired
          ? "게임을 중간에 끝냈습니다"
          : over
            ? winners.includes(view.seat)
              ? "🏆 이겼습니다!"
              : `${winners.map(seatName).join(", ")} 승리`
            : `${view.roundNumber}판 결과`
      }
    >
      {view.moonShooter !== null && (
        <p className="text-center font-bold text-amber-300 text-sm">
          🌙 {seatName(view.moonShooter)}의 문 슛!
        </p>
      )}
      <table className="w-full text-center text-sm tabular-nums">
        <thead>
          <tr className="text-xs opacity-60">
            <th />
            {!retired && <th>이번 판</th>}
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((seat) => (
            <tr
              key={seat}
              className={cn(seat === view.seat && "font-bold text-amber-200")}
            >
              <td className="text-left">{seatName(seat)}</td>
              {!retired && (
                <td className={cn((points[seat] ?? 0) > 0 && "text-red-300")}>
                  +{points[seat] ?? 0}
                </td>
              )}
              <td>{view.scores[seat]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {over ? (
        <ActionButton onClick={onExit}>처음으로</ActionButton>
      ) : view.decision?.kind === "continue" ? (
        <ActionButton onClick={onContinue}>다음 판</ActionButton>
      ) : (
        <p className="text-center text-xs opacity-70">
          다른 사람을 기다리는 중…
        </p>
      )}
    </Panel>
  );
}
