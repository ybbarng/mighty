"use client";

import {
  DRAND_DELAY,
  encodeClaim,
  generateSasKey,
  generateSigner,
  makeChallengeClaim,
  type Rank,
  sasChallenge,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { useEffect, useState } from "react";

import { MadeWith } from "@/components/brand/MadeWith";
import { cn } from "@/lib/cn";

import { demoPick } from "../demo-pick";
import type { LocalLedger } from "../local-ledger";
import { myRank } from "../results";
import { DEMO_NS, type Services, useLedger } from "../services";
import type { MyTicket } from "../wallet";
import { CheckPanel } from "./CheckPanel";
import { DemoUnlockSheet } from "./DemoUnlockSheet";
import { DrawView } from "./DrawView";
import { EnterView } from "./EnterView";
import { Inbox } from "./Inbox";
import { formatLeft, LottoBall, RANK_LABEL } from "./parts";
import { Receipt } from "./Receipt";

/**
 * 하늘의 별 따기 데모: 응모부터 당첨자 확인까지 한 사람이 혼자 끝까지 해 본다.
 * 장부·열쇠·확인 기록은 실제 게임과 따로 저장한다(이름공간 "stardraw-demo").
 * 데모만의 기능: 지금 마감·지금 추첨, 미리 본 당첨 번호로 n등이 되게 고르기, 가짜 당첨자로 답하기.
 * 데모는 실제 패스키를 만들지 않는다: 서명 순간마다 화면 안 흉내 시트(`DemoUnlockSheet`)가 뜬다.
 */
export function StardrawDemo() {
  const { services, status, version, refresh, reset } = useLedger(DEMO_NS);
  const [mine, setMine] = useState<MyTicket[]>([]);
  /**
   * 응모 화면에 채워 둘 번호. 「n등 되게」로 채웠으면 고른 등수(rank)와 그 회차(round)를 기억해,
   * 응모하기 전에 회차가 넘어가면(지금 마감·지금 추첨, 정각 지남) 새 회차 당첨 번호로 다시 채운다.
   * 예전 회차 번호가 남아 있으면 다음 회차에 그 번호로 응모해 낙첨이 됐다(2026-10-30 사용자 제보)
   */
  const [entering, setEntering] = useState<{
    key: number;
    picks: number[];
    rank?: Rank | null;
    round?: number;
  }>({
    key: 0,
    picks: [],
  });
  const [drawing, setDrawing] = useState<number | null>(null);
  const [pane, setPane] = useState<"winner" | "checker">("winner");
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    if (services) setMine(services.wallet.loadTickets());
  }, [services, version]);

  // 「n등 되게」로 채운 뒤 회차가 넘어가면, 고른 등수로 새 회차 번호를 다시 채운다
  const round = status?.round;
  useEffect(() => {
    if (!services?.practice || round === undefined) return;
    if (entering.rank === undefined || entering.round === round) return;
    const picks = demoPick(services.practice.peekDraw(round), entering.rank);
    setEntering({ key: Date.now(), picks, rank: entering.rank, round });
  }, [services, round, entering.rank, entering.round]);

  if (!services || !status)
    return (
      <main data-game="stardraw" className="sd-night min-h-dvh text-white">
        <p className="py-20 text-center text-white/60">하늘을 펴고 있습니다</p>
      </main>
    );

  const current = mine.find((m) => m.ticket.round === status.round);
  // 가장 최근에 추첨이 끝난 내 응모권
  const latest = [...mine]
    .filter((m) => services.ledger.record(m.ticket.round))
    .sort((a, b) => b.ticket.round - a.ticket.round)[0];
  const latestRecord = latest
    ? services.ledger.record(latest.ticket.round)
    : undefined;
  const latestRank =
    latest && latestRecord ? myRank(latestRecord, latest.ticket) : null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main data-game="stardraw" className="sd-night min-h-dvh pb-12 text-white">
      <div
        role="note"
        className="sticky top-0 z-20 border-amber-300/40 border-b bg-amber-300/95 px-4 py-2 text-center font-semibold text-slate-950 text-sm"
      >
        데모 · 실제 게임과 따로 저장돼요
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <a
              href="/stardraw"
              className="text-sm text-white/70 hover:text-white"
            >
              ← 하늘의 별 따기
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await reset();
                  setMine([]);
                  setDrawing(null);
                  setEntering({ key: Date.now(), picks: [] });
                })
              }
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              데모 처음부터
            </button>
          </div>
          <h1 className="font-black text-3xl">하늘의 별 따기 데모</h1>
          <p className="break-keep text-white/70">
            응모 → 추첨 → 당첨자 확인까지 혼자 끝까지 해 봅니다. 연습 참가자
            24명이 회차마다 함께 응모합니다.
          </p>
        </header>
        <DemoUnlockSheet />

        <Step n={1} title="회차 조작">
          <div className="sd-glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
            <span
              className="font-bold tabular-nums"
              data-demo-round={status.round}
            >
              제 {status.round}회
            </span>
            <span className="text-sm text-white/65">
              {status.phase === "open"
                ? `응모 받는 중 · 마감까지 ${formatLeft(status.times.entryDeadline - status.now)} · 추첨까지 ${formatLeft(status.times.closesAt + DRAND_DELAY - status.now)}`
                : status.phase === "closing"
                  ? "곧 마감"
                  : "앞 회차 추첨을 기다리는 중"}
            </span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => practiceOf(services).skipToClose())
                }
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                지금 마감
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => practiceOf(services).skipToNextDraw())
                }
                className="sd-cta rounded-lg px-3 py-1.5 font-bold text-slate-950 text-sm disabled:opacity-40"
              >
                지금 추첨
              </button>
            </span>
          </div>
        </Step>

        <Step n={2} title="응모">
          {current ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-white/70">
                이번 회차에 응모했습니다. 「지금 추첨」을 눌러 보세요.
              </p>
              <Receipt
                ticket={current.ticket}
                receivedAt={current.receivedAt}
                schedule={services.ledger.schedule}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-xl">
              <EnterView
                key={entering.key}
                services={services}
                status={status}
                initialPicked={entering.picks}
                onBack={() => setEntering({ key: Date.now(), picks: [] })}
                onDone={(ticket, receivedAt) => {
                  services.wallet.addTicket({ ticket, receivedAt });
                  setMine(services.wallet.loadTickets());
                  void refresh();
                }}
                extra={
                  <RankPicker
                    services={services}
                    round={status.round}
                    onPick={(picks, rank) =>
                      setEntering({
                        key: Date.now(),
                        picks,
                        rank,
                        round: status.round,
                      })
                    }
                  />
                }
              />
            </div>
          )}
        </Step>

        <Step n={3} title="추첨">
          {latest && latestRecord ? (
            drawing === latest.ticket.round ? (
              <div className="mx-auto w-full max-w-xl">
                <DrawView
                  record={latestRecord}
                  ticket={latest.ticket}
                  onClose={() => setDrawing(null)}
                  clock={services.clock}
                />
              </div>
            ) : (
              <div className="sd-glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
                <span className="tabular-nums">
                  제 {latest.ticket.round}회 내 응모권:{" "}
                  <b data-demo-result>
                    {latestRank ? `${RANK_LABEL[latestRank]} 당첨` : "낙첨"}
                  </b>
                </span>
                <button
                  type="button"
                  onClick={() => setDrawing(latest.ticket.round)}
                  className="sd-cta ml-auto rounded-lg px-3 py-1.5 font-bold text-slate-950 text-sm"
                >
                  추첨 보기
                </button>
              </div>
            )
          ) : (
            <p className="text-sm text-white/60">
              응모한 뒤 「지금 추첨」을 누르면 여기서 추첨을 봅니다.
            </p>
          )}
        </Step>

        <Step n={4} title="당첨자 확인">
          {latest && latestRecord && latestRank ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 lg:hidden" role="tablist">
                {(
                  [
                    ["winner", "당첨자 폰"],
                    ["checker", "확인하는 사람 화면"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={pane === id}
                    onClick={() => setPane(id)}
                    className={cn(
                      "flex-1 rounded-xl border py-2 text-sm",
                      pane === id
                        ? "border-amber-200/60 bg-amber-200/15"
                        : "border-white/15",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Pane
                  title="당첨자 폰"
                  hidden={pane !== "winner"}
                  data="winner"
                >
                  <p className="text-sm text-white/65">
                    확인 요청이 오면 여기에 뜹니다.
                  </p>
                  <Inbox
                    services={services}
                    tickets={mine.map((m) => m.ticket)}
                  />
                  <FakeWinner services={services} ticket={latest.ticket} />
                </Pane>
                <Pane
                  title="확인하는 사람 화면"
                  hidden={pane !== "checker"}
                  data="checker"
                >
                  <CheckPanel
                    services={services}
                    round={latest.ticket.round}
                    rank={latestRank}
                    tickets={winnersOf(
                      services,
                      latest.ticket.round,
                      latestRank,
                    )}
                    onClose={() => setPane("winner")}
                  />
                </Pane>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/60">
              당첨된 응모권이 있으면 여기서 당첨자 폰과 확인하는 사람 화면을
              나란히 놓고 확인해 봅니다. 응모할 때 「1등 되게」를 눌러 보세요.
            </p>
          )}
        </Step>

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

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="flex items-center gap-2 font-bold text-xl">
        <span className="grid size-7 place-items-center rounded-full bg-amber-200 text-slate-950 text-sm">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pane({
  title,
  hidden,
  data,
  children,
}: {
  title: string;
  hidden: boolean;
  data: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-pane={data}
      className={cn(
        "flex flex-col gap-3 rounded-3xl border border-white/15 bg-black/20 p-4",
        hidden && "hidden lg:flex",
      )}
    >
      <h3 className="font-semibold text-white/80">{title}</h3>
      {children}
    </div>
  );
}

/** 데모는 늘 기기 안 연습 장부다(시간 건너뛰기·당첨 번호 미리 보기) */
function practiceOf(services: Services): LocalLedger {
  if (!services.practice) throw new Error("데모는 연습 장부로만 돈다");
  return services.practice;
}

/** 데모: 미리 본 이번 회차 당첨 번호로 n등이 되게 번호를 채운다 */
function RankPicker({
  services,
  round,
  onPick,
}: {
  services: Services;
  round: number;
  onPick: (picks: number[], rank: Rank | null) => void;
}) {
  const draw = practiceOf(services).peekDraw(round);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3">
      <p className="text-amber-100 text-sm">
        데모 전용: 이번 회차 당첨 번호를 미리 보고 등수를 골라 채웁니다
      </p>
      <div className="flex flex-wrap gap-2">
        {([1, 2, 3, 4, 5] as const).map((rank) => (
          <button
            key={rank}
            type="button"
            onClick={() => onPick(demoPick(draw, rank), rank)}
            className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 text-sm hover:bg-amber-200/15"
          >
            {RANK_LABEL[rank]} 되게
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(demoPick(draw, null), null)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          낙첨되게
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-1 text-white/60 text-xs">
        미리 본 당첨 번호
        {draw.numbers.map((n) => (
          <LottoBall key={n} n={n} size="sm" />
        ))}
        + <LottoBall n={draw.bonus} size="sm" />
      </p>
    </div>
  );
}

/** 데모: 가짜 당첨자(그 응모권의 열쇠가 없는 사람)로 답해 본다 */
function FakeWinner({
  services,
  ticket,
}: {
  services: Services;
  ticket: Ticket;
}) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/5 p-3">
      <p className="text-rose-100/85 text-sm">
        실패도 해 볼 수 있습니다: 확인하는 사람 화면에서 별을 일부러 틀리게
        누르거나, 아래 단추로 가짜 당첨자가 대신 답하게 합니다.
      </p>
      <button
        type="button"
        onClick={async () => {
          const [open] = await services.relay.openFor([ticketId(ticket)]);
          if (!open) {
            setMessage("먼저 확인하는 사람 화면에서 요청을 보내 주세요");
            return;
          }
          // 응모권 열쇠가 없는 사람: 다른 열쇠로 서명한다
          const stranger = await generateSigner();
          const key = await generateSasKey();
          const claim = await makeChallengeClaim(
            stranger,
            ticket,
            sasChallenge(
              open.request.challenge,
              open.checkerKey,
              key.publicKey,
            ),
            open.request.requester,
          );
          await services.relay.answer(open.id, {
            claim: encodeClaim(claim),
            winnerKey: key.publicKey,
          });
          setMessage("가짜 당첨자가 답했습니다. 확인하는 사람 화면을 보세요");
        }}
        className="self-start rounded-lg border border-rose-300/40 px-3 py-1.5 text-rose-100 text-sm hover:bg-rose-400/10"
      >
        가짜 당첨자로 답하기
      </button>
      {message && <p className="text-sm text-white/70">{message}</p>}
    </div>
  );
}
