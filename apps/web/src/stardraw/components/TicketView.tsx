"use client";

import {
  drandRoundForClose,
  drandTime,
  roundTimes,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { useEffect, useState } from "react";

import { MadeWith } from "@/components/brand/MadeWith";

import { useLedger } from "../services";
import { sealedFor } from "../spoiler";
import { Receipt } from "./Receipt";

/** 공유한 응모권 주소: /stardraw/ticket#<회차>-<일련번호 64자> */
export function ticketUrl(origin: string, ticket: Ticket): string {
  return `${origin}/stardraw/ticket#${ticket.round}-${toHex(ticketId(ticket))}`;
}

function parse(hash: string): { round: number; id: string } | null {
  const m = /^#?(\d+)-([0-9a-f]{64})$/.exec(hash);
  return m ? { round: Number(m[1]), id: m[2] as string } : null;
}

/**
 * 공유받은 응모권(읽기 전용). 추첨이 끝난 회차는 공개 장부에서 찾아 결과까지 보여 준다.
 * 추첨 전에는 이 기기에서 낸 응모권만 보이고, 다른 기기에서는 장부에 올라온 뒤에 보인다
 */
export function TicketView() {
  const { services, status } = useLedger();
  const [want, setWant] = useState<{ round: number; id: string } | null>(null);
  const [read, setRead] = useState(false);
  useEffect(() => {
    const sync = () => {
      setWant(parse(window.location.hash));
      setRead(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  let body: React.ReactNode;
  if (!services || !status || !read) {
    body = (
      <p className="py-20 text-center text-white/60">하늘을 펴고 있습니다</p>
    );
  } else {
    const same = (t: Ticket) => want && toHex(ticketId(t)) === want.id;
    const record = want ? services.ledger.record(want.round) : undefined;
    const fromLedger = want
      ? services.ledger.ticketsOf(want.round).find(same)
      : undefined;
    const myTickets = services.wallet.loadTickets();
    const mine = myTickets.find((m) => same(m.ticket));
    // 내가 응모한 회차인데 이 기기에서 아직 추첨을 보지 않았으면 결과를 가린다(spoiler.ts)
    const sealed =
      !!want &&
      sealedFor(
        myTickets,
        services.wallet.openedRounds(),
        services.ledger,
      )(want.round);
    const ticket = fromLedger ?? mine?.ticket;
    const drawAt = want
      ? drandTime(
          drandRoundForClose(
            roundTimes(services.ledger.schedule, want.round).closesAt,
          ),
        )
      : 0;
    const waiting = want && !record && want.round <= status.round;
    if (ticket && (record || mine)) {
      body = (
        <>
          {!record && (
            <p
              role="status"
              className="text-center font-semibold text-amber-100"
            >
              추첨까지 {Math.max(1, Math.ceil((drawAt - status.now) / 60))}분
            </p>
          )}
          <Receipt
            ticket={ticket}
            receivedAt={mine?.receivedAt}
            schedule={services.ledger.schedule}
            record={record}
            sealed={sealed}
            onDraw={() =>
              window.location.assign(`/stardraw/rounds#draw-${ticket.round}`)
            }
          />
        </>
      );
    } else if (waiting) {
      body = (
        <p role="status" className="py-10 text-center text-white/75">
          {status.now <
          roundTimes(services.ledger.schedule, want.round).closesAt
            ? "마감 뒤에 보여요"
            : "추첨 뒤에 보여요"}
        </p>
      );
    } else {
      body = (
        <p role="status" className="py-10 text-center text-white/75">
          이 응모권을 찾을 수 없어요
        </p>
      );
    }
  }

  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <a
          href="/stardraw"
          className="self-start text-sm text-white/70 hover:text-white"
        >
          ← 하늘의 별 따기
        </a>
        <section className="flex flex-col gap-4" aria-label="공유받은 응모권">
          {body}
        </section>
        <a
          href="/stardraw/enter"
          className="sd-cta rounded-2xl py-3 text-center font-bold text-slate-950"
        >
          나도 응모하기
        </a>
        <footer className="pt-4 text-center text-[11px] text-white/40">
          <MadeWith />
        </footer>
      </div>
    </main>
  );
}
