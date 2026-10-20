"use client";

import { heuristicBot } from "@mighty/ai";
import {
  type Card,
  countPoints,
  createRng,
  type Decision,
  isJoker,
  lastTrickIndex,
  type PlayerView,
  type Suit,
  unplayableReason,
} from "@mighty/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { effectFor } from "@/game/effects";
import { useSettings } from "@/game/settings";
import { play as playCue } from "@/game/sound";
import { canAct, useGame } from "@/game/store";
import {
  friendLabel,
  goalLabel,
  kirudaName,
  sortHand,
  unplayableText,
} from "@/game/terms";
import { computeLayout, type Point } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { DealAnimation } from "./DealAnimation";
import { PlayingCard } from "./PlayingCard";
import { ElectionPanel } from "./panels/ElectionPanel";
import { ExchangePanel } from "./panels/ExchangePanel";
import { FriendPanel } from "./panels/FriendPanel";
import {
  KillPanel,
  LeadChoicePanel,
  PickPanel,
  RoundResultPanel,
} from "./panels/OtherPanels";
import { Scoreboard } from "./Scoreboard";
import { SeatPlate } from "./SeatPlate";
import { SettingsMenu } from "./SettingsMenu";
import { MissionOverlay, type MissionProps } from "./tutorial/MissionOverlay";

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

/** 카드 id로 정한 작은 기울기. 같은 판을 다시 그려도 같은 각도다 */
function tilt(card: Card): number {
  let h = 0;
  for (const ch of card) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h % 9) - 4;
}

function waitingText(
  view: PlayerView,
  seatName: (s: number) => string,
): string | null {
  if (view.turn === null || view.turn === view.seat) return null;
  const who = seatName(view.turn);
  switch (view.phase) {
    case "election":
      return `${who} 공약 생각 중…`;
    case "kill":
      return `${who}이(가) 뺄 사람을 고르는 중…`;
    case "exchange":
      return `${who}이(가) 카드를 고르는 중…`;
    case "friend":
      return `${who}이(가) 프렌드를 정하는 중…`;
    case "pick":
      return `${who}이(가) 카드를 고르는 중…`;
    default:
      return null;
  }
}

