"use client";

import {
  displayRound,
  drandRoundForClose,
  drandTime,
  qualDisplayId,
  type Rank,
  type RoundRecord,
  roundTimes,
  type Schedule,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { cn } from "@/lib/cn";
import { myRank } from "../results";
import { roundShort } from "../round-label";
import { starOf } from "../sky";
import { KeyIcon } from "./PasskeyHelp";
import { DrawFirst, formatTime, LottoBall, RANK_LABEL, shortId } from "./parts";
import { SkyBoard } from "./SkyBoard";

/**
 * 응모 영수증: 실제 복권 영수증처럼 톱니 가장자리와 점선 절취선. 종이는 밤하늘 화면에 맞춰 짙은 남회색이다.
 * 작은 네모 하늘에는 내 별 6개만 밝게 뜬다. 추첨이 끝났으면 결과를 아래에 찍는다.
 */
export function Receipt({
  ticket,
  receivedAt,
  schedule,
  record: shownRecord,
  sealed = false,
  onDraw,
  printing = false,
}: {
  ticket: Ticket;
  /** 장부가 받은 시각(초). 공유받은 남의 응모권은 모른다 */
  receivedAt?: number | undefined;
  schedule: Schedule;
  record?: RoundRecord | undefined;
  /** 추첨을 아직 열어 보지 않은 내 회차: 결과 대신 「추첨 보기」(spoiler.ts) */
  sealed?: boolean | undefined;
  onDraw?: (() => void) | undefined;
  /** 막 응모해 영수증이 인쇄되어 나오는 중 */
  printing?: boolean | undefined;
}) {
  const times = roundTimes(schedule, ticket.round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  const id = toHex(ticketId(ticket));
  const record = sealed ? undefined : shownRecord;
  const rank: Rank | null = record ? myRank(record, ticket) : null;
  return (
    <article
      aria-label={`${roundShort(schedule, ticket.round)} 응모권`}
      data-receipt={id}
      className={cn(
        "sd-paper relative mx-auto w-full max-w-sm px-5 pt-6 pb-7 text-slate-100",
        printing && "sd-print",
      )}
    >
      <header className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[11px] text-slate-400 tracking-[0.3em]">
          STARDRAW
        </span>
        <span className="font-black text-xl tracking-tight">
          하늘의 별 따기
        </span>
        <span className="text-slate-300 text-xs">응모권 · 영수증</span>
      </header>

      <Cut />

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[13px] tabular-nums">
        <dt className="text-slate-400">회차</dt>
        <dd className="text-right font-bold">
          {displayRound(schedule, ticket.round).phase
            ? roundShort(schedule, ticket.round)
            : `제 ${ticket.round} 회`}
        </dd>
        <dt className="text-slate-400">추첨</dt>
        <dd className="text-right">{formatTime(drawAt)}</dd>
        {receivedAt !== undefined && (
          <>
            <dt className="text-slate-400">응모</dt>
            <dd className="text-right">{formatTime(receivedAt)}</dd>
          </>
        )}
        <dt className="text-slate-400">일련번호</dt>
        <dd className="text-right" data-ticket-id>
          {shortId(id)}
        </dd>
        {ticket.qual && (
          <>
            <dt className="text-slate-400">상품</dt>
            <dd className="text-right text-amber-100" data-receipt-qual>
              상품 대상 ·{" "}
              {qualDisplayId(
                ticket.qual.cert.periodId,
                ticket.qual.cert.qualPub,
              )}
            </dd>
          </>
        )}
        {ticket.sig.kind === "webauthn" && (
          <>
            <dt className="text-slate-400">서명</dt>
            <dd
              className="flex items-center justify-end gap-1"
              data-passkey-mark
            >
              <KeyIcon className="size-3.5" />
              우주인 등록증
            </dd>
          </>
        )}
      </dl>

      <Cut />

      <SectionTitle>내 별</SectionTitle>
      <div className="rounded-lg bg-[#0b1322] p-1.5">
        <SkyBoard
          state={{
            mode: "receipt",
            picked: ticket.numbers,
            focus: null,
            lit: [],
            bonus: null,
          }}
          label={`내 별 6개: ${ticket.numbers.map((n) => starOf(n).ko).join(", ")}`}
          className="rounded-md border-0"
        />
      </div>
      <p
        className="mt-2.5 text-center text-[12px] text-amber-100/60 tracking-wide"
        data-wish
      >
        내 별에 소원을 빌어 보세요
      </p>

      <SectionTitle className="mt-5">별 설명</SectionTitle>
      <ol className="flex flex-col gap-2.5">
        {ticket.numbers.map((n) => {
          const s = starOf(n);
          const hit =
            record && !record.void
              ? record.numbers.includes(n) || record.bonus === n
              : false;
          return (
            <li key={n} className="flex items-start gap-3">
              <LottoBall n={n} size="sm" ring={hit} className="mt-0.5" />
              <div className="flex min-w-0 flex-col leading-snug">
                <span className="font-bold text-sm">
                  {s.ko}{" "}
                  <span className="font-normal text-slate-400 text-xs">
                    {s.con}
                  </span>
                </span>
                <span className="break-keep text-slate-300 text-xs">
                  {s.fact}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <Cut />

      {record && !record.void && (
        <div
          className="mb-3 flex flex-wrap items-center justify-center gap-1.5"
          data-result-numbers
          role="img"
          aria-label={`당첨 번호 ${record.numbers.join(", ")}, 보너스 ${record.bonus}`}
        >
          {record.numbers.map((n) => (
            <LottoBall
              key={n}
              n={n}
              size="sm"
              ring={ticket.numbers.includes(n)}
            />
          ))}
          <span className="px-0.5 text-slate-500">+</span>
          <LottoBall
            n={record.bonus}
            size="sm"
            ring={ticket.numbers.includes(record.bonus)}
          />
        </div>
      )}
      {sealed ? (
        <div className="flex justify-center">
          <DrawFirst round={ticket.round} onDraw={onDraw} />
        </div>
      ) : record ? (
        <p className="text-center font-bold" data-result>
          {record.void
            ? "이 회차는 무효가 되어 추첨하지 않았습니다"
            : rank
              ? `${RANK_LABEL[rank]} 당첨`
              : "아쉽게도 당첨되지 않았습니다"}
        </p>
      ) : (
        <p className="text-center text-slate-300 text-sm">
          추첨을 기다리고 있습니다
        </p>
      )}
      <p className="mt-4 text-center text-[10px] text-slate-500 tracking-wider">
        발행 · 카노푸스 우주국
      </p>
    </article>
  );
}

/** 영수증 칸 머리말: 위쪽 항목 이름(회차·추첨)처럼 작고 흐리게 */
function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("mb-2 text-[13px] text-slate-400", className)}>
      {children}
    </h3>
  );
}

/** 점선 절취선 */
function Cut() {
  return (
    <div
      aria-hidden="true"
      className="-mx-5 my-4 border-slate-600 border-t border-dashed"
    />
  );
}
