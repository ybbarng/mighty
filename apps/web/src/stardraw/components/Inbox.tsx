"use client";

import { equalBytes, type Ticket, ticketId } from "@mighty/stardraw-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import { AstronautCard } from "../astronaut/AstronautCard";
import { astronautOf } from "../astronaut/identity";
import { myTicketFor, prepareAnswer } from "../confirm";
import type { ConfirmOutcome, OpenRequest } from "../confirm-relay";
import { myRank } from "../results";
import { roundShort } from "../round-label";
import type { Services } from "../services";
import { starOf } from "../sky";
import type { KeyInfo } from "../wallet";
import { useRegistered } from "./AstronautPanel";
import { formatTime, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 내가 서명해 보낸 확인(별 세 개는 이 기기에만 남는다. 화면을 닫았다 열어도 보낼 수 있게) */
interface Answered {
  id: string;
  round: number;
  rank: number;
  /** 요청이 붙은 확인 링크를 만든 시각 */
  invitedAt: number;
  stars: number[];
  outcome?: ConfirmOutcome;
}

function loadAnswered(ns: string): Answered[] {
  try {
    return JSON.parse(
      localStorage.getItem(`${ns}-answered`) ?? "[]",
    ) as Answered[];
  } catch {
    return [];
  }
}

function saveAnswered(ns: string, list: Answered[]): void {
  try {
    localStorage.setItem(`${ns}-answered`, JSON.stringify(list.slice(-20)));
  } catch {
    // 저장소를 못 쓰면 이번 방문 동안만 남는다
  }
}

/**
 * 당첨자 쪽 확인: 내가 보낸 확인 링크로 온 요청을 스스로 찾아(열 때, 열려 있는 동안) 띄운다.
 * 「등록증으로 승인」이면 내 등록증 카드가 나타나 패스키 확인을 받고(등록증 본인 확인과 같은 움직임), 별 세 개가 ①②③ 차례로 빛난다.
 * 요청은 내가 만든 링크로만 온다(링크마다 한 번). 카노푸스 우주국(서버)은 전달만 한다(확인 요청에는 우주국 관인이 없다).
 */
export function Inbox({
  services,
  tickets,
}: {
  services: Services;
  tickets: readonly Ticket[];
}) {
  const [open, setOpen] = useState<OpenRequest[]>([]);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** 승인 중인 요청과 내 등록증 카드 모습(확인 중 → 확인됨 → 잠시 뒤 닫힘) */
  const [approving, setApproving] = useState<{
    id: string;
    key: KeyInfo;
    phase: "checking" | "ok";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = tickets.map(ticketId);
  const idKey = ids.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 응모권 수가 바뀔 때만 다시 만든다
  const refresh = useCallback(async () => {
    setOpen(await services.relay.openFor(ids));
    setAnswered(loadAnswered(services.ns));
  }, [services, idKey]);

  useEffect(() => {
    void refresh();
    const off = services.relay.onChange(() => void refresh());
    let stop: () => void = () => {};
    const poll = () => {
      stop = services.clock.after(5000, () => {
        void refresh();
        poll();
      });
    };
    poll();
    return () => {
      off();
      stop();
    };
  }, [services, refresh]);

  // 보낸 확인의 결과를 기다린다
  useEffect(() => {
    const stops = answered
      .filter((a) => !a.outcome)
      .map((a) =>
        services.relay.onOutcome(a.id, (outcome) => {
          const list = loadAnswered(services.ns).map((x) =>
            x.id === a.id ? { ...x, outcome } : x,
          );
          saveAnswered(services.ns, list);
          setAnswered(list);
          if ("ok" in outcome && outcome.ok) play("starWin");
        }),
      );
    return () => {
      for (const s of stops) s();
    };
  }, [answered, services]);

  const rankOfRequest = (req: OpenRequest) => {
    const ticket = myTicketFor(req.request, tickets);
    const record = services.ledger.record(req.request.round);
    return ticket && record ? myRank(record, ticket) : null;
  };

  const accept = async (req: OpenRequest) => {
    setBusy(req.id);
    setError(null);
    try {
      const ticket = myTicketFor(req.request, tickets);
      if (!ticket) throw new Error("이 기기에 그 응모권이 없습니다");
      const key = services.wallet.loadKey();
      if (!key || !equalBytes(key.pub, ticket.pub))
        throw new Error(
          "이 응모권을 낸 등록증이 이 기기에 없어 승인할 수 없습니다",
        );
      setApproving({ id: req.id, key, phase: "checking" });
      const { answer, stars } = await prepareAnswer(
        await services.wallet.signerFor(key),
        ticket,
        req,
      );
      await services.relay.answer(req.id, answer);
      const list = [
        ...loadAnswered(services.ns),
        {
          id: req.id,
          round: req.request.round,
          rank: rankOfRequest(req) ?? 0,
          invitedAt: req.invitedAt,
          stars,
        },
      ];
      saveAnswered(services.ns, list);
      setAnswered(list);
      setApproving({ id: req.id, key, phase: "ok" });
      services.clock.after(1600, () => setApproving(null));
      await refresh();
    } catch (err) {
      setApproving(null);
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "등록증 확인을 취소했습니다"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(null);
    }
  };

  const decline = async (req: OpenRequest) => {
    await services.relay.answer(req.id, { declined: true });
    await refresh();
  };

  const shown = answered.filter((a) => !a.outcome || a.outcome);
  if (open.length === 0 && shown.length === 0 && !approving) return null;

  return (
    <section className="flex flex-col gap-3" aria-label="당첨자 확인 요청">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-500/15 px-3 py-2 text-rose-200 text-sm"
        >
          {error}
        </p>
      )}
      {approving && (
        <ApprovingCard
          services={services}
          keyInfo={approving.key}
          phase={approving.phase}
        />
      )}
      {open.map((req) => {
        const rank = rankOfRequest(req);
        return (
          <div
            key={req.id}
            data-confirm-request={req.id}
            className="sd-breathe flex flex-col gap-3 rounded-2xl border border-amber-200/40 bg-amber-200/10 p-4"
          >
            <p className="font-bold">
              보낸 확인 링크로{" "}
              {roundShort(services.ledger.schedule, req.request.round)}{" "}
              {rank ? RANK_LABEL[rank] : ""} 당첨 확인 요청이 왔습니다
            </p>
            <p className="text-amber-100/60 text-xs">
              {formatTime(req.invitedAt / 1000)}에 만든 링크 · 전달: 카노푸스
              우주국
            </p>
            <p className="text-sm text-amber-100/80">
              링크를 보낸 적이 없으면 거절하세요.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void accept(req)}
                className="sd-cta rounded-xl py-2.5 font-bold text-slate-950 disabled:opacity-50"
              >
                {busy === req.id ? "확인하고 있습니다" : "등록증으로 승인"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decline(req)}
                className="rounded-xl border border-white/20 py-2.5 hover:bg-white/10"
              >
                거절
              </button>
            </div>
          </div>
        );
      })}
      {answered
        .slice()
        .reverse()
        .slice(0, 3)
        .map((a) => (
          <AnsweredCard key={a.id} answered={a} clock={services.clock} />
        ))}
    </section>
  );
}