export function GameTable({
  onExit,
  mission,
  hints = false,
}: {
  onExit: () => void;
  /** 튜토리얼 미션 목표와 결과 안내 */
  mission?: MissionProps;
  /** 컴퓨터가 추천하는 카드에 빛을 낸다 */
  hints?: boolean;
}) {
  const stage = useStageSize();
  const view = useGame((s) => s.view);
  const shownTrick = useGame((s) => s.shownTrick);
  const collecting = useGame((s) => s.collecting);
  const dealing = useGame((s) => s.dealing);
  const seatNames = useGame((s) => s.seatNames);
  const hostLeft = useGame((s) => s.hostLeft);
  const queue = useGame((s) => s.queue);
  const events = useGame((s) => s.events);
  const seq = useGame((s) => s.seq);
  const busy = useGame((s) => s.busy);
  const startMoney = useGame((s) => s.roundStartMoney);
  const notice = useGame((s) => s.notice);
  const submit = useGame((s) => s.submit);
  const clearNotice = useGame((s) => s.clearNotice);

  const [discards, setDiscards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Card | null>(null);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [leadChoice, setLeadChoice] = useState<{
    card: Card;
    kind: "jokerSuit" | "jokerCall";
  } | null>(null);

  // 단계가 바뀌면 손패에서 고르던 것을 비운다.
  const phaseKey = `${view?.roundNumber}-${view?.phase}-${view?.trickIndex}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀔 때만 비운다
  useEffect(() => {
    setDiscards([]);
    setSelected(null);
    setLeadChoice(null);
  }, [phaseKey]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 키보드 처리는 렌더할 때마다 최신 손패·선택지를 보도록 ref에 담아 둔다.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 카드 단추가 Enter를 이미 처리했으면 두 번 내지 않는다.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
        return;
      keyHandler.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!view) return <div ref={stage.ref} className="h-dvh w-full" />;

  const { rules } = view;
  const n = rules.playerCount;
  const myIndex = view.order.indexOf(view.seat);
  const offsetOf = (seat: number) =>
    (view.order.indexOf(seat) - myIndex + n) % n;
  // 온라인 대전은 대기실 이름을, 혼자 할 때는 앉은 순서대로 "컴퓨터 n"을 쓴다.
  const seatName = (seat: number) =>
    seat === view.seat
      ? "나"
      : (seatNames?.[seat] ?? `컴퓨터 ${offsetOf(seat)}`);
  const kiruda = view.goal?.kiruda ?? null;
  const hand = sortHand(view.hand, rules, kiruda);

  const layout =
    stage.width > 0
      ? computeLayout({
          width: stage.width,
          height: stage.height,
          playerCount: n,
          handCount: hand.length,
        })
      : null;

  const acting = canAct({ queue, view, shownTrick, dealing });
  const decision: Decision | null = acting ? view.decision : null;
  const playable = decision?.kind === "play" ? new Set(decision.cards) : null;
  const exchanging = decision?.kind === "exchange";
  const hintAction =
    hints && decision?.kind === "play"
      ? heuristicBot.decide(view, createRng(view.trickIndex))
      : null;
  const hintCard = hintAction?.type === "play" ? hintAction.card : null;

  const act = (action: Parameters<typeof submit>[0]) => {
    const result = submit(action);
    if (result.ok) {
      setSelected(null);
      setLeadChoice(null);
    }
  };

  const playCard = (card: Card) => {
    if (decision?.kind !== "play") return;
    if (decision.leading && isJoker(card)) {
      setLeadChoice({ card, kind: "jokerSuit" });
      return;
    }
    if (decision.jokerCallCard === card) {
      setLeadChoice({ card, kind: "jokerCall" });
      return;
    }
    act({ type: "play", card });
  };

  const onCardActivate = (card: Card, pointerType: string) => {
    if (exchanging && decision?.kind === "exchange") {
      setDiscards((d) =>
        d.includes(card)
          ? d.filter((c) => c !== card)
          : d.length < decision.discardCount
            ? [...d, card]
            : d,
      );
      return;
    }
    if (!playable?.has(card)) {
      const reason = unplayableReason(
        { rules, kiruda: kiruda ?? "NT", trickIndex: view.trickIndex },
        view.hand,
        {
          cards: view.trick?.plays.map((p) => p.card) ?? [],
          jokerSuit: view.trick?.jokerSuit ?? null,
          jokerCalled: view.trick?.jokerCalled ?? false,
        },
        card,
      );
      useGame.setState({
        notice: reason ? unplayableText(reason) : "지금 낼 수 없는 카드입니다",
      });
      if (useSettings.getState().sound) playCue("invalid");
      return;
    }
    // 터치는 두 단계: 골라서 들어 올린 뒤 다시 눌러 낸다.
    if (pointerType === "touch" && selected !== card) {
      setSelected(card);
      return;
    }
    playCard(card);
  };

  keyHandler.current = (e) => {
    if (e.key === "Escape") {
      setLeadChoice(null);
      setSelected(null);
      return;
    }
    if (decision?.kind !== "play" || leadChoice) return;
    const options = hand.filter((c) => playable?.has(c));
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const i = selected ? options.indexOf(selected) : -1;
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = options[(i + step + options.length) % options.length];
      if (next) setSelected(next);
    } else if (e.key === "Enter" && selected && playable?.has(selected)) {
      e.preventDefault();
      playCard(selected);
    }
  };

  const trick = shownTrick ?? view.trick;
  const trickPlays = trick?.plays ?? [];
  const pointsTaken = view.tricks.reduce(
    (sum, t) => sum + countPoints(t.plays.map((p) => p.card)),
    0,
  );
  const plateCenter = (seat: number): Point => {
    if (!layout) return { x: 0, y: 0 };
    const s = layout.seats[offsetOf(seat)];
    if (!s) return { x: 0, y: 0 };
    return offsetOf(seat) === 0
      ? s.anchor
      : { x: s.plate.x + s.plate.w / 2, y: s.plate.y + s.plate.h / 2 };
  };

  const effect = effectFor(view, events, seatName);

  const lastBid = (seat: number): string | null => {
    if (view.phase !== "election") return null;
    const entry = [...view.election.log].reverse().find((e) => e.seat === seat);
    if (!entry) return null;
    return entry.bid ? goalLabel(entry.bid) : "포기";
  };

  // 세로 화면은 패널이 양옆 자리 판을 가리지 않게 자리 판 아래부터 손패 위까지 쓴다.
  const panelArea = (() => {
    if (!layout) return { top: 0, bottom: 0 };
    // 판이 끝나 손패가 비면 손패 자리까지 패널이 쓴다.
    const handTop = hand.length === 0 ? stage.height : layout.hand.top;
    if (layout.orientation === "landscape") {
      // 가로 화면도 패널이 맞은편 자리 판을 덮지 않게 그 아래에서 시작하고, 아래로는 손패 위까지 쓴다.
      const cx = layout.center.x + layout.center.w / 2;
      const half =
        Math.min(
          Math.max(layout.center.w, 340),
          stage.width - 2 * layout.gutter,
        ) / 2;
      const above = layout.seats
        .slice(1)
        .map((s) => s.plate)
        .filter(
          (p) =>
            p.x < cx + half && cx - half < p.x + p.w && p.y < layout.center.y,
        );
      const top = Math.max(
        layout.table.y,
        ...above.map((p) => p.y + p.h + layout.gutter),
      );
      return { top, bottom: handTop - layout.gutter };
    }
    const bottom = handTop - layout.gutter;
    const platesBottom = Math.max(
      ...layout.seats.slice(1).map((s) => s.plate.y + s.plate.h + 24),
    );
    return { top: Math.min(platesBottom, bottom - 280), bottom };
  })();

  const tableCenter: Point = layout
    ? {
        x: layout.center.x + layout.center.w / 2,
        y: layout.center.y + layout.center.h / 2,
      }
    : { x: 0, y: 0 };
  const myPile: Point = layout
    ? { x: stage.width / 2, y: layout.hand.slots[0]?.y ?? layout.hand.top }
    : { x: 0, y: 0 };
  // 선부터 차례로 카드를 받는 곳
  const beginnerIndex = view.players.indexOf(view.beginner);
  const dealTargets = [
    ...view.players.slice(beginnerIndex),
    ...view.players.slice(0, beginnerIndex),
  ].map((seat) => (seat === view.seat ? myPile : plateCenter(seat)));

  const compactHud = layout?.orientation === "portrait";

  const showPanel =
    layout !== null &&
    dealing === null &&
    shownTrick === null &&
    trickPlays.length === 0;
  const waiting = waitingText(view, seatName);

  return (
    <div
      ref={stage.ref}
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)]"
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
            {view.goal ? (
              <span
                className="shrink-0 font-bold text-base"
                title={kirudaName(view.goal.kiruda)}
              >
                {goalLabel(view.goal)}
              </span>
            ) : (
              <span className="shrink-0 opacity-70">공약 전</span>
            )}
            <span className="min-w-0 flex-1 truncate opacity-80">
              {[
                view.declarer !== null && `주공 ${seatName(view.declarer)}`,
                view.friendDeclaration &&
                  `${friendLabel(view.friendDeclaration, seatName)}${
                    view.friend !== null && view.friendRevealed
                      ? ` → ${seatName(view.friend)}`
                      : ""
                  }`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span
              className="shrink-0 tabular-nums opacity-80"
              title="트릭 진행과 아직 나오지 않은 점수 카드 수"
            >
              {view.phase === "play"
                ? compactHud
                  ? `${view.trickIndex + 1}/${lastTrickIndex(rules) + 1} · ${20 - pointsTaken}점`
                  : `${view.trickIndex + 1}/${lastTrickIndex(rules) + 1}트릭 · 남은 점수 ${20 - pointsTaken}`
                : `${view.roundNumber}판`}
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              설정
            </button>
            <button
              type="button"
              onClick={() => setShowScoreboard(true)}
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

          {/* 자리 판 */}
          {layout.seats.slice(1).map((seatLayout) => {
            const seat = view.order[
              (myIndex + seatLayout.offset) % n
            ] as number;
            const revealedFriend = view.friend === seat && view.friendRevealed;
            return (
              <SeatPlate
                key={seat}
                rect={seatLayout.plate}
                name={seatName(seat)}
                handCount={view.handCounts[seat] ?? 0}
                points={view.pointPiles?.[seat] ?? null}
                pointCount={view.pointCounts[seat] ?? 0}
                money={view.money[seat] ?? 0}
                declarer={seat === view.declarer}
                friend={revealedFriend}
                ruling={seat === view.declarer || revealedFriend}
                active={view.turn === seat && view.phase !== "roundEnd"}
                leader={view.phase === "play" && trick?.leader === seat}
                dead={view.dead.includes(seat)}
                bubble={lastBid(seat)}
                bubbleDim={
                  view.phase === "election" && view.election.bidder !== seat
                }
                compact={layout.orientation === "portrait" && n >= 6}
              />
            );
          })}

          {/* 카드 무대: 손패와 바닥을 한 배열로 그려야 같은 카드가 손패에서 바닥으로 날아간다 */}
          {dealing && (
            <DealAnimation
              key={dealing.key}
              center={tableCenter}
              card={layout.trick.card}
              targets={dealTargets}
              handSize={dealing.handSize}
              kittyCount={view.kittyCount}
              startDelay={dealing.startDelay}
            />
          )}
          {[
            ...(dealing ? [] : hand).map((card, i) => {
              const slot = layout.hand.slots[i] as Point;
              const lifted = discards.includes(card) || selected === card;
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
                        ? layout.hand.card.h * 0.2
                        : acting
                          ? 0
                          : -layout.hand.card.h * 0.04),
                  }}
                  // 키티는 가운데에서, 처음 받은 패는 나눠 받은 더미(손패 가운데)에서 펼쳐진다.
                  from={
                    view.phase === "exchange"
                      ? { ...tableCenter, scale: 0.6, opacity: 0 }
                      : { ...myPile, scale: 0.55, opacity: 0.6 }
                  }
                  delay={Math.min(i * 25, 300)}
                  z={10 + i}
                  dim={
                    (playable !== null && !canPlay) ||
                    (!acting && view.phase === "play")
                  }
                  highlight={discards.includes(card) || card === hintCard}
                  interactive={acting && (exchanging || playable !== null)}
                  onActivate={(pointer) => onCardActivate(card, pointer)}
                />
              );
            }),
            ...trickPlays.map((play, order) => {
              const offset = offsetOf(play.seat);
              const slot = layout.trick.slots[offset] as Point;
              const target =
                collecting && shownTrick
                  ? plateCenter(shownTrick.winner)
                  : slot;
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
                  {...(offset === 0
                    ? {}
                    : { from: { ...plateCenter(play.seat), scale: 0.5 } })}
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

          {/* 조커 무늬 같은 짧은 표시 */}
          {trick?.jokerSuit && trickPlays.length > 0 && (
            <div
              className="absolute rounded-full bg-white px-3 py-1 font-bold text-black text-sm shadow"
              style={{
                left: layout.center.x + layout.center.w / 2,
                top: layout.center.y - 8,
                transform: "translate(-50%,-100%)",
              }}
            >
              조커 → {kirudaName(trick.jokerSuit as Suit)}
              {trick.jokerCalled ? " · 조커콜" : ""}
            </div>
          )}
          {trick?.jokerCalled && !trick.jokerSuit && trickPlays.length > 0 && (
            <div
              className="absolute rounded-full bg-red-500 px-3 py-1 font-bold text-sm shadow"
              style={{
                left: layout.center.x + layout.center.w / 2,
                top: layout.center.y - 8,
                transform: "translate(-50%,-100%)",
              }}
            >
              조커콜!
            </div>
          )}

          {/* 판 가운데 행동 패널 */}
          {(showPanel || leadChoice) && (
            <div
              className="absolute z-[200] flex items-end justify-center"
              style={{
                left: Math.max(
                  layout.gutter,
                  layout.center.x +
                    layout.center.w / 2 -
                    Math.max(layout.center.w, 340) / 2,
                ),
                top: panelArea.top,
                width: Math.min(
                  Math.max(layout.center.w, 340),
                  stage.width - 2 * layout.gutter,
                ),
                height: panelArea.bottom - panelArea.top,
              }}
            >
              <div className="flex max-h-full w-full flex-col justify-end">
                {leadChoice ? (
                  <LeadChoicePanel
                    card={leadChoice.card}
                    kind={leadChoice.kind}
                    kiruda={kiruda ?? "NT"}
                    onCancel={() => setLeadChoice(null)}
                    onChoose={(choice) =>
                      act({ type: "play", card: leadChoice.card, ...choice })
                    }
                  />
                ) : decision?.kind === "election" ? (
                  <ElectionPanel
                    view={view}
                    decision={decision}
                    seatName={seatName}
                    onSubmit={act}
                  />
                ) : decision?.kind === "exchange" ? (
                  <ExchangePanel
                    decision={decision}
                    discards={discards}
                    onSubmit={act}
                  />
                ) : decision?.kind === "friend" ? (
                  <FriendPanel
                    rules={rules}
                    kiruda={kiruda ?? "NT"}
                    decision={decision}
                    seatName={seatName}
                    onSubmit={act}
                  />
                ) : decision?.kind === "kill" ? (
                  <KillPanel
                    decision={decision}
                    hand={view.hand}
                    onSubmit={act}
                  />
                ) : decision?.kind === "pick" ? (
                  <PickPanel faceUp={decision.faceUp} onSubmit={act} />
                ) : (view.phase === "roundEnd" || view.phase === "gameOver") &&
                  !busy ? (
                  <RoundResultPanel
                    view={view}
                    startMoney={startMoney}
                    seatName={seatName}
                    onSubmit={act}
                    onNewGame={onExit}
                  />
                ) : waiting ? (
                  <p className="text-center text-sm opacity-80">{waiting}</p>
                ) : null}
              </div>
            </div>
          )}

          {/* 효과 글자: 당선, 마이티, 조커콜, 프렌드 공개 등 */}
          {effect && (
            <div
              key={seq}
              className={cn(
                "effect-pop pointer-events-none absolute z-[250] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl px-5 py-2 font-black text-2xl shadow-2xl",
                effect.tone === "gold" &&
                  "bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950",
                effect.tone === "red" &&
                  "bg-gradient-to-b from-rose-400 to-rose-600 text-white",
                effect.tone === "info" && "bg-black/75 text-white",
              )}
              style={{
                left: tableCenter.x,
                top: showPanel
                  ? Math.max(
                      layout.hud.y + layout.hud.h + 24,
                      panelArea.top - 24,
                    )
                  : layout.center.y + layout.center.h * 0.3,
              }}
            >
              {effect.text}
            </div>
          )}

          {showSettings && (
            <SettingsMenu onClose={() => setShowSettings(false)} />
          )}
          {showScoreboard && (
            <Scoreboard
              view={view}
              seatName={seatName}
              onClose={() => setShowScoreboard(false)}
            />
          )}

          {/* 트릭 중간에 내 차례가 오면 손패 위에 알린다 */}
          {acting && decision?.kind === "play" && !leadChoice && !notice && (
            <div
              className="pointer-events-none absolute z-[240] -translate-x-1/2 animate-pulse rounded-full bg-amber-400 px-3 py-1 font-bold text-black text-xs shadow"
              style={{ left: stage.width / 2, top: layout.hand.top - 30 }}
            >
              {decision.leading
                ? "내가 선입니다 — 낼 카드를 고르세요"
                : "내 차례 — 낼 카드를 고르세요"}
            </div>
          )}

          {mission && (
            <MissionOverlay
              mission={mission}
              top={layout.hud.y + layout.hud.h + 8}
            />
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

          {/* 알림 */}
          {notice && (
            <div
              className={cn(
                "absolute z-[300] -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-sm shadow",
              )}
              style={{ left: stage.width / 2, top: layout.hand.top - 36 }}
            >
              {notice}
            </div>
          )}
        </>
      )}
    </div>
  );
}
