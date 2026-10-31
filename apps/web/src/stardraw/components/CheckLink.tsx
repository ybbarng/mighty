"use client";

import {
  equalBytes,
  type Rank,
  roundTimes,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";

import { useCallback, useEffect, useMemo, useState } from "react";
import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import type { CheckSession } from "../checks";
import { USED_LINK } from "../confirm-relay";
import { demoKeyring, passkeyKeyring } from "../director/director";
import { type QualMark, qualMarks, qualMarkText } from "../qual-judge";
import { myRank } from "../results";
import { roundShort } from "../round-label";
import { GAME_NS, type Services } from "../services";
import { starOf } from "../sky";
import type { Sealed } from "../spoiler";
import { DrawFirst, formatTime, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";

type Flash = { kind: "wrong"; left: number } | null;

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "used" }
  | { kind: "not-winner" }
  | {
      kind: "ready";
      round: number;
      rank: Rank;
      expiresAt: number;
      /** 미리보기에서 장부로 확인한 응모권(hex) */
      ticketId: string;
    }
  | { kind: "session"; session: CheckSession };

/**
 * 확인하는 사람: 당첨자가 보낸 확인 링크를 연 화면(docs/36 11-2).
 * 링크가 가리키는 응모권이 그 회차 당첨 응모권인지는 이 기기가 공개 장부로 확인한다.
 * 「확인 시작」하면 링크가 쓰여 닫히고, 당첨자의 승인을 기다린 뒤 별 세 개로 판정한다. 판정은 늘 이 기기에서 한다.
 */
export function CheckLink({
  services,
  token,
  onClose,
  preset,
  fresh,
  sealed,
  onDraw,
}: {
  services: Services;
  token: string;
  /** 추첨을 아직 열어 보지 않은 내 회차의 링크면 등수 대신 「추첨 보기」 */
  sealed?: Sealed | undefined;
  onDraw?: ((round: number) => void) | undefined;
  onClose?: (() => void) | undefined;
  /** 끝난 확인을 그대로 보여 준다(데모 화면 둘러보기의 성공·실패) */
  preset?: CheckSession | undefined;
  /** 이 기기의 확인 기록을 보지 않는다(데모: 다른 사람이 같은 링크를 연 모습) */
  fresh?: boolean;
}) {
  const [state, setState] = useState<State>(
    preset ? { kind: "session", session: preset } : { kind: "loading" },
  );
  const [entered, setEntered] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 기록 객체 하나를 고쳐 쓰고(응답 처리와 별 누르기가 같은 객체를 저장한다), 다시 그리기만 일으킨다
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const { checker, ledger } = services;

  const ticketOf = useCallback(
    (r: number, idHex: string) =>
      ledger.ticketsOf(r).find((t) => toHex(ticketId(t)) === idHex),
    [ledger],
  );

  const load = useCallback(async () => {
    const mine = fresh ? null : await checker.byLink(token);
    if (mine) {
      setState({ kind: "session", session: mine });
      return;
    }
    const peek = await services.relay.peek(token);
    if (peek.state !== "open") {
      setState({ kind: peek.state });
      return;
    }
    // 서버가 알려 준 응모권이 그 회차 당첨 응모권인지 공개 장부로 확인한다
    const record = ledger.record(peek.round);
    const ticket = ledger
      .ticketsOf(peek.round)
      .find((t) => equalBytes(ticketId(t), peek.ticketId));
    const rank = record && ticket ? myRank(record, ticket) : null;
    setState(
      rank
        ? {
            kind: "ready",
            round: peek.round,
            rank,
            expiresAt: peek.expiresAt,
            ticketId: toHex(peek.ticketId),
          }
        : { kind: "not-winner" },
    );
  }, [checker, ledger, services.relay, token, fresh]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: preset은 처음 한 번만 본다
  useEffect(() => {
    if (preset) return;
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  const session = state.kind === "session" ? state.session : null;
  const sessionKey =
    session && session.status === "waiting" ? session.key : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 기다리는 요청이 바뀔 때만 다시 붙인다
  useEffect(() => {
    if (!session || preset) return;
    return checker.watch(session, ticketOf, bump);
  }, [sessionKey, checker, ticketOf]);

  // 이 기기에 국장 패스키가 있으면 「우주국장으로 확인 시작」(받는 분을 국장 서명으로 묶는다, 2026-10-31 보안 검토 B3)
  const keyring = useMemo(
    () =>
      services.ns === GAME_NS ? passkeyKeyring() : demoKeyring(services.ns),
    [services.ns],
  );
  const [hasDirector, setHasDirector] = useState(false);
  useEffect(() => setHasDirector(keyring.saved().length > 0), [keyring]);
  const [recipient, setRecipient] = useState("");

  const start = async (
    ready: {
      round: number;
      rank: Rank;
      ticketId: string;
    },
    asDirector = false,
  ) => {
    setBusy(true);
    setError(null);
    try {
      setState({
        kind: "session",
        session: await checker.start(
          token,
          ready.rank,
          {
            round: ready.round,
            ticketId: ready.ticketId,
          },
          asDirector
            ? {
                to: recipient.trim(),
                sign: (m) => keyring.signBytes(m),
              }
            : undefined,
        ),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === USED_LINK) setState({ kind: "used" });
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (n: number) => {
    if (!session || entered.length >= 3 || entered.includes(n)) return;
    play("beep");
    const next = [...entered, n];
    setEntered(next);
    setFlash(null);
    if (next.length < 3) return;
    const result = await checker.enterStars(session, next);
    bump();
    if (result.kind === "confirmed") play("starWin");
    else {
      play("invalid");
      if (result.kind === "wrong") setFlash(result);
      services.clock.after(900, () => setEntered([]));
    }
  };

  const titleOf = (round: number, rank: Rank) =>
    `${roundShort(ledger.schedule, round)} ${RANK_LABEL[rank]}`;
  const hidden = state.kind === "ready" && !!sealed?.(state.round);
  const title =
    state.kind === "ready"
      ? hidden
        ? `${roundShort(ledger.schedule, state.round)} 당첨자`
        : titleOf(state.round, state.rank)
      : session
        ? titleOf(session.round, session.rank)
        : "당첨자";
  const green = session?.status === "confirmed";
  // 소속 표시: 도장·자격 서명·기간·중복을 규칙 패키지로 판정한다(2026-10-31 보안 검토 B1)
  const [mark, setMark] = useState<QualMark | null>(null);
  const markRound = session?.round;
  const markTicket = session?.ticketId;
  useEffect(() => {
    if (markRound === undefined || !markTicket) return;
    let alive = true;
    void ledger
      .qualInfo()
      .then((info) => {
        if (!alive) return;
        const marks = qualMarks(
          ledger.schedule,
          info,
          markRound,
          roundTimes(ledger.schedule, markRound).closesAt,
          ledger.ticketsOf(markRound),
        );
        setMark(marks.get(markTicket) ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ledger, markRound, markTicket]);

  return (
    <section
      className="flex flex-col gap-4"
      aria-label="당첨자 확인"
      data-check-link={state.kind}
    >
      <div className="flex items-center justify-between">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/70 hover:text-white"
          >
            ← 돌아가기
          </button>
        ) : (
          <a
            href="/stardraw"
            className="text-sm text-white/70 hover:text-white"
          >
            ← 하늘의 별 따기
          </a>
        )}
        <h2 className="font-bold text-lg">{title} 확인</h2>
        <span className="w-16" />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-500/15 px-3 py-2 text-rose-200 text-sm"
        >
          {error}
        </p>
      )}

      {state.kind === "missing" && (
        <Notice tone="warn">
          없는 링크이거나 기한(7일)이 지났습니다. 당첨자에게 새 링크를 받으세요.
        </Notice>
      )}
      {state.kind === "used" && (
        <Notice tone="warn" data="used">
          {USED_LINK.replace(". ", ".\n")}
        </Notice>
      )}
      {state.kind === "not-winner" && (
        <Notice tone="warn">
          장부에서 이 링크의 당첨 응모권을 찾지 못했습니다.
        </Notice>
      )}

      {state.kind === "ready" && hidden && (
        <div className="flex justify-center rounded-2xl border border-white/10 p-4">
          <DrawFirst
            round={state.round}
            onDraw={onDraw && (() => onDraw(state.round))}
          />
        </div>
      )}
      {state.kind === "ready" && !hidden && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/30 bg-amber-200/5 p-4">
          <p className="font-bold text-lg">
            {title} 당첨자가 보낸 확인 링크입니다
          </p>
          {hasDirector && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200/25 p-3">
              <label className="flex flex-col gap-1 text-sm">
                받는 분
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  maxLength={40}
                  data-check-recipient
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2"
                />
              </label>
              <button
                type="button"
                disabled={busy || !recipient.trim()}
                onClick={() => void start(state, true)}
                data-check-director
                className="sd-cta rounded-xl py-3 font-bold text-slate-950 disabled:opacity-40"
              >
                {busy ? "요청을 보내고 있습니다" : "우주국장으로 확인 시작"}
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(state)}
            className={cn(
              "rounded-xl py-3 font-bold disabled:opacity-40",
              hasDirector
                ? "border border-white/20 hover:bg-white/10"
                : "sd-cta text-slate-950",
            )}
          >
            {busy ? "요청을 보내고 있습니다" : "확인 시작"}
          </button>
          <p className="text-white/50 text-xs">
            한 번만 쓸 수 있습니다 · {formatTime(state.expiresAt / 1000)}까지
          </p>
        </div>
      )}

      {session && (
        <>
          {session.status === "waiting" &&
            services.clock.now() > session.answerBy && (
              <Notice tone="info">
                당첨자가 {formatTime(session.answerBy / 1000)}까지 응답하지
                않았습니다.
              </Notice>
            )}
          {session.status === "waiting" &&
            services.clock.now() <= session.answerBy && (
              <div
                role="status"
                className="sd-breathe rounded-2xl border border-sky-200/25 bg-sky-300/5 p-4 text-center"
              >
                <p className="font-semibold">
                  당첨자의 승인을 기다리고 있습니다
                </p>
                <p className="mt-1 text-sm text-white/60">
                  {formatTime(session.answerBy / 1000)}까지
                </p>
              </div>
            )}

          {(session.status === "signed" || green) && (
            <div className="flex flex-col gap-3">
              <p className="break-keep font-semibold">
                {green
                  ? "당첨자가 보낸 별 세 개가 맞습니다"
                  : "당첨자가 보낸 별 세 개를 하늘에서 차례로 눌러 주세요"}
              </p>
              <div className="relative">
                <SkyBoard
                  state={{
                    mode: "pick",
                    picked: [],
                    focus: null,
                    lit: [],
                    bonus: null,
                    marks: green && session.stars ? session.stars : entered,
                  }}
                  onPick={green ? undefined : (n) => void pick(n)}
                  label={`별 세 개 누르기: ${entered.map((n) => starOf(n).ko).join(", ") || "아직 없음"}`}
                />
                {green && <div aria-hidden="true" className="sd-green" />}
              </div>
              <ol className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => {
                  const n = green ? session.stars?.[i] : entered[i];
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

          {green && (
            <p
              role="status"
              data-verdict="ok"
              className="sd-rise rounded-2xl border border-emerald-300/50 bg-emerald-400/15 p-4 text-center font-bold text-emerald-100 text-lg"
            >
              {mark?.kind === "yes"
                ? `${title} 당첨자 본인이 맞습니다`
                : `${title} 응모권의 주인이 맞습니다`}
            </p>
          )}
          {green && mark && (
            <p
              data-qual-mark={mark.kind}
              className={cn(
                "text-center text-sm",
                mark.kind === "yes" ? "text-emerald-100/80" : "text-amber-200",
              )}
            >
              {qualMarkText(mark)}
            </p>
          )}
          {flash && session.status === "signed" && (
            <div
              role="status"
              data-verdict="wrong"
              className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-center"
            >
              <p className="font-bold text-rose-200">
                별 세 개가 맞지 않습니다
              </p>
              <p className="mt-1 text-rose-100/80 text-sm">
                {flash.left}번 더 할 수 있습니다
              </p>
            </div>
          )}
          {session.status === "failed" && (
            <div
              role="status"
              data-verdict="fail"
              className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-center"
            >
              <p className="font-bold text-rose-200">
                본인 확인에 실패했습니다
              </p>
              {session.reasons?.map((r) => (
                <p key={r} className="mt-1 text-rose-100/80 text-sm">
                  {r}
                </p>
              ))}
              <p className="mt-2 text-white/60 text-xs">
                다시 확인하려면 당첨자에게 새 링크를 받으세요.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Notice({
  tone,
  data,
  children,
}: {
  tone: "warn" | "info";
  data?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      data-link-notice={data}
      className={cn(
        "whitespace-pre-line break-keep rounded-2xl border p-4 text-center",
        tone === "warn"
          ? "border-amber-200/40 bg-amber-200/10 text-amber-50"
          : "border-white/15 bg-white/5 text-white/75",
      )}
    >
      {children}
    </p>
  );
}
