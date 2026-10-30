"use client";

import { type Rank, type Ticket, ticketId, toHex } from "@mighty/stardraw-core";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  checkLinkUrl,
  createInvite,
  invitesOf,
  type MyInvite,
} from "../invites";
import { myRank } from "../results";
import { roundShort } from "../round-label";
import type { Services } from "../services";
import { formatTime, RANK_LABEL } from "./parts";

/** 당첨 안내를 띄울 최근 당첨 응모권 수 */
const MAX_NOTICES = 3;

/** 이 기기의 당첨 응모권(최근 회차부터). 공개 장부로 이 기기가 계산한다 */
export function winningTickets(
  services: Services,
  tickets: readonly Ticket[],
): { ticket: Ticket; rank: Rank }[] {
  return tickets
    .map((ticket) => {
      const record = services.ledger.record(ticket.round);
      return { ticket, rank: record ? myRank(record, ticket) : null };
    })
    .filter((w): w is { ticket: Ticket; rank: Rank } => w.rank !== null)
    .sort((a, b) => b.ticket.round - a.ticket.round)
    .slice(0, MAX_NOTICES);
}

/**
 * 카노푸스 우주국 당첨 안내(docs/36 11-2, 11-9). 서버가 보낸 말이 아니라 이 기기가 공개 장부로 계산한 것이라 위조할 수 없다.
 * 당첨자는 여기서 「확인 링크 만들기」로 등록증 서명을 한 번 하고, 당첨을 알리고 싶은 사람에게 링크를 보낸다.
 * `compact`면 안내만 보이고 내 응모로 잇는다(첫 화면).
 */
export function WinNotice({
  services,
  tickets,
  compact,
  onOpen,
  onCreated,
}: {
  services: Services;
  tickets: readonly Ticket[];
  compact?: boolean;
  onOpen?: () => void;
  /** 링크를 만들었을 때(데모가 확인하는 사람 화면에 넘긴다) */
  onCreated?: (invite: MyInvite) => void;
}) {
  const wins = winningTickets(services, tickets);
  if (wins.length === 0) return null;
  return (
    <section aria-label="당첨 안내" className="flex flex-col gap-3">
      {wins.map(({ ticket, rank }) => (
        <NoticeCard
          key={toHex(ticketId(ticket))}
          services={services}
          ticket={ticket}
          rank={rank}
          compact={compact ?? false}
          onOpen={onOpen}
          onCreated={onCreated}
        />
      ))}
    </section>
  );
}

function NoticeCard({
  services,
  ticket,
  rank,
  compact,
  onOpen,
  onCreated,
}: {
  services: Services;
  ticket: Ticket;
  rank: Rank;
  compact: boolean;
  onOpen?: (() => void) | undefined;
  onCreated?: ((invite: MyInvite) => void) | undefined;
}) {
  const [links, setLinks] = useState<MyInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setLinks(invitesOf(services.ns, ticket, services.clock.now()));
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, [services, ticket]);

  const title = `${roundShort(services.ledger.schedule, ticket.round)} ${RANK_LABEL[rank]}`;
  const latest = links[0];
  const url = latest ? checkLinkUrl(latest.token, window.location.origin) : "";

  const make = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      onCreated?.(await createInvite(services, ticket));
      setLinks(invitesOf(services.ns, ticket, services.clock.now()));
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "등록증 확인을 취소했습니다"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("복사하지 못했습니다. 주소를 길게 눌러 복사해 주세요");
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: "하늘의 별 따기 당첨자 확인",
        text: `${title} 당첨자 확인 링크입니다. 한 번만 쓸 수 있습니다.`,
        url,
      });
    } catch {
      // 공유 창을 닫았다
    }
  };

  return (
    <div
      data-win-notice={ticket.round}
      className="flex flex-col gap-3 rounded-2xl border border-amber-200/40 bg-amber-200/10 p-4"
    >
      <p className="font-semibold text-amber-200 text-xs tracking-wide">
        카노푸스 우주국 당첨 안내
      </p>
      <p className="break-keep font-bold text-lg">{title}입니다</p>
      {compact ? (
        <button
          type="button"
          onClick={onOpen}
          className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 text-sm hover:bg-amber-200/15"
        >
          확인 링크 만들기
        </button>
      ) : (
        <>
          {latest && (
            <div className="flex flex-col gap-2" data-check-url={url}>
              <input
                readOnly
                value={url}
                aria-label="확인 링크"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-xs"
              />
              <div className={cn("grid gap-2", canShare && "grid-cols-2")}>
                {canShare && (
                  <button
                    type="button"
                    onClick={() => void share()}
                    className="sd-cta rounded-xl py-2.5 font-bold text-slate-950"
                  >
                    공유
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-xl border border-white/25 py-2.5 hover:bg-white/10"
                >
                  {copied ? "복사했습니다" : "복사"}
                </button>
              </div>
              <p className="break-keep text-white/60 text-xs">
                한 번만 쓸 수 있습니다 · {formatTime(latest.expiresAt / 1000)}
                까지
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void make()}
            className={cn(
              "rounded-xl py-2.5 font-bold disabled:opacity-50",
              latest
                ? "self-start border border-white/20 px-3 text-sm font-normal hover:bg-white/10"
                : "sd-cta text-slate-950",
            )}
          >
            {busy
              ? "만들고 있습니다"
              : latest
                ? "다른 사람에게 보낼 새 링크"
                : "확인 링크 만들기"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-rose-200 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
