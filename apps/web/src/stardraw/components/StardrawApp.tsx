"use client";

import {
  DRAND_DELAY,
  drandRoundForClose,
  drandTime,
  equalBytes,
  RANKS,
  type RoundRecord,
  roundTimes,
  type Ticket,
  ticketId,
  toHex,
  type VerifyReport,
} from "@mighty/stardraw-core";
import { useEffect, useMemo, useState } from "react";
import { BackToGames } from "@/components/BackToGames";
import { useNoPullRefresh } from "@/game/no-pull-refresh";
import { cn } from "@/lib/cn";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { track } from "@/stats/track";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { type CheckSession, isActive } from "../checks";
import type { LedgerStatus } from "../local-ledger";
import { passkeyProblem } from "../passkey-env";
import { ensureRegistered } from "../registrar";
import { myRank, prizeEligible, RANK_RULE, winnerCounts } from "../results";
import { roundShort, roundTitle } from "../round-label";
import { GAME_NS, type Services, useLedger } from "../services";
import { NOTHING_SEALED, type Sealed, sealedFor } from "../spoiler";
import type { KeyInfo, MyTicket } from "../wallet";
import { CheckLink } from "./CheckLink";
import { DrawnNotice } from "./DrawnNotice";
import { DrawView } from "./DrawView";
import { EnterView } from "./EnterView";
import { GameIntro } from "./GameIntro";
import { Inbox } from "./Inbox";
import {
  DrawFirst,
  formatLeft,
  formatTime,
  LottoBall,
  RANK_LABEL,
  StardrawTitle,
  shortId,
} from "./parts";
import { Receipt } from "./Receipt";
import { StatsView } from "./StatsView";
import { ticketUrl } from "./TicketView";
import { WinNotice } from "./WinNotice";

type View =
  | { name: "home" }
  | { name: "enter" }
  | { name: "receipt"; id: string }
  | { name: "draw"; round: number }
  | { name: "mine" }
  | { name: "rounds" }
  | { name: "round"; round: number }
  /** 관측 기록(공개 장부 통계) */
  | { name: "stats" }
  /** 당첨자가 보낸 확인 링크(/stardraw/check#토큰) */
  | { name: "link"; token: string };

/** 화면마다 자기 주소(정적 내보내기라 실제 경로 페이지). 경로 안의 작은 화면은 # 조각으로 */
export type StardrawPage =
  | "home"
  | "enter"
  | "mine"
  | "rounds"
  | "check"
  | "stats";

const PATH: Record<StardrawPage, string> = {
  home: "/stardraw",
  enter: "/stardraw/enter",
  mine: "/stardraw/mine",
  rounds: "/stardraw/rounds",
  check: "/stardraw/check",
  stats: "/stardraw/stats",
};

/** 화면 → 주소. 뒤로가기·새로고침이 그 화면으로 돌아오게 브라우저 기록에 남긴다 */
function urlOf(v: View): string {
  switch (v.name) {
    case "home":
      return PATH.home;
    case "enter":
      return PATH.enter;
    case "mine":
      return PATH.mine;
    case "receipt":
      return `${PATH.mine}#t-${v.id}`;
    case "rounds":
      return PATH.rounds;
    case "round":
      return `${PATH.rounds}#${v.round}`;
    case "draw":
      return `${PATH.rounds}#draw-${v.round}`;
    case "link":
      return `${PATH.check}#${v.token}`;
    case "stats":
      return PATH.stats;
  }
}

/** 지금 주소의 경로가 어느 화면 페이지인지(끝 / 하나는 무시한다) */
function pageOf(pathname: string): StardrawPage {
  const p = pathname.replace(/\/+$/, "") || "/";
  const found = (Object.keys(PATH) as StardrawPage[]).find(
    (k) => PATH[k] === p,
  );
  return found ?? "home";
}

/** 지금 주소(경로와 # 조각) → 화면 */
function viewOfLocation(): View {
  return viewOf(pageOf(window.location.pathname), window.location.hash);
}

