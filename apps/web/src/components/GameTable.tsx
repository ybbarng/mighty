"use client";

import { heuristicBot } from "@mighty/ai";
import {
  type Card,
  countPoints,
  createRng,
  type Decision,
  deckFor,
  isJoker,
  lastTrickIndex,
  type PlayerView,
  type Suit,
  unplayableReason,
} from "@mighty/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { effectFor } from "@/game/effects";
import { mightyResultBanner } from "@/game/result-banner";
import { botName, useCardTheme, useSettings } from "@/game/settings";
import { canAct, useGame } from "@/game/store";
import {
  cardTipText,
  friendLabel,
  goalLabel,
  jokerCallLabel,
  jokerSuitLabel,
  slangTerms,
  sortHand,
  unplayableText,
} from "@/game/terms";
import { playUiCue } from "@/game/ui-sound";
import { computeLayout, type Point } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";
import { ChatBox } from "./ChatBox";
import { CardArt } from "./card-art/CardArt";
import { DealAnimation } from "./DealAnimation";
import { FairOverlays, FairStatus } from "./FairOverlays";
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
import { ResultBanner } from "./ResultBanner";
import { Scoreboard } from "./Scoreboard";
import { SeatPlate } from "./SeatPlate";
import { SettingsMenu } from "./SettingsMenu";
import { Term, TermProvider } from "./TermHint";
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
  const theme = useCardTheme();
  const view = useGame((s) => s.view);
  const shownTrick = useGame((s) => s.shownTrick);
  const collecting = useGame((s) => s.collecting);
  const dealing = useGame((s) => s.dealing);
  const seatNames = useGame((s) => s.seatNames);
  const hostLeft = useGame((s) => s.hostLeft);
  const reconnecting = useGame((s) => s.reconnecting);
  const offlineSeats = useGame((s) => s.offlineSeats);
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
  // 터치로 손패를 훑거나 위로 끄는 중. 손을 떼기 전까지 카드 단추의 누르기를 대신한다.
  const touchGesture = useRef<{
    x: number;
    y: number;
    moved: boolean;
    /** 처음 짚은 카드 */
    card: Card;
  } | null>(null);
  const [dragArmed, setDragArmed] = useState(false);
  const [hovered, setHovered] = useState<Card | null>(null);
  const cardTipOn = useSettings((s) => s.cardTip);
  // 은어 보기를 바꾸면 문구를 다시 그린다(문구 함수는 terms.ts가 설정을 따라간다).
  useSettings((s) => s.slangTerms);
  const speedSetting = useSettings((s) => s.speed);
  const botNames = useSettings((s) => s.botNames);
  const network = useGame((s) => s.network);
  const invalid = useGame((s) => s.invalid);
  const incident = useGame((s) => s.incident);
  const shuffling = useGame((s) => s.shuffling);
  const fair = useGame((s) => s.fair);
  const endGame = useGame((s) => s.endGame);
  const endVote = useGame((s) => s.endVote);
  const voteEnd = useGame((s) => s.voteEnd);
  const chatMessages = useChat((s) => s.messages);
  const chatUnread = useChat((s) => s.unread);
  const chatOpen = useChat((s) => s.open);
  const setChatOpen = useChat((s) => s.setOpen);
  // 말풍선이 4초 뒤 사라지도록 화면을 다시 그린다.
  const [, setChatTick] = useState(0);
  const lastChatAt = chatMessages.at(-1)?.at ?? 0;
  useEffect(() => {
    if (!lastChatAt) return;
    const timer = setTimeout(() => setChatTick((t) => t + 1), 4100);
    return () => clearTimeout(timer);
  }, [lastChatAt]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [leadChoice, setLeadChoice] = useState<{
    card: Card;
    kind: "jokerSuit" | "jokerCall";
  } | null>(null);

  // 나눠 주고 남은 바닥 카드 수. 주공이 가져가면 0이 되므로 이번 판에 마지막으로 본 수를 기억한다.
  const floorMemo = useRef({ round: -1, count: 0 });
  if (view && view.kittyCount > 0)
    floorMemo.current = { round: view.roundNumber, count: view.kittyCount };

  // 바닥 카드를 받기 전 손패를 기억해 두었다가 새로 들어온 카드에 표를 단다.
  const beforeKitty = useRef<{ round: number; hand: Card[] } | null>(null);
  // 바닥 카드를 고르는 동안 손패 카드 자리를 기억했다가, 버린 카드가 그 자리에서 빠져나가게 한다.
  const exchangeSlots = useRef(new Map<Card, Point>());
  if (view && view.phase !== "exchange" && view.phase !== "play")
    beforeKitty.current = { round: view.roundNumber, hand: view.hand };

  // 단계가 바뀌면 손패에서 고르던 것을 비운다.
  const phaseKey = `${view?.roundNumber}-${view?.phase}-${view?.trickIndex}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀔 때만 비운다
  useEffect(() => {
    // 원작처럼 바닥 카드에서 들어온 카드는 처음부터 버릴 카드로 골라 들어 올려 둔다.
    const before = beforeKitty.current;
    const decision = view?.decision;
    if (
      view?.phase === "exchange" &&
      decision?.kind === "exchange" &&
      before?.round === view.roundNumber
    ) {
      const fresh = view.hand.filter((c) => !before.hand.includes(c));
      setDiscards(fresh.length === decision.discardCount ? fresh : []);
    } else {
      setDiscards([]);
    }
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
  // 온라인 대전은 대기실 이름을, 혼자 할 때는 앉은 순서대로 컴퓨터 이름(설정 또는 기본)을 쓴다.
  const seatName = (seat: number) =>
    seat === view.seat
      ? "나"
      : (seatNames?.[seat] ?? botName(botNames, offsetOf(seat)));
  const kiruda = view.goal?.kiruda ?? null;
  const hand = sortHand(view.hand, rules, kiruda);
  const freshCards =
    view.phase === "exchange" && beforeKitty.current?.round === view.roundNumber
      ? new Set(hand.filter((c) => !beforeKitty.current?.hand.includes(c)))
      : null;

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
  // 튜토리얼 실전에서는 컴퓨터가 같은 자리라면 낼 카드·버릴 카드를 알려 준다.
  const hintAction =
    hints && (decision?.kind === "play" || decision?.kind === "exchange")
      ? heuristicBot.decide(view, createRng(view.trickIndex))
      : null;
  const hintCards = new Set<Card>(
    hintAction?.type === "play"
      ? [hintAction.card]
      : hintAction?.type === "exchange"
        ? hintAction.discard
        : [],
  );

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
    act({ type: "play", card, slot: hand.indexOf(card) });
  };

  /** 손가락 아래 손패 카드 */
  const cardAt = (x: number, y: number): Card | null => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-card]");
    const card = el?.dataset.card as Card | undefined;
    return card && hand.includes(card) ? card : null;
  };
  const touchPlaying =
    decision?.kind === "play" && leadChoice === null && layout !== null;
  const onHandPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !touchPlaying) return;
    const card = cardAt(e.clientX, e.clientY);
    if (!card) return;
    touchGesture.current = { x: e.clientX, y: e.clientY, moved: false, card };
  };
  const onHandPointerMove = (e: React.PointerEvent) => {
    const g = touchGesture.current;
    if (!g || !layout) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 10) return;
    g.moved = true;
    // 고른 카드 없이 바로 끌면 처음 짚은 카드를 낸다.
    const held = selected ?? (playable?.has(g.card) ? g.card : null);
    if (held !== selected) setSelected(held);
    const top = stage.ref.current?.getBoundingClientRect().top ?? 0;
    // 손패 위쪽 끝보다 카드 반 장 넘게 올라가면 낼 준비
    const armed = e.clientY - top < layout.hand.top - layout.hand.card.h * 0.5;
    setDragArmed(armed && held !== null);
    if (armed) return;
    // 손패 위를 훑으면 손가락 아래의 낼 수 있는 카드를 고른다.
    const under = cardAt(e.clientX, e.clientY);
    if (under && playable?.has(under) && under !== selected) setSelected(under);
  };
  const onHandPointerUp = () => {
    const g = touchGesture.current;
    touchGesture.current = null;
    if (!g?.moved) return;
    if (dragArmed && selected && playable?.has(selected)) playCard(selected);
    setDragArmed(false);
  };

  const onCardActivate = (card: Card, pointerType: string) => {
    // 훑거나 끈 것은 손을 뗄 때 따로 처리한다(onHandPointerUp).
    if (touchGesture.current?.moved) return;
    if (exchanging && decision?.kind === "exchange") {
      // 원작은 버릴 카드를 고를 때 카드받기 소리를 냈다.
      playUiCue("pickCard");
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
      playUiCue("invalid");
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
    // 판 가운데 패널: 숫자 키로 n번째 선택지, ↑↓·+−로 숫자, Enter로 주 단추.
    const panel = stage.ref.current?.querySelector(".panel-area");
    if (panel && !(e.target instanceof HTMLButtonElement)) {
      const press = (selector: string, index = 0) => {
        const button = panel.querySelectorAll<HTMLButtonElement>(
          `${selector}:not([disabled])`,
        )[index];
        if (!button) return false;
        e.preventDefault();
        button.click();
        return true;
      };
      if (/^[1-9]$/.test(e.key) && press("[data-choice]", Number(e.key) - 1))
        return;
      if (
        (e.key === "ArrowUp" || e.key === "+" || e.key === "=") &&
        press('[data-step="up"]')
      )
        return;
      if (
        (e.key === "ArrowDown" || e.key === "-") &&
        press('[data-step="down"]')
      )
        return;
      if (e.key === "Enter" && !selected && press("[data-primary]")) return;
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
  // 카드 툴팁은 카드를 낼 때만, 혼자 할 때만 보여 준다(원작도 네트워크 게임에서는 끈다).
  const tipCard =
    cardTipOn && !network && view.phase === "play"
      ? (hovered ?? selected)
      : null;
  const tipIndex = tipCard ? hand.indexOf(tipCard) : -1;
  const tipSlot = tipIndex >= 0 ? (layout?.hand.slots[tipIndex] ?? null) : null;
  const playedCards = new Set<Card>([
    ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(view.trick?.plays.map((p) => p.card) ?? []),
  ]);
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

  // 다른 사람 손패는 자리 판 뒤에 뒷면으로 펼쳐 둔다. 마주 앉아 보므로 그 사람의 왼쪽 끝이 내 쪽에서는 오른쪽 끝이다.
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
    // 손에 든 카드는 판 쪽을 향한다. 판 가운데보다 위에 앉은 사람은 자리 판 아래로, 아래에 앉은 사람은 위로 펼친다.
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
  // 이번에 받은 진행에서 누가 손패 몇 번째 카드를 냈는가
  if (view.phase === "exchange" && layout) {
    exchangeSlots.current = new Map(
      hand.map((card, i) => [card, layout.hand.slots[i] as Point]),
    );
  }
  const playedSlots = new Map<Card, number>();
  for (const e of events)
    if (e.type === "played" && e.slot !== null) playedSlots.set(e.card, e.slot);

  const effect = effectFor(view, events, seatName);
  const banner = mightyResultBanner(view, events, startMoney);
  const effectCards = effect?.cards ?? null;
  const bigEffect = Boolean(effect?.cards || effect?.lines);

  /** 4초 안에 그 자리에서 한 말 */
  const chatBubble = (seat: number): string | null => {
    if (!network) return null;
    const recent = [...chatMessages]
      .reverse()
      .find((m) => m.seat === seat && Date.now() - m.at < 4000);
    return recent ? `💬 ${recent.text}` : null;
  };

  const lastBid = (seat: number): string | null => {
    if (view.phase !== "election") return null;
    const entry = [...view.election.log].reverse().find((e) => e.seat === seat);
    if (!entry) return null;
    return entry.bid ? goalLabel(entry.bid, n) : "포기";
  };

  // 세로 화면은 패널이 양옆 자리 판을 가리지 않게 자리 판 아래부터 손패 위까지 쓴다.
  const panelArea = (() => {
    if (!layout) return { left: 0, width: 0, top: 0, bottom: 0 };
    // 판이 끝나 손패가 비면 손패 자리까지 패널이 쓴다.
    const handTop = hand.length === 0 ? stage.height : layout.hand.top;
    const cx = layout.center.x + layout.center.w / 2;
    const half =
      Math.min(
        Math.max(layout.center.w, 340),
        stage.width - 2 * layout.gutter,
      ) / 2;
    const plates = layout.seats.slice(1).map((s) => s.plate);
    if (layout.orientation === "landscape") {
      // 가로 화면도 패널이 맞은편 자리 판을 덮지 않게 그 아래에서 시작하고, 아래로는 손패 위까지 쓴다.
      const above = plates.filter(
        (p) =>
          p.x < cx + half && cx - half < p.x + p.w && p.y < layout.center.y,
      );
      const top = Math.max(
        layout.table.y,
        ...above.map((p) => p.y + p.h + layout.gutter),
      );
      const bottom = handTop - layout.gutter;
      // 눕힌 폰처럼 높이가 모자라면 양옆 자리 판 사이의 빈 곳까지 옆으로 넓힌다.
      let wide = half;
      if (bottom - top < 300) {
        const beside = plates.filter((p) => p.y < bottom && top < p.y + p.h);
        const leftLimit = Math.max(
          layout.gutter,
          ...beside
            .filter((p) => p.x + p.w / 2 < cx)
            .map((p) => p.x + p.w + layout.gutter),
        );
        const rightLimit = Math.min(
          stage.width - layout.gutter,
          ...beside
            .filter((p) => p.x + p.w / 2 >= cx)
            .map((p) => p.x - layout.gutter),
        );
        wide = Math.max(half, Math.min(cx - leftLimit, rightLimit - cx, 300));
      }
      return { left: cx - wide, width: wide * 2, top, bottom };
    }
    const bottom = handTop - layout.gutter;
    const platesBottom = Math.max(...plates.map((p) => p.y + p.h + 24));
    return {
      left: Math.max(layout.gutter, cx - half),
      width: half * 2,
      top: Math.min(platesBottom, bottom - 280),
      bottom,
    };
  })();

  const floorPile =
    floorMemo.current.round === view.roundNumber ? floorMemo.current.count : 0;
  const tableCenter: Point = layout
    ? {
        x: layout.center.x + layout.center.w / 2,
        y: layout.center.y + layout.center.h / 2,
      }
    : { x: 0, y: 0 };
  const myPile: Point = layout
    ? { x: stage.width / 2, y: layout.hand.slots[0]?.y ?? layout.hand.top }
    : { x: 0, y: 0 };
  // 선부터 차례로 카드를 받는 곳. 다른 사람은 손패 뒷면이 펼쳐질 자리에 쌓인다.
  const beginnerIndex = view.players.indexOf(view.beginner);
  const dealTargets = [
    ...view.players.slice(beginnerIndex),
    ...view.players.slice(0, beginnerIndex),
  ].map((seat) => {
    if (seat === view.seat) return myPile;
    const { x, y } = fanSlot(seat, 0, 1);
    return { x, y };
  });

  const compactHud = layout?.orientation === "portrait";

  const showPanel =
    layout !== null &&
    dealing === null &&
    shownTrick === null &&
    trickPlays.length === 0;
  const waiting = waitingText(view, seatName);

  return (
    <TermProvider>
      <div
        ref={stage.ref}
        className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)]"
        onPointerDown={onHandPointerDown}
        onPointerMove={onHandPointerMove}
        onPointerUp={onHandPointerUp}
        onPointerCancel={() => {
          touchGesture.current = null;
          setDragArmed(false);
        }}
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
                <Term
                  id={view.goal.kiruda === "NT" ? "noKiruda" : "goal"}
                  className="shrink-0 font-bold text-base"
                >
                  {goalLabel(view.goal, n)}
                </Term>
              ) : (
                <span className="shrink-0 opacity-70">공약 전</span>
              )}
              <span className="min-w-0 flex-1 truncate opacity-80">
                {view.declarer !== null && (
                  <>
                    <Term id="declarer">주공</Term> {seatName(view.declarer)}
                  </>
                )}
                {view.friendDeclaration && (
                  <>
                    {" · "}
                    <Term id="friend">
                      {friendLabel(view.friendDeclaration, seatName, {
                        rules,
                        kiruda,
                      })}
                    </Term>
                    {view.friend !== null && view.friendRevealed
                      ? ` → ${seatName(view.friend)}`
                      : ""}
                  </>
                )}
              </span>
              {shuffling && !dealing && !incident ? (
                <FairStatus shuffling={shuffling} />
              ) : (
                <span
                  className="shrink-0 tabular-nums opacity-80"
                  title="턴 진행과 아직 나오지 않은 점수 카드 수"
                >
                  {view.phase === "play"
                    ? compactHud
                      ? `${view.trickIndex + 1}/${lastTrickIndex(rules) + 1} · ${20 - pointsTaken}점`
                      : `${view.trickIndex + 1}/${lastTrickIndex(rules) + 1}턴 · 남은 점수 ${20 - pointsTaken}`
                    : `${view.roundNumber}판`}
                </span>
              )}
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

            {/* 버린 카드: 주공 손패에서 빠져 주공 자리로 빨려 들어간다 */}
            {events.flatMap((e) => {
              if (e.type !== "exchanged") return [];
              if (e.seat === view.seat) {
                return [...exchangeSlots.current]
                  .filter(([card]) => !view.hand.includes(card))
                  .map(([card, from], i) => (
                    <PlayingCard
                      key={`discard-${seq}-${card}`}
                      card={card}
                      width={layout.hand.card.w}
                      height={layout.hand.card.h}
                      from={{ ...from, y: from.y - layout.hand.card.h * 0.2 }}
                      at={{ ...myPile, scale: 0.4, opacity: 0 }}
                      delay={i * 90}
                      duration={600}
                      z={60 + i}
                    />
                  ));
              }
              const count = view.handCounts[e.seat] ?? 0;
              const discarded = floorMemo.current.count;
              return Array.from({ length: discarded }, (_, i) => {
                const from = fanSlot(e.seat, count + i, count + discarded);
                return (
                  <PlayingCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면 카드는 순서가 곧 정체다
                    key={`discard-${seq}-${i}`}
                    card={null}
                    width={fanCard.w}
                    height={fanCard.h}
                    from={{ x: from.x, y: from.y }}
                    at={{ ...plateCenter(e.seat), scale: 0.4, opacity: 0 }}
                    rotate={from.rotate}
                    delay={i * 90}
                    duration={600}
                    z={15 + i}
                  />
                );
              });
            })}

            {/* 다른 사람 손패(뒷면) */}
            {!dealing &&
              view.phase !== "roundEnd" &&
              view.phase !== "gameOver" &&
              layout.seats.slice(1).flatMap((seatLayout) => {
                const seat = view.order[
                  (myIndex + seatLayout.offset) % n
                ] as number;
                if (view.dead.includes(seat)) return [];
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
            {layout.seats.slice(1).map((seatLayout) => {
              const seat = view.order[
                (myIndex + seatLayout.offset) % n
              ] as number;
              const revealedFriend =
                view.friend === seat && view.friendRevealed;
              return (
                <SeatPlate
                  key={seat}
                  rect={seatLayout.plate}
                  name={seatName(seat)}
                  // 나눠 주는 동안은 아직 받지 않은 것으로 센다.
                  handCount={dealing ? 0 : (view.handCounts[seat] ?? 0)}
                  points={view.pointPiles?.[seat] ?? null}
                  pointCount={view.pointCounts[seat] ?? 0}
                  money={view.money[seat] ?? 0}
                  declarer={seat === view.declarer}
                  friend={revealedFriend}
                  ruling={seat === view.declarer || revealedFriend}
                  active={view.turn === seat && view.phase !== "roundEnd"}
                  leader={view.phase === "play" && trick?.leader === seat}
                  dead={view.dead.includes(seat)}
                  offline={offlineSeats.includes(seat)}
                  waiting={fair}
                  accused={incident?.seat === seat}
                  bubble={chatBubble(seat) ?? lastBid(seat)}
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
                shuffleMs={dealing.shuffleMs}
              />
            )}
            {/* 바닥 카드: 공약 동안 덱 자리에 두었다가 당선되면 주공에게 간다(원작 OnDeal 10) */}
            {!dealing &&
              floorPile > 0 &&
              (view.phase === "election" ||
                view.phase === "kill" ||
                view.phase === "exchange") &&
              Array.from({ length: floorPile }, (_, i) => (
                <PlayingCard
                  // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면 카드는 순서가 곧 정체다
                  key={`floor-${view.roundNumber}-${i}`}
                  card={null}
                  width={layout.trick.card.w}
                  height={layout.trick.card.h}
                  at={
                    view.phase === "exchange"
                      ? {
                          ...(view.declarer === view.seat ||
                          view.declarer === null
                            ? myPile
                            : plateCenter(view.declarer)),
                          scale: 0.5,
                          opacity: 0,
                        }
                      : { x: tableCenter.x, y: tableCenter.y - i * 0.35 }
                  }
                  z={10 + i}
                  delay={view.phase === "exchange" ? i * 80 : 0}
                  duration={view.phase === "exchange" ? 650 : 300}
                />
              ))}
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
                          ? layout.hand.card.h *
                            (dragArmed && selected === card ? 0.6 : 0.2)
                          : acting
                            ? 0
                            : -layout.hand.card.h * 0.04),
                    }}
                    // 바닥 카드는 가운데에서, 처음 받은 패는 나눠 받은 더미(손패 가운데)에서 펼쳐진다.
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
                    highlight={discards.includes(card)}
                    hint={hintCards.has(card)}
                    // 들어 올린 채면 표가 필요 없고, 내려놓았을 때만 바닥에서 온 카드임을 알린다.
                    fresh={
                      (freshCards?.has(card) ?? false) &&
                      !discards.includes(card)
                    }
                    interactive={acting && (exchanging || playable !== null)}
                    onActivate={(pointer) => onCardActivate(card, pointer)}
                    onHover={(on) =>
                      setHovered((h) => (on ? card : h === card ? null : h))
                    }
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
                    // 다른 사람 카드는 그 사람 손패에서 실제로 뽑은 자리에서 날아온다.
                    {...(offset === 0
                      ? {}
                      : {
                          from: (() => {
                            const slot = playedSlots.get(play.card);
                            if (slot === undefined)
                              return { ...plateCenter(play.seat), scale: 0.5 };
                            const count = (view.handCounts[play.seat] ?? 0) + 1;
                            const at = fanSlot(play.seat, slot, count);
                            return {
                              x: at.x,
                              y: at.y,
                              scale: fanCard.w / layout.trick.card.w,
                            };
                          })(),
                        })}
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
                {slangTerms()
                  ? jokerSuitLabel(trick.jokerSuit as Suit)
                  : `조커 → ${jokerSuitLabel(trick.jokerSuit as Suit)}`}
                {trick.jokerCalled ? ` · ${jokerCallLabel()}` : ""}
              </div>
            )}
            {trick?.jokerCalled &&
              !trick.jokerSuit &&
              trickPlays.length > 0 && (
                <div
                  className="absolute rounded-full bg-red-500 px-3 py-1 font-bold text-sm shadow"
                  style={{
                    left: layout.center.x + layout.center.w / 2,
                    top: layout.center.y - 8,
                    transform: "translate(-50%,-100%)",
                  }}
                >
                  {jokerCallLabel()}
                </div>
              )}

            {/* 판 가운데 행동 패널 */}
            {(showPanel || leadChoice) && !shuffling && (
              <div
                className="panel-area absolute z-[200] flex items-end justify-center"
                style={{
                  left: panelArea.left,
                  top: panelArea.top,
                  width: panelArea.width,
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
                        act({
                          type: "play",
                          card: leadChoice.card,
                          slot: hand.indexOf(leadChoice.card),
                          ...choice,
                        })
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
                  ) : (view.phase === "roundEnd" ||
                      view.phase === "gameOver") &&
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

            {/* 판 끝 승패 문구 */}
            <ResultBanner
              banner={banner}
              seq={seq}
              center={tableCenter}
              stageHeight={stage.height}
            />

            {/* 효과 글자: 당선, 마이티, 조커콜, 프렌드 공개 등 */}
            {effect && (
              <div
                key={seq}
                className={cn(
                  "pointer-events-none absolute z-[250] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl px-5 py-2 font-black text-2xl shadow-2xl",
                  bigEffect ? "effect-pop-long" : "effect-pop",
                  effect.lines && "px-7 py-3 text-center",
                  effect.tone === "gold" &&
                    "bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950",
                  effect.tone === "red" &&
                    "bg-gradient-to-b from-rose-400 to-rose-600 text-white",
                  effect.tone === "info" && "bg-black/75 text-white",
                )}
                style={{
                  left: tableCenter.x,
                  // 큰 발표는 진행 속도 설정에 맞춰 머문다.
                  ...(bigEffect
                    ? { animationDuration: `${2800 / speedSetting}ms` }
                    : {}),
                  top: bigEffect
                    ? tableCenter.y
                    : showPanel
                      ? Math.max(
                          layout.hud.y + layout.hud.h + 24,
                          panelArea.top - 24,
                        )
                      : layout.center.y + layout.center.h * 0.3,
                }}
              >
                {effect.text}
                {effect.lines?.map((line) => (
                  <div key={line} className="mt-1 font-bold text-base">
                    {line}
                  </div>
                ))}
                {effectCards && (
                  <div className="mt-2 flex justify-center gap-0.5">
                    {sortHand(effectCards, rules, null).map((card) => (
                      <div
                        key={card}
                        className="aspect-[5/7]"
                        style={{
                          width: Math.min(
                            56,
                            (stage.width - 64) / effectCards.length - 2,
                          ),
                        }}
                      >
                        <CardArt card={card} theme={theme} />
                      </div>
                    ))}
                  </div>
                )}
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
                <ChatBox mySeat={view.seat} />
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
              mySeat={view.seat}
              whoName={(seat) =>
                seat === view.seat ? "내 자리" : seatName(seat)
              }
              center={tableCenter}
              card={layout.trick.card}
              deckCount={deckFor(rules).length}
              top={layout.hud.y + layout.hud.h + 6}
            />
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

            {/* 카드 툴팁: 같은 무늬에서 아직 안 나온 더 높은 카드 */}
            {tipCard && tipSlot && (
              <div
                className="pointer-events-none absolute z-[290] -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/85 px-2 py-1 font-semibold text-xs shadow"
                style={{
                  left: tipSlot.x,
                  top: tipSlot.y - layout.hand.card.h / 2 - 34,
                }}
              >
                {cardTipText(tipCard, rules, kiruda, playedCards)}
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
    </TermProvider>
  );
}
