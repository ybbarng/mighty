"use client";

import {
  DRAND_DELAY,
  drandRoundForClose,
  drandTime,
  equalBytes,
  RANKS,
  type Rank,
  type RoundRecord,
  roundTimes,
  type Ticket,
  ticketId,
  toHex,
  type VerifyReport,
} from "@mighty/stardraw-core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { useNoPullRefresh } from "@/game/no-pull-refresh";
import { cn } from "@/lib/cn";
import { track } from "@/stats/track";

import { type CheckBatch, type CheckTicket, isActive } from "../checks";
import type { LedgerStatus } from "../local-ledger";
import { passkeyProblem } from "../passkey-env";
import { myRank, RANK_RULE, winnerCounts } from "../results";
import { type Services, useLedger } from "../services";
import type { KeyInfo, MyTicket } from "../wallet";
import { CheckPanel } from "./CheckPanel";
import { DrawView } from "./DrawView";
import { EnterView } from "./EnterView";
import { Inbox } from "./Inbox";
import {
  formatLeft,
  formatTime,
  LottoBall,
  RANK_LABEL,
  scheduleLine,
  shortId,
} from "./parts";
import { Receipt } from "./Receipt";
import { ticketUrl } from "./TicketView";

type View =
  | { name: "home" }
  | { name: "enter" }
  | { name: "receipt"; id: string }
  | { name: "draw"; round: number }
  | { name: "mine" }
  | { name: "rounds" }
  | { name: "round"; round: number }
  | { name: "check"; round: number; rank: Rank };

/** 화면마다 자기 주소(정적 내보내기라 실제 경로 페이지). 경로 안의 작은 화면은 # 조각으로 */
export type StardrawPage = "home" | "enter" | "mine" | "rounds";

const PATH: Record<StardrawPage, string> = {
  home: "/stardraw",
  enter: "/stardraw/enter",
  mine: "/stardraw/mine",
  rounds: "/stardraw/rounds",
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
    case "check":
      return `${PATH.rounds}#check-${v.round}-${v.rank}`;
  }
}