function AnsweredCard({
  answered,
  clock,
}: {
  answered: Answered;
  clock: Services["clock"];
}) {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(answered.stars.length);
      return;
    }
    const stops = answered.stars.map((_, i) =>
      clock.after(500 + i * 900, () => {
        setRevealed(i + 1);
        play("starBall");
      }),
    );
    return () => {
      for (const s of stops) s();
    };
  }, [answered.stars, clock]);

  const o = answered.outcome;
  const done = o && "ok" in o && o.ok;
  return (
    <div
      data-answered={answered.id}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4",
        done
          ? "border-emerald-300/50 bg-emerald-400/10"
          : o
            ? "border-rose-300/40 bg-rose-500/10"
            : "border-white/15 bg-white/5",
      )}
    >
      {done ? (
        <p role="status" className="font-bold text-emerald-200">
          확인하는 분의 화면에 초록불이 켜졌습니다
        </p>
      ) : o && "declined" in o ? (
        <p className="text-white/70">거절한 요청입니다</p>
      ) : o && "reasons" in o ? (
        <div role="status">
          <p className="font-bold text-rose-200">본인 확인에 실패했습니다</p>
          <ul className="mt-1 list-disc pl-5 text-rose-100/80 text-sm">
            {o.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="break-keep font-semibold">
            링크를 보낸 사람에게, 당첨을 알렸던 그 메신저·메일로 이 세 별 이름을
            차례대로 보내 주세요
          </p>
          <p className="break-keep text-amber-100/85 text-sm" data-sas-warning>
            별 세 개는 내가 당첨을 알린 그 사람에게만 보내세요.
          </p>
          <SkyBoard
            state={{
              mode: "receipt",
              picked: [],
              focus: null,
              lit: [],
              bonus: null,
              marks: answered.stars.slice(0, revealed),
            }}
            label="보낼 별 세 개"
          />
          <ol
            className="grid grid-cols-3 gap-2"
            data-sas={answered.stars.join(",")}
          >
            {answered.stars.map((n, i) => (
              <li
                key={n}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl bg-white/5 py-2 transition",
                  i < revealed ? "sd-rise opacity-100" : "opacity-0",
                )}
              >
                <span className="text-amber-200 text-lg">{"①②③"[i]}</span>
                <span className="font-bold">{starOf(n).ko}</span>
              </li>
            ))}
          </ol>
          <p className="text-white/55 text-xs">
            확인하는 분이 세 별을 하늘에서 차례로 누르면 결과가 여기 나옵니다.
            전달: 카노푸스 우주국 · 우주국은 전달만 하고 별 세 개는 모릅니다.
          </p>
        </>
      )}
    </div>
  );
}

/** 승인할 때 나타나는 내 등록증(이 기기의 내 것만). 패스키 확인 동안 확인 중, 서명이 끝나면 확인됨 */
function ApprovingCard({
  services,
  keyInfo,
  phase,
}: {
  services: Services;
  keyInfo: KeyInfo;
  phase: "checking" | "ok";
}) {
  const a = useMemo(() => astronautOf(keyInfo.pub), [keyInfo.pub]);
  const registered = useRegistered(services, keyInfo.pub);
  return (
    <div className="sd-rise" data-approving={phase}>
      <AstronautCard
        astronaut={a}
        registered={registered}
        clock={services.clock}
        forced={phase}
      />
    </div>
  );
}
