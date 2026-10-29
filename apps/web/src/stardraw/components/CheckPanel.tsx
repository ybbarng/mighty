"use client";

import { type Rank, type Ticket, ticketId, toHex } from "@mighty/stardraw-core";
import { useCallback, useEffect, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { type CheckBatch, type CheckTicket, isActive } from "../checks";
import type { Services } from "../services";
import { starOf } from "../sky";
import { formatTime, RANK_LABEL, shortId } from "./parts";
import { SkyBoard } from "./SkyBoard";

function savedName(ns: string): string {
  try {
    return localStorage.getItem(`${ns}-checker-name`) ?? "";
  } catch {
    return "";
  }
}

type Flash =
  | { kind: "confirmed"; ticketId: string; of: number }
  | { kind: "wrong"; left: number }
  | { kind: "already" }
  | { kind: "closed" };

/**
 * 확인하는 분: 한 회차·등수의 당첨 응모권 모두에 확인 요청을 보내고, 응답과 별 세 개로 판정한다.
 * 판정은 늘 이 기기에서 한다(서명 검사, 별 계산).
 */
export function CheckPanel({
  services,
  round,
  rank,
  tickets,
  onClose,
}: {
  services: Services;
  round: number;
  rank: Rank;
  tickets: readonly Ticket[];
  onClose: () => void;
}) {
  const [batch, setBatch] = useState<CheckBatch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [entered, setEntered] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 묶음 객체 하나를 고쳐 쓰고(응답 처리와 별 누르기가 같은 객체를 저장한다), 다시 그리기만 일으킨다
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const { checker } = services;

  const ticketOf = useCallback(
    (r: number, idHex: string) =>
      services.ledger.ticketsOf(r).find((t) => toHex(ticketId(t)) === idHex),
    [services],
  );

  useEffect(() => {
    setName(savedName(services.ns));
    void checker.openBatch(round, rank).then((b) => {
      setBatch(b);
      setLoaded(true);
    });
  }, [checker, round, rank, services.ns]);

  // 묶음이 정해지면 한 번 응답을 기다린다(응답이 오면 같은 묶음 객체를 고쳐 저장한다)
  const batchKey = batch && !batch.closed ? batch.key : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 묶음이 바뀔 때만 다시 붙인다
  useEffect(() => {
    if (!batch || batch.closed) return;
    return checker.watch(batch, ticketOf, bump);
  }, [batchKey, checker, ticketOf]);

  const send = async () => {
    const who = name.trim();
    if (!who) return;
    try {
      localStorage.setItem(`${services.ns}-checker-name`, who);
    } catch {
      // 이름을 기억하지 못해도 확인은 된다
    }
    setError(null);
    try {
      setBatch(await checker.start(round, rank, tickets, who));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pick = async (n: number) => {
    if (!batch || entered.length >= 3 || entered.includes(n)) return;
    play("beep");
    const next = [...entered, n];
    setEntered(next);
    setFlash(null);
    if (next.length < 3) return;
    const result = await checker.enterStars(batch, next);
    bump();
    if (result.kind === "confirmed") {
      setFlash(result);
      play("starWin");
    } else {
      setFlash(result.kind === "wrong" ? result : { kind: result.kind });
      play("invalid");
      services.clock.after(900, () => setEntered([]));
    }
  };

  const title = `${round}회 ${RANK_LABEL[rank]}`;
  const signed = batch?.tickets.filter((t) => t.status === "signed") ?? [];
  const waiting = batch?.tickets.filter((t) => t.status === "waiting") ?? [];
  const green = flash?.kind === "confirmed";

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={`${title} 당첨자 확인`}
      data-check={`${round}-${rank}`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 돌아가기
        </button>
        <h2 className="font-bold text-lg">{title} 당첨자 확인</h2>
        <span className="w-16" />
      </div>

      {!loaded ? null : !batch ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="break-keep text-sm text-white/75">
            {title} 응모권 {tickets.length}장의 당첨자에게 확인 요청을 보냅니다.
            당첨자 기기에 요청과 함께 이 이름이 보입니다.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            확인하는 사람 이름
            <input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: Brice"
              className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-base"
            />
          </label>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => void send()}
            className="sd-cta rounded-xl py-3 font-bold text-slate-950 disabled:opacity-40"
          >
            당첨자 확인 요청 보내기
          </button>
          {error && <p className="text-rose-200 text-sm">{error}</p>}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="응모권별 상태">
            {batch.tickets.map((t) => (
              <TicketState key={t.requestId || t.ticketId} t={t} />
            ))}
          </ul>

          {waiting.length > 0 && (
            <div
              role="status"
              className="sd-breathe rounded-2xl border border-sky-200/25 bg-sky-300/5 p-4 text-center"
            >
              <p className="font-semibold">당첨자의 응답을 기다리고 있습니다</p>
              <p className="mt-1 text-sm text-white/60">
                당첨자는 {formatTime(batch.answerBy / 1000)}까지 답할 수
                있습니다. 요청을 만든 이 기기에서 확인을 마쳐 주세요.
              </p>
            </div>
          )}

          {(signed.length > 0 || green) && !batch.closed && (
            <div className="flex flex-col gap-3">
              <p className="break-keep font-semibold">
                상대가 보낸 별 세 개를 하늘에서 차례로 눌러 주세요
              </p>
              <div className="relative">
                <SkyBoard
                  state={{
                    mode: "pick",
                    picked: [],
                    focus: null,
                    lit: [],
                    bonus: null,
                    marks: entered,
                  }}
                  onPick={green ? undefined : (n) => void pick(n)}
                  label={`별 세 개 누르기: ${entered.map((n) => starOf(n).ko).join(", ") || "아직 없음"}`}
                />
                {green && <div aria-hidden="true" className="sd-green" />}
              </div>
              <ol className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => {
                  const n = entered[i];
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center rounded-xl border py-1.5",
                        n
                          ? "border-amber-200/50 bg-amber-200/10"
                          : "border-white/15 border-dashed",
                      )}
                    >
                      <span className="text-amber-200">{"①②③"[i]}</span>
                      <span className="font-semibold text-sm">
                        {n ? starOf(n).ko : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {flash && <Verdict flash={flash} title={title} />}

          {green && flash?.kind === "confirmed" && (
            <MemoForm
              batch={batch}
              ticketIdHex={flash.ticketId}
              services={services}
            />
          )}

          {!isActive(batch) && !green && (
            <button
              type="button"
              onClick={() => {
                setBatch(null);
                setFlash(null);
                setEntered([]);
              }}
              className="rounded-xl border border-white/20 py-2.5 hover:bg-white/10"
            >
              새로 요청하기
            </button>
          )}
        </>
      )}
    </section>
  );
}

function TicketState({ t }: { t: CheckTicket }) {
  const text: Record<CheckTicket["status"], string> = {
    waiting: "응답을 기다리는 중",
    signed: "서명 확인됨 · 별 세 개를 기다리는 중",
    confirmed: "당첨자 본인이 맞습니다",
    declined: "당첨자가 거절했습니다",
    failed: "본인 확인에 실패했습니다",
  };
  return (
    <li
      data-check-ticket={t.ticketId}
      data-status={t.status}
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm",
        t.status === "confirmed" && "border-emerald-300/40 bg-emerald-400/10",
        t.status === "failed" && "border-rose-300/40 bg-rose-500/10",
        (t.status === "waiting" || t.status === "signed") &&
          "border-white/15 bg-white/5",
        t.status === "declined" && "border-white/10 bg-white/5 text-white/60",
      )}
    >
      <span className="flex justify-between gap-3">
        <span className="font-mono tabular-nums text-white/70">
          응모권 {shortId(t.ticketId)}
        </span>
        <span>{text[t.status]}</span>
      </span>
      {t.reasons?.map((r) => (
        <span key={r} className="text-rose-100/80 text-xs">
          {r}
        </span>
      ))}
      {t.memo || t.prize ? (
        <span className="text-emerald-100/80 text-xs">
          {[t.memo, t.prize ? "상품 드림" : ""].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </li>
  );
}

function Verdict({ flash, title }: { flash: Flash; title: string }) {
  if (flash.kind === "confirmed")
    return (
      <p
        role="status"
        data-verdict="ok"
        className="sd-rise rounded-2xl border border-emerald-300/50 bg-emerald-400/15 p-4 text-center font-bold text-emerald-100 text-lg"
      >
        {flash.of > 1
          ? `${title} ${flash.of}장 중 한 장의 당첨자 본인이 맞습니다`
          : `${title} 당첨자 본인이 맞습니다`}
      </p>
    );
  if (flash.kind === "already")
    return (
      <p
        role="status"
        className="rounded-xl bg-white/5 p-3 text-center text-sm"
      >
        이미 확인한 응모권입니다
      </p>
    );
  return (
    <div
      role="status"
      data-verdict="fail"
      className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-center"
    >
      <p className="font-bold text-rose-200">본인 확인에 실패했습니다</p>
      <p className="mt-1 text-rose-100/80 text-sm">
        {flash.kind === "wrong"
          ? `별 세 개가 맞지 않습니다. ${flash.left}번 더 할 수 있습니다`
          : "별 세 개가 세 번 맞지 않아 요청을 닫았습니다"}
      </p>
    </div>
  );
}

function MemoForm({
  batch,
  ticketIdHex,
  services,
}: {
  batch: CheckBatch;
  ticketIdHex: string;
  services: Services;
}) {
  const [memo, setMemo] = useState("");
  const [prize, setPrize] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void services.checker
          .remember(batch, ticketIdHex, memo, prize)
          .then(() => setSaved(true));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        누구로 기억할까요?
        <input
          value={memo}
          maxLength={60}
          onChange={(e) => {
            setMemo(e.target.value);
            setSaved(false);
          }}
          placeholder="예: 철수 · 카톡"
          className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-base"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prize}
          onChange={(e) => {
            setPrize(e.target.checked);
            setSaved(false);
          }}
          className="size-4 accent-amber-300"
        />
        상품 드림
      </label>
      <button
        type="submit"
        className="rounded-xl border border-white/20 py-2 text-sm hover:bg-white/10"
      >
        {saved ? "이 기기에 적어 두었습니다" : "적어 두기"}
      </button>
      <p className="text-white/50 text-xs">
        메모는 이 기기에만 남고, 서버나 장부에는 올리지 않습니다.
      </p>
    </form>
  );
}
