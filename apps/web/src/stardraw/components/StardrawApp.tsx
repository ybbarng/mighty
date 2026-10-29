"use client";

import {
  DRAND_DELAY,
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
import { useEffect, useMemo, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
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
import { KeyChip, KeyHolding, PasskeyFaq } from "./PasskeyHelp";
import {
  formatLeft,
  formatTime,
  LottoBall,
  RANK_LABEL,
  scheduleLine,
  shortId,
} from "./parts";
import { Receipt } from "./Receipt";

type View =
  | { name: "home" }
  | { name: "enter" }
  | { name: "receipt"; mine: MyTicket; printing?: boolean | undefined }
  | { name: "draw"; round: number }
  | { name: "mine" }
  | { name: "rounds" }
  | { name: "round"; round: number }
  | { name: "check"; round: number; rank: Rank };

export const TAGLINE = "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?";

/** 하늘의 별 따기(docs/36 11절). 지금은 이 기기 안 연습 장부로 돈다 */
export function StardrawApp() {
  const { services, status, version, refresh } = useLedger();
  const [view, setView] = useState<View>({ name: "home" });
  const [mine, setMine] = useState<MyTicket[]>([]);
  const [opened, setOpened] = useState<Set<number>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    if (!services) return;
    setMine(services.wallet.loadTickets());
    setOpened(services.wallet.openedRounds());
  }, [version, services]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

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
            onBack={() => go({ name: "home" })}
            onDone={(ticket, receivedAt) => {
              const m = { ticket, receivedAt };
              services.wallet.addTicket(m);
              setMine(services.wallet.loadTickets());
              track("game-start", { game: "stardraw", mode: "solo" });
              void refresh();
              go({ name: "receipt", mine: m, printing: true });
            }}
          />
        ) : view.name === "receipt" ? (
          <ReceiptView
            services={services}
            mine={view.mine}
            printing={view.printing}
            onBack={() => go({ name: "home" })}
            onDraw={(round) => go({ name: "draw", round })}
          />
        ) : view.name === "draw" ? (
          <DrawFor
            services={services}
            round={view.round}
            mine={mine}
            onClose={() => {
              services.wallet.markOpened(view.round);
              setOpened(services.wallet.openedRounds());
              go({ name: "home" });
            }}
          />
        ) : view.name === "mine" ? (
          <MineView
            services={services}
            mine={mine}
            onBack={() => go({ name: "home" })}
            onOpen={(m) => go({ name: "receipt", mine: m })}
            onRecovered={() => setMine(services.wallet.loadTickets())}
          />
        ) : view.name === "rounds" ? (
          <RoundsView
            services={services}
            version={version}
            onBack={() => go({ name: "home" })}
            onOpen={(round) => go({ name: "round", round })}
          />
        ) : view.name === "round" ? (
          <RoundDetail
            services={services}
            round={view.round}
            mine={mine}
            onBack={() => go({ name: "rounds" })}
            onCheck={(rank) => go({ name: "check", round: view.round, rank })}
            onDraw={() => go({ name: "draw", round: view.round })}
          />
        ) : view.name === "check" ? (
          <CheckPanel
            services={services}
            round={view.round}
            rank={view.rank}
            tickets={winnersOf(services, view.round, view.rank)}
            onClose={() => go({ name: "round", round: view.round })}
          />
        ) : (
          <Home
            services={services}
            status={status}
            mine={mine}
            opened={opened}
            onEnter={() => go({ name: "enter" })}
            onReceipt={(m) => go({ name: "receipt", mine: m })}
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

/** 로또 1등과 맨눈 별 하나 맞히기 확률 비교 */
function Odds() {
  return (
    <section
      aria-label="확률 비교"
      className="sd-glass grid grid-cols-2 gap-px overflow-hidden rounded-2xl"
    >
      <div className="flex flex-col gap-1 p-4">
        <span className="text-white/60 text-xs">맨눈 별 하나 맞히기</span>
        <span className="font-mono font-bold text-2xl tabular-nums">
          1/9,000
        </span>
        <span className="text-white/55 text-xs">온 하늘 맨눈 별 약 9천 개</span>
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
  const [faq, setFaq] = useState(false);
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

      <section aria-label="내 열쇠" className="flex flex-col gap-2 pt-2">
        <h3 className="font-semibold text-white/85">내 열쇠</h3>
        {key ? (
          <>
            <KeyChip />
            <KeyHolding keyInfo={key} />
          </>
        ) : (
          <RecoverKey
            services={services}
            onFound={(found) => {
              setKey(found);
              onRecovered();
            }}
          />
        )}
        <button
          type="button"
          aria-expanded={faq}
          onClick={() => setFaq((v) => !v)}
          className="self-start text-sky-200 text-sm underline underline-offset-2"
        >
          패스키가 뭐예요?
        </button>
        {faq && <PasskeyFaq />}
      </section>
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
          장부에서 이 패스키를 찾지 못했어요. 응모한 적이 있는 패스키인지 확인해
          주세요.
          {services.practice &&
            " 지금은 연습 장부라 기기마다 장부가 따로여서, 다른 기기에서 낸 응모는 찾을 수 없어요."}
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
      <MemoTools services={services} />
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
  const [memos, setMemos] = useState<Map<string, CheckTicket>>(new Map());
  useEffect(() => {
    void services.checker.confirmed().then(setMemos);
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
              const memo = memos.get(hex);
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
                  {memo && (
                    <span className="w-full text-emerald-200/90 text-xs">
                      확인함
                      {memo.memo ? ` · ${memo.memo}` : ""}
                      {memo.confirmedAt
                        ? ` · ${formatTime(memo.confirmedAt / 1000)}`
                        : ""}
                      {memo.prize ? " · 상품 드림" : ""}
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

/** 확인 메모 옮기기(기기를 바꿀 때) */
function MemoTools({ services }: { services: Services }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <details className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70">
      <summary className="cursor-pointer">확인 메모 옮기기</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs">
          당첨자 확인 기록과 메모는 이 기기에만 있습니다. 다른 기기로 옮길 때
          파일로 내보냈다가 들여옵니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const text = await services.checker.exportMemos();
              const url = URL.createObjectURL(
                new Blob([text], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "stardraw-check-memos.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10"
          >
            내보내기
          </button>
          <label className="cursor-pointer rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10">
            들여오기
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const n = await services.checker.importMemos(
                    await file.text(),
                  );
                  setMessage(`${n}건을 들여왔습니다`);
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </label>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