/** 주소 → 화면 */
function viewOf(page: StardrawPage, hash: string): View {
  const h = hash.replace(/^#/, "");
  if (page === "enter") return { name: "enter" };
  if (page === "mine") {
    const t = /^t-([0-9a-f]{64})$/.exec(h);
    return t ? { name: "receipt", id: t[1] as string } : { name: "mine" };
  }
  if (page === "rounds") {
    let m = /^draw-(\d+)$/.exec(h);
    if (m) return { name: "draw", round: Number(m[1]) };
    m = /^check-(\d+)-([1-5])$/.exec(h);
    if (m)
      return { name: "check", round: Number(m[1]), rank: Number(m[2]) as Rank };
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

export const TAGLINE = "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?";

/** 하늘의 별 따기(docs/36 11절). 서버 주소가 없으면 이 기기 안 연습 장부로 돈다 */
export function StardrawApp({ page = "home" }: { page?: StardrawPage }) {
  const { services, status, version, refresh } = useLedger();
  const router = useRouter();
  const [view, setView] = useState<View>(() =>
    typeof window === "undefined"
      ? viewOf(page, "")
      : viewOf(page, window.location.hash),
  );
  // 별을 고르거나 추첨을 보다 화면이 당겨져 새로고침되지 않게(그 밖의 화면은 당겨서 새로고침이 된다)
  useNoPullRefresh(view.name === "enter" || view.name === "draw");
  const [mine, setMine] = useState<MyTicket[]>([]);
  /** 지갑을 한 번 읽었는지(그 전에는 영수증을 "찾을 수 없어요"로 보이지 않는다) */
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState<Set<number>>(new Set());
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
  }, [version, services]);

  // 뒤로가기·앞으로가기로 # 조각이 바뀌면 그 화면으로
  useEffect(() => {
    const sync = () => setView(viewOf(page, window.location.hash));
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [page]);

  /** 다른 화면으로: 주소를 바꿔 기록에 남긴다(replace면 지금 기록을 바꾼다) */
  const go = (v: View, replace = false) => {
    const url = urlOf(v);
    navigated = true;
    if (replace) router.replace(url);
    else router.push(url);
    if (url.split("#")[0] === PATH[page]) setView(v);
    window.scrollTo({ top: 0 });
  };
  /** 화면의 "돌아가기": 옮겨 왔으면 바로 전 화면, 주소로 바로 열었으면 정한 화면으로 */
  const back = (fallback: View) => {
    if (navigated) router.back();
    else go(fallback, true);
  };
  const receiptOf = (id: string) =>
    mine.find((m) => toHex(ticketId(m.ticket)) === id);

  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        {services?.ledger.mode === "trial" && (
          <p
            role="note"
            data-trial-banner
            className="rounded-xl border border-amber-200/40 bg-amber-200/10 px-3 py-2 text-center text-amber-50 text-sm"
          >
            시험 운영 중 · 응모 기록은 정식 시작 때 지워집니다
          </p>
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
                printing={printing === view.id}
                onBack={() => back({ name: "home" })}
                onDraw={(round) => go({ name: "draw", round })}
              />
            );
          })()
        ) : view.name === "draw" ? (
          <DrawFor
            services={services}
            round={view.round}
            mine={mine}
            onClose={() => {
              services.wallet.markOpened(view.round);
              setOpened(services.wallet.openedRounds());
              back({ name: "home" });
            }}
          />
        ) : view.name === "mine" ? (
          <MineView
            services={services}
            mine={mine}
            onBack={() => back({ name: "home" })}
            onOpen={(m) =>
              go({ name: "receipt", id: toHex(ticketId(m.ticket)) })
            }
            onRecovered={() => setMine(services.wallet.loadTickets())}
          />
        ) : view.name === "rounds" ? (
          <RoundsView
            services={services}
            version={version}
            onBack={() => back({ name: "home" })}
            onOpen={(round) => go({ name: "round", round })}
          />
        ) : view.name === "round" ? (
          <RoundDetail
            services={services}
            round={view.round}
            mine={mine}
            onBack={() => back({ name: "rounds" })}
            onCheck={(rank) => go({ name: "check", round: view.round, rank })}
            onDraw={() => go({ name: "draw", round: view.round })}
          />
        ) : view.name === "check" ? (
          <CheckPanel
            services={services}
            round={view.round}
            rank={view.rank}
            tickets={winnersOf(services, view.round, view.rank)}
            onClose={() => back({ name: "round", round: view.round })}
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
          <MadeWith />
        </footer>
      </div>
    </main>
  );
}

function winnersOf(services: Services, round: number, rank: Rank): Ticket[] {
  const record = services.ledger.record(round);
  if (!record) return [];
  const ids = new Set(record.winners[rank].map(toHex));
  return services.ledger
    .ticketsOf(round)
    .filter((t) => ids.has(toHex(ticketId(t))));
}