/** 주소 → 화면 */
function viewOf(page: StardrawPage, hash: string): View {
  const h = hash.replace(/^#/, "");
  if (page === "enter") return { name: "enter" };
  if (page === "check") return { name: "link", token: h };
  if (page === "stats") return { name: "stats" };
  if (page === "mine") {
    const t = /^t-([0-9a-f]{64})$/.exec(h);
    return t ? { name: "receipt", id: t[1] as string } : { name: "mine" };
  }
  if (page === "rounds") {
    let m = /^draw-(\d+)$/.exec(h);
    if (m) return { name: "draw", round: Number(m[1]) };
    m = /^(\d+)$/.exec(h);
    if (m) return { name: "round", round: Number(m[1]) };
    return { name: "rounds" };
  }
  return { name: "home" };
}

/** 막 응모해 영수증이 인쇄되어 나오는 중인 응모권(한 번만 연출한다) */
let printingId: string | null = null;
/** 이번 방문에서 별 따기 화면 사이를 옮겨 다녔는지(아니면 "돌아가기"가 사이트 밖으로 나가지 않게 정한 화면으로) */
let navigated = false;

/**
 * 하늘의 별 따기(docs/36 11절). 서버 주소가 없으면 이 기기 안 연습 장부로 돈다.
 * `page`는 처음 열린 페이지일 뿐이고, 그 뒤 화면은 늘 지금 주소(경로 + # 조각)에서 읽는다(go 참고)
 */
export function StardrawApp({ page = "home" }: { page?: StardrawPage }) {
  const { services, status, version, refresh } = useLedger();
  const [view, setView] = useState<View>(() =>
    typeof window === "undefined" ? viewOf(page, "") : viewOfLocation(),
  );
  // 별을 고르거나 추첨을 보다 화면이 당겨져 새로고침되지 않게(그 밖의 화면은 당겨서 새로고침이 된다)
  useNoPullRefresh(view.name === "enter" || view.name === "draw");
  const [mine, setMine] = useState<MyTicket[]>([]);
  /** 지갑을 한 번 읽었는지(그 전에는 영수증을 "찾을 수 없어요"로 보이지 않는다) */
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  /** 추첨이 끝났다는 알림 띠를 닫은 회차 */
  const [noticeClosed, setNoticeClosed] = useState<Set<number>>(new Set());
  // 응모 화면에서 영수증 주소로 옮겨 오며 넘긴 "인쇄 중" 표시는 이 페이지가 열릴 때 한 번만 받는다
  const [printing] = useState(() => {
    const id = printingId;
    printingId = null;
    return id;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    if (!services) return;
    setMine(services.wallet.loadTickets());
    setLoaded(true);
    setOpened(services.wallet.openedRounds());
    setNoticeClosed(services.wallet.noticeClosedRounds());
  }, [version, services]);

  // 뒤로가기·앞으로가기로 # 조각이 바뀌면 그 화면으로
  useEffect(() => {
    const sync = () => setView(viewOfLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // 추첨(결과)을 열면 그 회차는 "열어 봄": 첫 화면 결과 봉투에서 빠진다. 뒤로가기로 나가도 그대로다
  // (예전에는 「돌아가기」로 닫을 때만 기록해, 열지 못하거나 뒤로가기로 나가면 첫 화면이 그 봉투에 갇혔다)
  const drawRound = view.name === "draw" ? view.round : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 회차를 열 때 한 번
  useEffect(() => {
    if (!services || !loaded || drawRound === null) return;
    if (!services.ledger.record(drawRound)) return;
    services.wallet.markOpened(drawRound);
    setOpened(services.wallet.openedRounds());
  }, [drawRound, loaded, services, version]);

  /**
   * 다른 화면으로: 주소를 바꿔 기록에 남기고(replace면 지금 기록을 바꾼다) 이 화면 그대로 그 화면을 그린다.
   * 다른 경로(/stardraw → /stardraw/mine#t-…)로 갈 때도 Next 라우터를 쓰지 않는다. 라우터로 페이지를 바꾸면
   * 새 페이지가 그려지는 순간 주소의 # 조각이 아직 없어 목록으로 떨어지는 일이 폰에서 되풀이됐다
   * (2026-10-31 안드로이드: 봉투 → 지난 회차 목록, 첫 화면 「영수증」 → 내 응모 목록). 별 따기 화면은 모두 이
   * 한 부품이 그리니 페이지를 바꿀 까닭이 없다. 주소는 실제 경로라 새로고침·공유하면 그 페이지가 바로 열린다.
   * Next는 history.pushState를 자기 기록과 맞추고, 뒤로가기도 이 부품을 그대로 둔 채 popstate로 알려 준다
   */
  const go = (v: View, replace = false) => {
    const url = urlOf(v);
    navigated = true;
    if (replace) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState(window.history.state, "", url);
    setView(v);
    window.scrollTo({ top: 0 });
  };
  /** 화면의 "돌아가기": 옮겨 왔으면 바로 전 화면, 주소로 바로 열었으면 정한 화면으로 */
  const back = (fallback: View) => {
    if (navigated) window.history.back();
    else go(fallback, true);
  };
  /** 추첨을 아직 열어 보지 않은 내 회차(결과를 가린다, spoiler.ts) */
  const sealed: Sealed = services
    ? sealedFor(mine, opened, services.ledger)
    : NOTHING_SEALED;
  /** 알림 띠에 띄울 회차: 가렸고 띠를 닫지 않은 내 회차(추첨 화면에서는 띄우지 않는다) */
  const noticeRounds =
    view.name === "draw"
      ? []
      : [...new Set(mine.map((m) => m.ticket.round))]
          .filter((r) => sealed(r) && !noticeClosed.has(r))
          .sort((a, b) => a - b);
  const receiptOf = (id: string) =>
    mine.find((m) => toHex(ticketId(m.ticket)) === id);

  // 이미 응모한 회차의 응모판으로 들어오면(주소로 바로·뒤로가기) 빈 응모권 대신 그 영수증으로
  const enteredNow =
    view.name === "enter" && loaded && status?.phase === "open"
      ? mine.find((m) => m.ticket.round === status.round)
      : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 응모한 응모권이 정해질 때만 옮긴다
  useEffect(() => {
    if (enteredNow)
      go({ name: "receipt", id: toHex(ticketId(enteredNow.ticket)) }, true);
  }, [enteredNow]);

  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        {/* 서버 없이 이 기기 안에서만 도는 연습판(데모는 따로 자기 띠가 있다) */}
        {services?.practice && services.ns === GAME_NS && <PracticeBanner />}
        {services && (
          <DrawnNotice
            rounds={noticeRounds}
            schedule={services.ledger.schedule}
            onDraw={(round) => go({ name: "draw", round })}
            onClose={() => {
              services.wallet.closeNotice(noticeRounds);
              setNoticeClosed(services.wallet.noticeClosedRounds());
            }}
          />
        )}
        {!services || !status ? (
          <p className="py-20 text-center text-white/60">
            하늘을 펴고 있습니다
          </p>
        ) : view.name === "enter" ? (
          <EnterView
            services={services}
            status={status}
            onBack={() => back({ name: "home" })}
            onDone={(ticket, receivedAt) => {
              const m = { ticket, receivedAt };
              services.wallet.addTicket(m);
              setMine(services.wallet.loadTickets());
              track("game-start", { game: "stardraw", mode: "solo" });
              void refresh();
              // 응모 화면 기록을 영수증으로 바꾼다: 뒤로가기는 응모 전 화면으로
              const id = toHex(ticketId(ticket));
              printingId = id;
              go({ name: "receipt", id }, true);
            }}
          />
        ) : view.name === "receipt" ? (
          (() => {
            const m = receiptOf(view.id);
            if (!loaded) return null;
            if (!m)
              return (
                <p className="py-10 text-center text-white/60">
                  이 기기에서 이 응모권을 찾을 수 없어요
                </p>
              );
            return (
              <ReceiptView
                services={services}
                mine={m}
                sealed={sealed(m.ticket.round)}
                printing={printing === view.id}
                onBack={() => back({ name: "home" })}
                onDraw={(round) => go({ name: "draw", round })}
                onMine={() => go({ name: "mine" })}
              />
            );
          })()
        ) : view.name === "draw" ? (
          // 이 기기에서 이미 본 회차인지(열어 본 회차 기록)를 읽은 뒤에 그린다: 본 회차는 연출 없이 결과부터
          loaded && (
            <DrawFor
              services={services}
              status={status}
              round={view.round}
              mine={mine}
              seen={opened.has(view.round)}
              onEnter={() => {
                // 결과를 봤으니 첫 화면 봉투에서 빠진다
                services.wallet.markOpened(view.round);
                setOpened(services.wallet.openedRounds());
                go({ name: "enter" });
              }}
              onClose={() => {
                services.wallet.markOpened(view.round);
                setOpened(services.wallet.openedRounds());
                back({ name: "home" });
              }}
            />
          )
        ) : view.name === "mine" ? (
          <MineView
            services={services}
            mine={mine}
            sealed={sealed}
            onBack={() => back({ name: "home" })}
            onOpen={(m) =>
              go({ name: "receipt", id: toHex(ticketId(m.ticket)) })
            }
            onDraw={(round) => go({ name: "draw", round })}
            onRecovered={() => setMine(services.wallet.loadTickets())}
          />
        ) : view.name === "rounds" ? (
          <RoundsView
            services={services}
            version={version}
            sealed={sealed}
            onBack={() => back({ name: "home" })}
            onOpen={(round) => go({ name: "round", round })}
            onDraw={(round) => go({ name: "draw", round })}
            onStats={() => go({ name: "stats" })}
          />
        ) : view.name === "stats" ? (
          <StatsView
            services={services}
            version={version}
            sealed={sealed}
            onBack={() => back({ name: "rounds" })}
          />
        ) : view.name === "round" ? (
          <RoundDetail
            services={services}
            round={view.round}
            mine={mine}
            sealed={sealed}
            onBack={() => back({ name: "rounds" })}
            onDraw={(round) => go({ name: "draw", round })}
          />
        ) : view.name === "link" ? (
          <CheckLink
            key={view.token}
            services={services}
            token={view.token}
            sealed={sealed}
            onDraw={(round) => go({ name: "draw", round })}
          />
        ) : (
          <Home
            services={services}
            status={status}
            mine={mine}
            opened={opened}
            onEnter={() => go({ name: "enter" })}
            onReceipt={(m) =>
              go({ name: "receipt", id: toHex(ticketId(m.ticket)) })
            }
            onDraw={(round) => go({ name: "draw", round })}
            onMine={() => go({ name: "mine" })}
            onRounds={() => go({ name: "rounds" })}
            onSkip={
              services.practice
                ? async () => {
                    await services.practice?.skipToNextDraw();
                    await refresh();
                  }
                : null
            }
          />
        )}
        <footer className="pt-4 text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </div>
    </main>
  );
}

/** 서버 없는 연습판 띠 */
function PracticeBanner() {
  return (
    <p
      data-practice-banner
      className="rounded-xl border border-sky-200/30 bg-sky-200/10 px-3 py-1.5 text-center text-sky-50 text-sm"
    >
      연습 모드 · 이 기기 안에서만
    </p>
  );
}

export function Home({
  services,
  status,
  mine,
  opened,
  onEnter,
  onReceipt,
  onDraw,
  onMine,
  onRounds,
  onSkip,
}: {
  services: Services;
  status: LedgerStatus;
  mine: MyTicket[];
  opened: Set<number>;
  /** 응모 화면(등록증이 없으면 우주인 등록부터) */
  onEnter: () => void;
  onReceipt: (m: MyTicket) => void;
  onDraw: (round: number) => void;
  onMine: () => void;
  onRounds: () => void;
  /** 연습 장부일 때만(서버 장부는 시간을 건너뛸 수 없다) */
  onSkip: (() => Promise<void>) | null;
}) {
  const [skipping, setSkipping] = useState(false);
  // 이 기기의 등록증(첫 그리기 뒤에 읽는다: 서버에서 그린 화면과 어긋나지 않게)
  const [key, setKey] = useState<KeyInfo | null | undefined>(undefined);
  useEffect(() => {
    const found = services.wallet.loadKey();
    setKey(found);
    // 등록이 아직 장부에 오르지 않았으면 이어서 올린다(증명이 없는 예전 열쇠는 첫 응모 때)
    if (found && services.ns === GAME_NS)
      void ensureRegistered(services, found).catch(() => {});
  }, [services]);
  // 결과 봉투: 추첨이 끝났는데 아직 열어 보지 않은 내 응모권(가장 최근 것)
  const sealed = sealedFor(mine, opened, services.ledger);
  const envelope = mine
    .filter((m) => sealed(m.ticket.round))
    .sort((a, b) => b.ticket.round - a.ticket.round)[0];

  return (
    <>
      <header className="flex flex-col gap-4">
        <BackToGames />
        <StardrawTitle />
        {key !== undefined && <Greeting services={services} keyInfo={key} />}
      </header>

      {/* 정답 예시 하늘은 처음 온 사람이든 다녀간 사람이든 늘 같은 자리에(첫 화면 모양이 달라 헷갈렸다, 사용자) */}
      <GameIntro />

      <RoundCard
        services={services}
        status={status}
        mine={mine}
        envelope={envelope}
        onEnter={onEnter}
        onReceipt={onReceipt}
        onDraw={onDraw}
      />

      {/* 봉투가 떠 있는 동안은 지난 회차 카드를 두지 않는다(둘이 같은 곳으로 가는 것처럼 보였다, 2026-11-01 사용자). 봉투를 열면 다시 보인다 */}
      {!envelope && (
        <LastRound
          services={services}
          mine={mine}
          sealed={sealed}
          onRounds={onRounds}
          onDraw={onDraw}
        />
      )}

      <WinNotice
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
        compact
        onOpen={onMine}
      />
      <Inbox
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />

      {mine.length > 0 && (
        <button
          type="button"
          onClick={onMine}
          className="sd-glass flex items-center justify-between rounded-2xl px-4 py-3 text-left"
        >
          <span className="font-semibold">내 응모</span>
          <span className="text-sm text-white/60 tabular-nums">
            {mine.length}장 →
          </span>
        </button>
      )}

      {onSkip && (
        <button
          type="button"
          disabled={skipping}
          onClick={async () => {
            setSkipping(true);
            try {
              await onSkip();
            } finally {
              setSkipping(false);
            }
          }}
          className="self-center rounded-lg border border-white/15 border-dashed px-3 py-1.5 text-sm text-white/60 hover:bg-white/10 disabled:opacity-50"
        >
          {skipping ? "건너뛰고 있습니다" : "연습: 다음 추첨까지 건너뛰기"}
        </button>
      )}

      <nav
        aria-label="더 보기"
        className="flex justify-center gap-5 pt-2 text-sm text-white/60"
      >
        {[
          ["설명", "/stardraw/about"],
          ["배우기", "/stardraw/learn"],
          ["검증", "/stardraw/verify"],
          ["소속", "/stardraw/qualify"],
          ["데모", "/stardraw/demo"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="underline-offset-4 hover:text-white hover:underline"
          >
            {label}
          </a>
        ))}
      </nav>
    </>
  );
}

/**
 * 맨 위 인사. 이 기기에 등록증이 있으면 "○○에 거주하는 ○○ 님, 안녕하세요"(누르면 내 등록증, 밑줄 없는 은은한 링크),
 * 없으면 「우주인 등록」
 */
function Greeting({
  services,
  keyInfo,
}: {
  services: Services;
  keyInfo: KeyInfo | null;
}) {
  // 등록 전에는 인사를 비운다. 등록은 카드의 「별 6개 고르기」가 맡는다(같은 곳으로 가는 단추가 둘이었다, 2026-10-31 UX 시험)
  if (!keyInfo) return null;
  const a = astronautOf(keyInfo.pub);
  const text = `${residentPhrase(a)} 님, 안녕하세요`;
  // 데모·둘러보기의 가짜 우주인은 실제 게임의 내 등록증으로 잇지 않는다
  return services.ns === GAME_NS ? (
    <a
      href="/stardraw/id"
      data-greeting={a.number}
      className="self-center break-keep px-2 py-1 text-center text-sm text-white/85 no-underline transition-colors hover:text-amber-100"
    >
      {text}
    </a>
  ) : (
    <p
      data-greeting={a.number}
      className="self-center break-keep px-2 py-1 text-center text-sm text-white/85"
    >
      {text}
    </p>
  );
}

/** 시각만 "오후 3:00" */
function clockOf(seconds: number): string {
  return CLOCK.format(new Date(seconds * 1000));
}
const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 지금 회차 카드: 지금 할 일 하나와 지금 단계의 시계 하나만 크게.
 * 열지 않은 결과 → 「추첨 보기」, 응모 전 → 마감까지 + 「별 6개 고르기」, 응모함 → 추첨까지 + 고른 별 + 「영수증」,
 * 마감 뒤 추첨 전 → 추첨까지. 지금 아닌 시계는 작게
 */
function RoundCard({
  services,
  status: s,
  mine,
  envelope,
  onEnter,
  onReceipt,
  onDraw,
}: {
  services: Services;
  status: LedgerStatus;
  mine: MyTicket[];
  envelope: MyTicket | undefined;
  onEnter: () => void;
  onReceipt: (m: MyTicket) => void;
  onDraw: (round: number) => void;
}) {
  const schedule = services.ledger.schedule;
  // 앞 회차 추첨을 기다리는 동안은 그 회차가 지금 회차다
  const drawWaiting = s.phase === "waiting" && s.nextDrawRound < s.round;
  const round = drawWaiting ? s.nextDrawRound : s.round;
  const drawAt = drawWaiting ? s.nextDrawAt : s.times.closesAt + DRAND_DELAY;
  const closed = s.phase !== "open";
  const ticket = mine.find((m) => m.ticket.round === round);

  if (envelope) {
    const r = envelope.ticket.round;
    return (
      <section
        aria-label="추첨 결과"
        data-card="result"
        className="sd-glass flex flex-col items-center gap-4 rounded-3xl p-6 text-center"
      >
        <span className="font-bold text-lg tabular-nums">
          {roundShort(schedule, r)} 추첨 끝
        </span>
        <button
          type="button"
          onClick={() => onDraw(r)}
          data-envelope={r}
          className="sd-envelope flex h-28 w-44 items-end justify-center rounded-xl pb-3 font-bold text-slate-900"
        >
          추첨 보기
        </button>
        {!closed && (
          <span className="text-sm text-white/60 tabular-nums">
            {roundShort(schedule, s.round)} 마감까지{" "}
            {formatLeft(s.times.entryDeadline - s.now)}
          </span>
        )}
        {/* 결과를 열어 보지 않아도 지금 회차에 응모할 수 있게 */}
        {!closed && !mine.some((m) => m.ticket.round === s.round) && (
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-black text-lg text-slate-950"
          >
            별 6개 고르기
          </button>
        )}
      </section>
    );
  }

  const bigLabel = closed || ticket ? "추첨까지" : "마감까지";
  const big = closed || ticket ? drawAt - s.now : s.times.entryDeadline - s.now;
  return (
    <section
      aria-label="이번 회차"
      data-card={closed ? "drawing" : ticket ? "entered" : "open"}
      className="sd-glass flex flex-col items-center gap-4 rounded-3xl px-5 py-6 text-center"
    >
      <span className="font-bold text-lg tabular-nums" data-round-state>
        {roundShort(schedule, round)} {closed ? "마감" : "응모 중"}
      </span>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm text-white/60">{bigLabel}</span>
        <span
          className={cn(
            "font-bold font-mono text-6xl tabular-nums tracking-tight",
            bigLabel === "추첨까지" && "text-amber-100",
          )}
          data-countdown={bigLabel === "추첨까지" ? "draw" : "close"}
        >
          {formatLeft(big)}
        </span>
      </div>
      {ticket ? (
        <div className="flex w-full flex-col items-center gap-3">
          <span className="font-semibold text-amber-100">응모 완료</span>
          <span className="flex flex-wrap justify-center gap-1">
            {ticket.ticket.numbers.map((n) => (
              <LottoBall key={n} n={n} size="sm" />
            ))}
          </span>
          <button
            type="button"
            onClick={() => onReceipt(ticket)}
            className="w-full max-w-xs rounded-2xl border border-white/25 py-3 font-semibold hover:bg-white/10"
          >
            영수증
          </button>
        </div>
      ) : (
        !closed && (
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-4 font-black text-slate-950 text-xl"
          >
            별 6개 고르기
          </button>
        )
      )}
      <span className="text-white/50 text-xs tabular-nums">
        {closed
          ? `추첨 ${clockOf(drawAt)}`
          : ticket
            ? `마감 ${clockOf(s.times.closesAt)} · 응모 ${s.entries}장`
            : `추첨 ${clockOf(drawAt)} · 응모 ${s.entries}장`}
      </span>
    </section>
  );
}

/** 지난 회차 결과 한 줄(누르면 지난 회차). 내 응모권이 있으면 등수와 「다시 보기」 */
function LastRound({
  services,
  mine,
  sealed,
  onRounds,
  onDraw,
}: {
  services: Services;
  mine: MyTicket[];
  sealed: Sealed;
  onRounds: () => void;
  onDraw: (round: number) => void;
}) {
  const closed = services.ledger.closed();
  const record = closed.at(-1)?.record;
  if (!record) return null;
  const my = mine.find((m) => m.ticket.round === record.round);
  const rank = my && !record.void ? myRank(record, my.ticket) : null;
  if (sealed(record.round))
    return (
      <div className="sd-glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={onRounds}
          aria-label="지난 회차"
          data-last-round={record.round}
          className="min-w-0 flex-1 text-left text-white/60 text-xs tabular-nums"
        >
          지난 회차 · {roundShort(services.ledger.schedule, record.round)}
        </button>
        <DrawFirst round={record.round} onDraw={() => onDraw(record.round)} />
      </div>
    );
  return (
    <div className="sd-glass flex items-center gap-2 rounded-2xl px-4 py-3">
      <button
        type="button"
        onClick={onRounds}
        aria-label="지난 회차"
        data-last-round={record.round}
        className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
      >
        <span className="text-white/60 text-xs tabular-nums">
          지난 회차 · {roundShort(services.ledger.schedule, record.round)}
          {my && (
            <b
              className={cn(
                "ml-1.5 font-semibold",
                rank ? "text-amber-200" : "text-white/70",
              )}
            >
              {record.void
                ? "무효"
                : rank
                  ? `${RANK_LABEL[rank]} 당첨`
                  : "낙첨"}
            </b>
          )}
        </span>
        {record.void ? (
          <span className="text-amber-300/90 text-sm">무효 회차</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {record.numbers.map((n) => (
              <LottoBall
                key={n}
                n={n}
                size="sm"
                ring={!!my?.ticket.numbers.includes(n)}
              />
            ))}
            <span className="px-0.5 text-white/40">+</span>
            <LottoBall n={record.bonus} size="sm" />
          </span>
        )}
      </button>
      {my && !record.void && (
        <button
          type="button"
          onClick={() => onDraw(record.round)}
          className="shrink-0 rounded-lg border border-white/20 px-2.5 py-1.5 text-xs hover:bg-white/10"
        >
          다시 보기
        </button>
      )}
    </div>
  );
}

function ReceiptView({
  services,
  mine,
  sealed,
  printing,
  onBack,
  onDraw,
  onMine,
}: {
  services: Services;
  mine: MyTicket;
  sealed: boolean;
  printing?: boolean | undefined;
  onBack: () => void;
  onDraw: (round: number) => void;
  onMine: () => void;
}) {
  const record = services.ledger.record(mine.ticket.round);
  return (
    <section className="flex flex-col gap-4" aria-label="응모권">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-white/70 hover:text-white"
      >
        ← 처음으로
      </button>
      {printing && (
        <p role="status" className="text-center font-semibold text-amber-100">
          응모했습니다
        </p>
      )}
      <Receipt
        ticket={mine.ticket}
        receivedAt={mine.receivedAt}
        schedule={services.ledger.schedule}
        record={record}
        sealed={sealed}
        onDraw={() => onDraw(mine.ticket.round)}
        printing={printing}
      />
      <ShareTicket services={services} ticket={mine.ticket} />
      <button
        type="button"
        onClick={onMine}
        className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
      >
        내 응모
      </button>
      {record && !sealed && (
        <button
          type="button"
          onClick={() => onDraw(mine.ticket.round)}
          className="sd-cta rounded-2xl py-3 font-bold text-slate-950"
        >
          추첨 다시 보기
        </button>
      )}
    </section>
  );
}

/** 추첨 시각 "오후 3시", 분이 있으면 "오후 3시 20분" */
function koreanHour(seconds: number): string {
  const d = new Date(seconds * 1000);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
}

/** 응모권 공유: 공유 시트(Web Share)가 있으면 그것으로, 없으면 링크를 복사한다 */
function ShareTicket({
  services,
  ticket,
}: {
  services: Services;
  ticket: Ticket;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const closesAt = roundTimes(
      services.ledger.schedule,
      ticket.round,
    ).closesAt;
    const text = `하늘의 별 따기 ${roundShort(services.ledger.schedule, ticket.round)}에 응모했어요. 추첨은 ${koreanHour(drandTime(drandRoundForClose(closesAt)))}!`;
    const url = ticketUrl(window.location.origin, ticket);
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
      } catch {
        // 공유 시트를 닫았다
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      // 복사를 못 하면 아무 일도 하지 않는다
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
    >
      {copied ? "링크를 복사했어요" : "응모권 공유"}
    </button>
  );
}

function DrawFor({
  services,
  status,
  round,
  mine,
  seen,
  onClose,
  onEnter,
}: {
  services: Services;
  status: LedgerStatus;
  round: number;
  mine: MyTicket[];
  /** 이 기기에서 이미 결과까지 본 회차면 연출 없이 결과부터(「추첨 다시 보기」로 다시 돈다) */
  seen: boolean;
  onClose: () => void;
  onEnter: () => void;
}) {
  const record = services.ledger.record(round);
  const [replays, setReplays] = useState(0);
  if (!record) return null;
  const canEnter =
    status.phase === "open" &&
    status.round > round &&
    !mine.some((m) => m.ticket.round === status.round);
  return (
    <DrawView
      key={replays}
      instant={seen && replays === 0}
      onReplay={() => setReplays((n) => n + 1)}
      onNext={canEnter ? onEnter : undefined}
      record={record}
      ticket={mine.find((m) => m.ticket.round === round)?.ticket}
      onClose={onClose}
      clock={services.clock}
      label={roundTitle(services.ledger.schedule, round)}
    />
  );
}

export function MineView({
  services,
  mine,
  sealed = NOTHING_SEALED,
  onBack,
  onOpen,
  onDraw,
  onRecovered,
}: {
  services: Services;
  mine: MyTicket[];
  sealed?: Sealed;
  onBack: () => void;
  onOpen: (m: MyTicket) => void;
  onDraw?: (round: number) => void;
  onRecovered: () => void;
}) {
  const sorted = [...mine].sort((a, b) => b.ticket.round - a.ticket.round);
  const [key, setKey] = useState(() => services.wallet.loadKey());
  return (
    <section className="flex flex-col gap-4" aria-label="내 응모">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 처음으로
        </button>
        <h2 className="font-bold text-lg">내 응모</h2>
        <span className="w-16" />
      </div>
      {key && (
        <a
          href={services.ns === GAME_NS ? "/stardraw/id" : undefined}
          data-my-name
          className="sd-glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
        >
          <span className="flex flex-col">
            <span className="font-semibold">
              {astronautOf(key.pub).name} 우주인
            </span>
            <span className="font-mono text-white/55 text-xs tabular-nums">
              {astronautOf(key.pub).number}
            </span>
          </span>
          {services.ns === GAME_NS && <span className="text-white/60">→</span>}
        </a>
      )}
      <WinNotice
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />
      <Inbox
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 응모하지 않았습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((m) => {
            const hidden = sealed(m.ticket.round);
            const record = hidden
              ? undefined
              : services.ledger.record(m.ticket.round);
            const rank = record ? myRank(record, m.ticket) : null;
            return (
              <li
                key={toHex(ticketId(m.ticket))}
                className="sd-glass flex items-center gap-2 rounded-2xl pr-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-4 text-left"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums">
                      {roundTitle(services.ledger.schedule, m.ticket.round)}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        rank ? "text-amber-200" : "text-white/60",
                      )}
                    >
                      {hidden
                        ? null
                        : !record
                          ? "추첨 전"
                          : record.void
                            ? "무효 회차"
                            : rank
                              ? `${RANK_LABEL[rank]} 당첨`
                              : "낙첨"}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {m.ticket.numbers.map((n) => (
                      <LottoBall
                        key={n}
                        n={n}
                        size="sm"
                        dim={!!record && !record.numbers.includes(n)}
                      />
                    ))}
                  </span>
                </button>
                {hidden && (
                  <DrawFirst
                    round={m.ticket.round}
                    onDraw={onDraw && (() => onDraw(m.ticket.round))}
                    className="shrink-0"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 게임 화면은 단순하게: 패스키·보안 설명은 설명 페이지(/stardraw/about#passkey)에 둔다 */}
      {!key && (
        <RecoverKey
          services={services}
          onFound={(found) => {
            setKey(found);
            onRecovered();
          }}
        />
      )}
    </section>
  );
}

/**
 * 이 기기에 패스키 기억이 없을 때: 다른 기기에서 만든 패스키(따라온 것)로 한 번 확인하고,
 * 장부에서 그 패스키의 공개 열쇠를 찾아 닫힌 회차의 내 응모권을 모은다
 */
function RecoverKey({
  services,
  onFound,
}: {
  services: Services;
  onFound: (key: KeyInfo) => void;
}) {
  const [state, setState] = useState<
    "idle" | "working" | "missing" | "cancelled" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const find = async () => {
    setState("working");
    try {
      const key = await services.wallet.recoverPasskey((id) =>
        services.ledger.passkeyPub(id),
      );
      if (!key) {
        setState("missing");
        return;
      }
      for (const { tickets } of services.ledger.closed())
        for (const ticket of tickets)
          if (equalBytes(ticket.pub, key.pub))
            services.wallet.addTicket({
              ticket,
              // 받은 시각은 장부에 없어 그 회차가 열린 시각으로 적는다
              receivedAt: roundTimes(services.ledger.schedule, ticket.round)
                .opensAt,
            });
      onFound(key);
    } catch (err) {
      if (passkeyProblem(err) === "cancelled") setState("cancelled");
      else {
        setState("error");
        setMessage(err instanceof Error ? err.message : null);
      }
    }
  };
  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void find()}
        className="rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10 disabled:opacity-50"
      >
        {state === "working" ? "찾고 있습니다" : "이미 우주인 등록증이 있어요"}
      </button>
      {state === "missing" && (
        <p className="break-keep text-amber-100/85 text-xs">
          장부에 없는 등록증이에요.
        </p>
      )}
      {state === "cancelled" && (
        <p className="text-amber-100/85 text-xs">확인을 취소했어요.</p>
      )}
      {state === "error" && (
        <p className="break-keep text-rose-200 text-xs">
          {message ?? "찾지 못했어요. 잠시 뒤 다시 해 주세요."}
        </p>
      )}
    </div>
  );
}

export function RoundsView({
  services,
  version,
  sealed = NOTHING_SEALED,
  onBack,
  onOpen,
  onDraw,
  onStats,
}: {
  services: Services;
  version: number;
  sealed?: Sealed;
  onBack: () => void;
  onOpen: (round: number) => void;
  /** 가린 회차는 회차 결과 대신 추첨으로 */
  onDraw?: (round: number) => void;
  /** 관측 기록(통계)으로. 없으면 링크를 두지 않는다(데모 둘러보기) */
  onStats?: () => void;
}) {
  const [sessions, setSessions] = useState<CheckSession[]>([]);
  const [limit, setLimit] = useState(24);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    void services.checker.list().then(setSessions);
  }, [services, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  const closed = useMemo(
    () => services.ledger.closed().slice().reverse(),
    [services, version],
  );
  const openChecks = sessions.filter(isActive);
  const waitingStars = openChecks.filter((s) => s.status === "signed").length;

  return (
    <section className="flex flex-col gap-4" aria-label="지난 회차">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 처음으로
        </button>
        <h2 className="font-bold text-lg">지난 회차</h2>
        {onStats ? (
          <button
            type="button"
            onClick={onStats}
            className="w-16 text-right text-sm text-white/70 hover:text-white"
          >
            관측 기록
          </button>
        ) : (
          <span className="w-16" />
        )}
      </div>
      {openChecks.length > 0 && (
        <p className="sd-breathe rounded-xl border border-sky-200/25 bg-sky-300/5 px-4 py-3 text-sm">
          확인 중인 당첨자 {openChecks.length}건
          {waitingStars > 0
            ? ` · 별 세 개를 기다리는 중 ${waitingStars}건`
            : ""}
        </p>
      )}
      {closed.length === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 추첨한 회차가 없습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {closed.slice(0, limit).map(({ record }) => (
            <li key={record.round}>
              <RoundRow
                record={record}
                sealed={sealed(record.round)}
                label={roundTitle(services.ledger.schedule, record.round)}
                onOpen={() =>
                  sealed(record.round) && onDraw
                    ? onDraw(record.round)
                    : onOpen(record.round)
                }
              />
            </li>
          ))}
        </ul>
      )}
      {closed.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 24)}
          className="rounded-xl border border-white/15 py-2 text-sm hover:bg-white/10"
        >
          더 보기
        </button>
      )}
    </section>
  );
}

function RoundRow({
  record,
  sealed,
  label,
  onOpen,
}: {
  record: RoundRecord;
  /** 추첨을 아직 열어 보지 않은 내 회차: 결과와 당첨 수 대신 「추첨 보기」 */
  sealed: boolean;
  /** 보이는 회차 이름(roundTitle) */
  label: string;
  onOpen: () => void;
}) {
  const counts = winnerCounts(record);
  const winners = RANKS.reduce((s, r) => s + counts[r], 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-round={record.round}
      className="sd-glass flex w-full flex-col gap-2 rounded-2xl px-4 py-3 text-left"
    >
      <span className="flex items-baseline justify-between">
        <span className="font-semibold tabular-nums">{label}</span>
        <span className="text-white/55 text-xs tabular-nums">
          응모 {record.count}장{sealed ? "" : ` · 당첨 ${winners}장`}
        </span>
      </span>
      {sealed ? (
        <DrawFirst round={record.round} className="self-start" />
      ) : record.void ? (
        <span className="text-amber-300/90 text-sm">무효 회차</span>
      ) : (
        <span className="flex flex-wrap items-center gap-1">
          {record.numbers.map((n) => (
            <LottoBall key={n} n={n} size="sm" />
          ))}
          <span className="px-0.5 text-white/40">+</span>
          <LottoBall n={record.bonus} size="sm" />
        </span>
      )}
    </button>
  );
}

function RoundDetail({
  services,
  round,
  mine,
  sealed,
  onBack,
  onDraw,
}: {
  services: Services;
  round: number;
  mine: MyTicket[];
  sealed: Sealed;
  onBack: () => void;
  onDraw: (round: number) => void;
}) {
  const record = services.ledger.record(round);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [checking, setChecking] = useState(false);
  /** 이 기기에서 당첨자 확인을 마친 응모권 */
  const [checked, setChecked] = useState<Map<string, CheckSession>>(new Map());
  useEffect(() => {
    void services.checker.confirmed().then(setChecked);
  }, [services]);
  if (!record) return null;
  const counts = winnerCounts(record);
  const myIds = new Set(mine.map((m) => toHex(ticketId(m.ticket))));
  const prize = prizeEligible(services.ledger.ticketsOf(round));
  const myExcluded = mine.some(
    (m) =>
      m.ticket.round === round &&
      m.ticket.qual &&
      !prize.eligible.has(toHex(ticketId(m.ticket))),
  );
  const prizeWinners = RANKS.flatMap((r) =>
    record.winners[r].filter((id) => prize.eligible.has(toHex(id))),
  ).length;
  const hidden = sealed(round);

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={roundTitle(services.ledger.schedule, round)}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 지난 회차
        </button>
        <h2 className="font-bold text-lg tabular-nums">
          {roundTitle(services.ledger.schedule, round)}
        </h2>
        {hidden ? (
          <span className="w-16" />
        ) : (
          <button
            type="button"
            onClick={() => onDraw(round)}
            className="text-sm text-white/70 hover:text-white"
          >
            추첨 보기
          </button>
        )}
      </div>
      {hidden && (
        <div className="sd-glass flex justify-center rounded-2xl p-4">
          <DrawFirst round={round} onDraw={() => onDraw(round)} />
        </div>
      )}
      {!hidden && !record.void && (
        <div className="sd-glass flex flex-wrap items-center justify-center gap-1.5 rounded-2xl p-4">
          {record.numbers.map((n) => (
            <LottoBall key={n} n={n} />
          ))}
          <span className="px-1 text-white/40">+</span>
          <LottoBall n={record.bonus} />
        </div>
      )}
      <p className="text-center text-white/55 text-xs tabular-nums">
        응모 {record.count}장 · 마감 {formatTime(closesOf(services, round))}
      </p>

      {!hidden && prize.any && (
        <p
          className="break-keep text-center text-amber-100/90 text-sm"
          data-prize-summary
        >
          소속이 표시된 당첨 {prizeWinners}장
          {prize.excluded > 0 &&
            ` · 같은 소속 증서로 낸 장은 소속 표시에서 빠졌습니다`}
        </p>
      )}
      {myExcluded && (
        <p
          role="alert"
          className="break-keep rounded-lg bg-rose-500/15 px-3 py-2 text-rose-100 text-sm"
          data-prize-mine-excluded
        >
          이 회차에 내 소속 증서가 다른 곳에서도 쓰였습니다. 복구 코드가 새
          나갔을 수 있습니다. 다음 자격 기간에 새로 받아 주세요.
        </p>
      )}

      {!hidden && (
        <ul className="flex flex-col gap-2" aria-label="등수별 당첨">
          {RANKS.map((rank) => (
            <li
              key={rank}
              data-rank={rank}
              className="sd-glass flex flex-col gap-2 rounded-2xl px-4 py-3"
            >
              <span className="flex items-center justify-between gap-2">
                <span>
                  <b>{RANK_LABEL[rank]}</b>{" "}
                  <span className="text-white/55 text-xs">
                    {RANK_RULE[rank]}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{counts[rank]}장</span>
              </span>
              {record.winners[rank].map((id) => {
                const hex = toHex(id);
                const done = checked.get(hex);
                const nickname = record.nicknames.find(
                  (n) => toHex(n.ticketId) === hex,
                )?.nickname;
                return (
                  <span
                    key={hex}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-mono text-white/70 tabular-nums">
                      {shortId(hex)}
                    </span>
                    <span className="text-white/80">
                      {myIds.has(hex) ? "내 응모권" : (nickname ?? "익명")}
                      {prize.eligible.has(hex) && (
                        <span
                          className="ml-1.5 rounded bg-amber-200/15 px-1.5 py-0.5 text-amber-100 text-xs"
                          data-prize-eligible
                        >
                          소속
                        </span>
                      )}
                    </span>
                    {done && (
                      <span
                        data-checked={hex}
                        className="w-full text-emerald-200/90 text-xs"
                      >
                        확인함
                        {done.confirmedAt
                          ? ` · ${monthDay(done.confirmedAt)}`
                          : ""}
                      </span>
                    )}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 p-4">
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            setReport(
              await services.ledger.verify(mine.map((m) => ticketId(m.ticket))),
            );
            setChecking(false);
          }}
          className="self-start rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          {checking ? "검사하고 있습니다" : "장부 검사"}
        </button>
        {report && (
          <div
            role="status"
            className="text-sm"
            data-verify={report.problems.length === 0 ? "ok" : "fail"}
          >
            {report.problems.length === 0 ? (
              <p className="text-emerald-200">문제가 없습니다</p>
            ) : (
              <ul className="list-disc pl-5 text-rose-200">
                {/* 가린 회차의 문제는 회차만(문구에 당첨 번호가 들어갈 수 있다) */}
                {report.problems.map((p) => (
                  <li key={`${p.round}-${p.message}`}>
                    {sealed(p.round) ? (
                      <span className="inline-flex items-center gap-2">
                        {p.round}회
                        <DrawFirst
                          round={p.round}
                          onDraw={() => onDraw(p.round)}
                        />
                      </span>
                    ) : (
                      `${p.round}회: ${p.message}`
                    )}
                  </li>
                ))}
              </ul>
            )}
            {services.practice && (
              <p className="mt-1 text-white/50 text-xs">
                연습이라 추첨 난수와 마감 시각 증명은 따로 확인하지 않습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function closesOf(services: Services, round: number): number {
  return roundTimes(services.ledger.schedule, round).closesAt;
}

/** 확인한 날짜(예: 10/30) */
function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