function Home({
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
  onEnter: () => void;
  onReceipt: (m: MyTicket) => void;
  onDraw: (round: number) => void;
  onMine: () => void;
  onRounds: () => void;
  /** 연습 장부일 때만(서버 장부는 시간을 건너뛸 수 없다) */
  onSkip: (() => Promise<void>) | null;
}) {
  const [skipping, setSkipping] = useState(false);
  const current = mine.find((m) => m.ticket.round === status.round);
  // 결과 봉투: 추첨이 끝났는데 아직 열어 보지 않은 내 응모권
  const envelopes = mine
    .filter(
      (m) =>
        services.ledger.record(m.ticket.round) && !opened.has(m.ticket.round),
    )
    .sort((a, b) => b.ticket.round - a.ticket.round);
  // 이번 회차 추첨은 마감 5분 뒤(drand). 앞 회차 추첨을 기다리는 동안은 그쪽을 센다
  const drawAt =
    status.phase === "waiting" && status.nextDrawRound < status.round
      ? status.nextDrawAt
      : status.times.closesAt + DRAND_DELAY;

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <BackToGames />
          <a
            href="/stardraw/about"
            className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            설명
          </a>
        </div>
        <div className="sd-title flex flex-col gap-1 pt-2 text-center">
          <h1 className="font-black text-4xl tracking-tight">하늘의 별 따기</h1>
          <p className="break-keep text-sm text-white/70">{TAGLINE}</p>
        </div>
      </header>

      <section
        aria-label="이번 회차"
        className="sd-glass flex flex-col gap-4 rounded-3xl p-5"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-xl tabular-nums">
            제 {status.round}회
          </span>
          <span className="text-sm text-white/60" data-schedule-line>
            {scheduleLine(status.times.entry.length)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 py-1 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm text-white/60">
              {status.phase === "closing" ? "곧 마감" : "마감까지"}
            </span>
            <span
              className="font-mono font-bold text-4xl tabular-nums tracking-tight"
              data-countdown="close"
            >
              {formatLeft(status.times.entryDeadline - status.now)}
            </span>
            <span className="text-white/45 text-xs">
              {formatTime(status.times.closesAt)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm text-white/60">
              {drawAt === status.nextDrawAt &&
              status.nextDrawRound < status.round
                ? "앞 회차 추첨까지"
                : "추첨까지"}
            </span>
            <span
              className="font-mono font-bold text-4xl text-amber-100 tabular-nums tracking-tight"
              data-countdown="draw"
            >
              {formatLeft(drawAt - status.now)}
            </span>
            <span className="text-white/45 text-xs">{formatTime(drawAt)}</span>
          </div>
        </div>
        {current ? (
          <button
            type="button"
            onClick={() => onReceipt(current)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-left"
          >
            <span className="flex flex-col">
              <span className="font-semibold">이번 회차에 응모했습니다</span>
              <span className="text-sm text-white/65">응모권 보기</span>
            </span>
            <span className="flex gap-1">
              {current.ticket.numbers.map((n) => (
                <LottoBall key={n} n={n} size="sm" />
              ))}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={status.phase !== "open"}
            onClick={onEnter}
            className="sd-cta rounded-2xl py-4 font-black text-slate-950 text-xl disabled:opacity-40"
          >
            {status.phase === "open"
              ? "별 6개 고르러 가기"
              : status.phase === "closing"
                ? "응모가 마감되었습니다"
                : "앞 회차 추첨을 기다립니다"}
          </button>
        )}
        <p className="text-center text-white/50 text-xs tabular-nums">
          이번 회차 응모 {status.entries}장 · 한 열쇠는 회차마다 한 장
        </p>
      </section>

      <Inbox services={services} tickets={mine.map((m) => m.ticket)} />

      {envelopes.length > 0 && (
        <section aria-label="결과 봉투" className="flex flex-col gap-2">
          <h2 className="font-bold">결과 봉투 {envelopes.length}장</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {envelopes.map((m) => (
              <button
                key={m.ticket.round}
                type="button"
                onClick={() => onDraw(m.ticket.round)}
                data-envelope={m.ticket.round}
                className="sd-envelope flex w-32 shrink-0 flex-col items-center gap-1 rounded-xl px-3 pt-12 pb-3 text-slate-900"
              >
                <span className="font-bold tabular-nums">
                  제 {m.ticket.round}회
                </span>
                <span className="text-xs">눌러서 추첨 보기</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onMine}
          className="sd-glass flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left"
        >
          <span className="font-semibold">내 응모</span>
          <span className="text-white/60 text-xs tabular-nums">
            응모권 {mine.length}장 · 당첨자 확인 요청
          </span>
        </button>
        <button
          type="button"
          onClick={onRounds}
          className="sd-glass flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left"
        >
          <span className="font-semibold">지난 회차</span>
          <span className="text-white/60 text-xs">
            당첨 번호 · 당첨자 확인 · 장부 검사
          </span>
        </button>
      </section>

      <Odds />

      {onSkip && (
        <section className="flex flex-col gap-2 rounded-2xl border border-white/10 border-dashed p-4 text-sm text-white/65">
          <p className="break-keep">
            지금은 서버가 열리기 전이라, 이 기기 안 연습 장부로 돌아갑니다. 연습
            참가자 24명이 회차마다 함께 응모합니다. 상품은 없습니다.
          </p>
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
            className="self-start rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10 disabled:opacity-50"
          >
            {skipping ? "건너뛰고 있습니다" : "연습: 다음 추첨까지 건너뛰기"}
          </button>
        </section>
      )}
    </>
  );
}

/** 로또 1등과 눈에 보이는 별 하나 맞히기 확률 비교 */
function Odds() {
  return (
    <section
      aria-label="확률 비교"
      className="sd-glass grid grid-cols-2 gap-px overflow-hidden rounded-2xl"
    >
      <div className="flex flex-col gap-1 p-4">
        <span className="text-white/60 text-xs">
          눈에 보이는 별 하나 맞히기
        </span>
        <span className="font-mono font-bold text-2xl tabular-nums">
          1/9,000
        </span>
        <span className="text-white/55 text-xs">눈에 보이는 별 약 9천 개</span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <span className="text-white/60 text-xs">로또 1등</span>
        <span className="font-mono font-bold text-2xl tabular-nums">
          1/8,145,060
        </span>
        <span className="text-white/55 text-xs">45개 중 6개</span>
      </div>
      <p className="col-span-2 border-white/10 border-t p-3 text-center text-sm">
        로또 1등이 약 <b className="text-amber-200">900배</b> 더 어렵습니다
      </p>
    </section>
  );
}

function ReceiptView({
  services,
  mine,
  printing,
  onBack,
  onDraw,
}: {
  services: Services;
  mine: MyTicket;
  printing?: boolean | undefined;
  onBack: () => void;
  onDraw: (round: number) => void;
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
          응모했습니다. 추첨까지 하늘을 지켜봐 주세요
        </p>
      )}
      <Receipt
        ticket={mine.ticket}
        receivedAt={mine.receivedAt}
        schedule={services.ledger.schedule}
        record={record}
        printing={printing}
      />
      <ShareTicket services={services} ticket={mine.ticket} />
      {record && (
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
    const text = `하늘의 별 따기 ${ticket.round}회에 응모했어요. 추첨은 ${koreanHour(drandTime(drandRoundForClose(closesAt)))}!`;
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
  round,
  mine,
  onClose,
}: {
  services: Services;
  round: number;
  mine: MyTicket[];
  onClose: () => void;
}) {
  const record = services.ledger.record(round);
  if (!record) return null;
  return (
    <DrawView
      record={record}
      ticket={mine.find((m) => m.ticket.round === round)?.ticket}
      onClose={onClose}
      clock={services.clock}
    />
  );
}

function MineView({
  services,
  mine,
  onBack,
  onOpen,
  onRecovered,
}: {
  services: Services;
  mine: MyTicket[];
  onBack: () => void;
  onOpen: (m: MyTicket) => void;
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
      <Inbox services={services} tickets={mine.map((m) => m.ticket)} />
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 응모하지 않았습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((m) => {
            const record = services.ledger.record(m.ticket.round);
            const rank = record ? myRank(record, m.ticket) : null;
            return (
              <li key={toHex(ticketId(m.ticket))}>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="sd-glass flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums">
                      제 {m.ticket.round}회
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        rank ? "text-amber-200" : "text-white/60",
                      )}
                    >
                      {!record
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
      setState(passkeyProblem(err) === "cancelled" ? "cancelled" : "error");
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <p className="break-keep text-white/80">
        이 기기에는 아직 패스키가 없어요. 다른 기기에서 응모했다면, 따라온
        패스키로 내 응모권을 찾을 수 있어요.
      </p>
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void find()}
        className="self-start rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10 disabled:opacity-50"
      >
        {state === "working" ? "찾고 있습니다" : "다른 기기에서 내 응모권 찾기"}
      </button>
      {state === "missing" && (
        <p className="break-keep text-amber-100/85 text-xs">
          장부에서 이 패스키를 찾지 못했어요.
          {services.practice && " 연습 장부는 기기마다 따로예요."}
        </p>
      )}
      {state === "cancelled" && (
        <p className="text-amber-100/85 text-xs">패스키 확인을 취소했어요.</p>
      )}
      {state === "error" && (
        <p className="text-rose-200 text-xs">
          찾지 못했어요. 잠시 뒤 다시 해 주세요.
        </p>
      )}
    </div>
  );
}

function RoundsView({
  services,
  version,
  onBack,
  onOpen,
}: {
  services: Services;
  version: number;
  onBack: () => void;
  onOpen: (round: number) => void;
}) {
  const [batches, setBatches] = useState<CheckBatch[]>([]);
  const [limit, setLimit] = useState(24);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    void services.checker.list().then(setBatches);
  }, [services, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  const closed = useMemo(
    () => services.ledger.closed().slice().reverse(),
    [services, version],
  );
  const openChecks = batches.filter(isActive);
  const waitingStars = openChecks.filter((b) =>
    b.tickets.some((t) => t.status === "signed"),
  ).length;

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
        <span className="w-16" />
      </div>
      {openChecks.length > 0 && (
        <p className="sd-breathe rounded-xl border border-sky-200/25 bg-sky-300/5 px-4 py-3 text-sm">
          확인 중인 요청 {openChecks.length}건
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
              <RoundRow record={record} onOpen={() => onOpen(record.round)} />
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
  onOpen,
}: {
  record: RoundRecord;
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
        <span className="font-semibold tabular-nums">제 {record.round}회</span>
        <span className="text-white/55 text-xs tabular-nums">
          응모 {record.count}장 · 당첨 {winners}장
        </span>
      </span>
      {record.void ? (
        <span className="text-sm text-white/60">무효 회차</span>
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
  onBack,
  onCheck,
  onDraw,
}: {
  services: Services;
  round: number;
  mine: MyTicket[];
  onBack: () => void;
  onCheck: (rank: Rank) => void;
  onDraw: () => void;
}) {
  const record = services.ledger.record(round);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [checking, setChecking] = useState(false);
  /** 이 기기에서 당첨자 확인을 마친 응모권 */
  const [checked, setChecked] = useState<Map<string, CheckTicket>>(new Map());
  useEffect(() => {
    void services.checker.confirmed().then(setChecked);
  }, [services]);
  if (!record) return null;
  const counts = winnerCounts(record);
  const myIds = new Set(mine.map((m) => toHex(ticketId(m.ticket))));

  return (
    <section className="flex flex-col gap-4" aria-label={`제 ${round}회`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 지난 회차
        </button>
        <h2 className="font-bold text-lg tabular-nums">제 {round}회</h2>
        <button
          type="button"
          onClick={onDraw}
          className="text-sm text-white/70 hover:text-white"
        >
          추첨 보기
        </button>
      </div>
      {!record.void && (
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
                <span className="text-white/55 text-xs">{RANK_RULE[rank]}</span>
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
            {counts[rank] > 0 && (
              <button
                type="button"
                onClick={() => onCheck(rank)}
                className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-100 text-sm hover:bg-amber-200/10"
              >
                당첨자 확인
              </button>
            )}
          </li>
        ))}
      </ul>

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
          {checking ? "장부를 처음부터 다시 계산하고 있습니다" : "장부 검사"}
        </button>
        {report && (
          <div
            role="status"
            className="text-sm"
            data-verify={report.problems.length === 0 ? "ok" : "fail"}
          >
            {report.problems.length === 0 ? (
              <p className="text-emerald-200">
                처음 회차부터 다시 계산했습니다. 문제가 없습니다.
              </p>
            ) : (
              <ul className="list-disc pl-5 text-rose-200">
                {report.problems.map((p) => (
                  <li key={`${p.round}-${p.message}`}>
                    {p.round}회: {p.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-white/50 text-xs">
              연습 장부라 drand 서명과 투명성 로그 기록은 확인하지 않습니다.
            </p>
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
