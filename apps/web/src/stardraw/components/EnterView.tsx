"use client";

import {
  type KeyRegistration,
  makeRegistration,
  makeTicket,
  type Ticket,
} from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useState } from "react";
import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import type { LedgerStatus } from "../local-ledger";
import {
  inAppBrowser,
  type PasskeyProblem,
  passkeyApi,
  passkeyProblem,
  platformUnlock,
} from "../passkey-env";
import { roundShort } from "../round-label";
import { DEMO_NS, type Services } from "../services";
import { SKY_STARS, starOf } from "../sky";
import type { KeyInfo } from "../wallet";
import { KeyIcon } from "./PasskeyHelp";
import { LottoBall, StarInfo } from "./parts";
import { SkyBoard } from "./SkyBoard";

type Step = "pick" | "working" | "folding";

/** 패스키를 쓸 수 있는 환경(첫 그리기 뒤에 잰다) */
export interface Env {
  inApp: string | null;
  api: boolean;
  /** 이 기기 잠금(얼굴·지문·PIN)으로 패스키를 쓸 수 있는지 */
  platform: boolean;
  ua: string;
}

type Failure = { kind: PasskeyProblem; text: string };

/** 응모: 네모 하늘이나 아래 번호 칸에서 별 6개를 고르고 낸다 */
export function EnterView({
  services,
  status,
  onDone,
  onBack,
  initialPicked = [],
  extra,
}: {
  services: Services;
  status: LedgerStatus;
  onDone: (ticket: Ticket, receivedAt: number) => void;
  onBack: () => void;
  /** 데모: 미리 골라 둘 번호 */
  initialPicked?: readonly number[];
  /** 데모: 번호 칸 위에 더 둘 도구 */
  extra?: ReactNode;
}) {
  const [picked, setPicked] = useState<number[]>([...initialPicked]);
  const [focus, setFocus] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [work, setWork] = useState("");
  const [error, setError] = useState<Failure | null>(null);
  const [env, setEnv] = useState<Env | null>(null);
  /** 이 기기·브라우저의 패스키. 없으면 별을 고르기 전에 먼저 만든다(등록과 서명을 나눈다, 2026-10-30 사용자) */
  const [key, setKey] = useState<KeyInfo | null>(() =>
    services.wallet.loadKey(),
  );
  const [keyWork, setKeyWork] = useState<null | "create" | "recover">(null);
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const full = picked.length === 6;
  const open = status.phase === "open";
  // 데모는 실제 패스키 대신 화면 안 흉내 시트를 쓴다: 패스키를 못 쓰는 환경 안내로 막지 않는다
  const demo = services.ns === DEMO_NS;

  useEffect(() => {
    const ua = navigator.userAgent;
    let alive = true;
    void platformUnlock().then((platform) => {
      if (alive)
        setEnv({ inApp: inAppBrowser(ua), api: passkeyApi(), platform, ua });
    });
    return () => {
      alive = false;
    };
  }, []);

  const fail = (err: unknown, what = "응모되지 않았어요") => {
    setStep("pick");
    const kind = passkeyProblem(err);
    setError({
      kind,
      text:
        kind === "cancelled"
          ? `${what}. 패스키 확인을 취소했어요. 다시 누르면 이어서 할 수 있어요.`
          : kind === "unsupported"
            ? "이 기기에서는 패스키를 만들 수 없어요. 다시 누른 뒤 '다른 기기 사용'(휴대폰)을 고르고, 화면의 QR을 휴대폰 카메라로 찍어 주세요."
            : err instanceof Error
              ? err.message
              : String(err),
    });
  };

  const toggle = (n: number) => {
    setFocus(n);
    setError(null);
    setPicked((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 6) return prev;
      play("beep");
      return [...prev, n];
    });
  };

  const fill = (keep: number[]) => {
    const out = [...keep];
    const bag = crypto.getRandomValues(new Uint8Array(64));
    let i = 0;
    while (out.length < 6) {
      const b = bag[i++ % bag.length] as number;
      if (i >= bag.length) crypto.getRandomValues(bag);
      if (b >= 225) continue;
      const n = (b % 45) + 1;
      if (!out.includes(n)) out.push(n);
    }
    setPicked(out);
    setFocus(out.at(-1) ?? null);
    play("beep");
  };

  const submit = async (key: KeyInfo) => {
    setStep("working");
    setError(null);
    try {
      const { ledger } = services;
      const entry = ledger.status().times.entry;
      const challenge = ledger.head();
      const signer = await services.wallet.signerFor(key);
      let registration: KeyRegistration | null | undefined;
      if (!(await ledger.isRegistered(key.pub))) {
        setWork("처음 한 번, 열쇠를 장부에 올릴 계산을 하고 있습니다");
        registration = await makeRegistration(
          { publicKey: key.pub },
          // 데모 열쇠는 패스키가 아니라 원시 열쇠로 등록한다(연습 장부만 받는다)
          key.kind === "passkey" ? "passkey" : "raw",
          key.credentialId,
          challenge,
          entry.registerPowTarget,
          { params: ledger.powParams },
        );
      }
      setWork("응모권을 계산하고, 패스키로 서명합니다");
      const ticket = await makeTicket(
        signer,
        status.round,
        picked,
        challenge,
        entry.powTarget,
        { params: ledger.powParams },
      );
      if (!ticket || registration === null)
        throw new Error("응모권을 만들지 못했습니다");
      setWork("장부에 내고 있습니다");
      const { receivedAt } = await ledger.submit(ticket, registration);
      setStep("folding");
      play("starBall");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      services.clock.after(reduce ? 0 : 900, () => onDone(ticket, receivedAt));
    } catch (err) {
      fail(err);
    }
  };

  /** 응모 단추: 고른 별로 응모권을 만들고 패스키로 서명한다(확인 한 번) */
  const start = async () => {
    if (key) await submit(key);
  };

  /** 패스키 만들기(등록만, 확인 한 번). 서명은 별을 고른 뒤 응모할 때 한다 */
  const createKey = async () => {
    setKeyWork("create");
    setKeyNote(null);
    setError(null);
    try {
      setKey(await services.wallet.createPasskey());
    } catch (err) {
      fail(err, "패스키를 만들지 않았어요");
    } finally {
      setKeyWork(null);
    }
  };

  /** 다른 기기에서 만든(따라온) 패스키를 찾아 장부의 등록을 확인한다 */
  const recoverKey = async () => {
    setKeyWork("recover");
    setKeyNote(null);
    setError(null);
    try {
      const found = await services.wallet.recoverPasskey((id) =>
        services.ledger.passkeyPub(id),
      );
      if (found) setKey(found);
      else
        setKeyNote(
          "이 패스키로 응모한 기록이 없어요. 처음이면 「패스키 만들기」를 눌러 주세요.",
        );
    } catch (err) {
      fail(err, "패스키를 찾지 못했어요");
    } finally {
      setKeyWork(null);
    }
  };

  if (!key)
    return (
      <section className="flex flex-col gap-4" aria-label="응모">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-white/70 hover:text-white"
          >
            ← 처음으로
          </button>
          <span className="text-sm text-white/60 tabular-nums">
            {roundShort(services.ledger.schedule, status.round)} 응모
          </span>
        </div>
        <KeySetup
          demo={demo}
          env={env}
          working={keyWork}
          note={keyNote}
          error={error}
          onCreate={() => void createKey()}
          onRecover={() => void recoverKey()}
        />
      </section>
    );

  return (
    <section className="flex flex-col gap-4" aria-label="응모">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 처음으로
        </button>
        <span className="text-sm text-white/60 tabular-nums">
          {roundShort(services.ledger.schedule, status.round)} 응모
        </span>
      </div>

      <div
        className={cn(
          "relative",
          step === "folding" && "sd-fold",
          step === "working" && "sd-breathe",
        )}
      >
        <SkyBoard
          state={{ mode: "pick", picked, focus, lit: [], bonus: null }}
          onPick={step === "pick" ? toggle : undefined}
          label={`응모판: 서울 하늘의 밝은 별 45개. 고른 별 ${picked.join(", ") || "없음"}`}
        />
        <span className="pointer-events-none absolute top-2 left-3 text-[11px] text-white/45">
          북쪽 하늘
        </span>
        <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-white/45">
          남쪽 하늘 · 동쪽이 왼쪽
        </span>
      </div>

      <StarInfo n={focus} />

      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const n = [...picked].sort((a, b) => a - b)[i];
          return n ? (
            <LottoBall key={n} n={n} className="sd-pop" />
          ) : (
            <span
              key={`empty-${i}`}
              className="size-9 rounded-full border border-white/20 border-dashed"
            />
          );
        })}
        <span className="ml-auto text-sm text-white/60 tabular-nums">
          {picked.length}/6
        </span>
      </div>

      {extra}

      <NumberSlip
        picked={picked}
        onToggle={toggle}
        disabled={step !== "pick"}
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={step !== "pick"}
          onClick={() => fill([])}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          자동
        </button>
        <button
          type="button"
          disabled={step !== "pick" || full}
          onClick={() => fill(picked)}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          남은 칸 자동
        </button>
        <button
          type="button"
          disabled={step !== "pick" || picked.length === 0}
          onClick={() => {
            setPicked([]);
            setFocus(null);
          }}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          지우기
        </button>
      </div>

      {error && <ErrorBox error={error} />}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!full || !open || step !== "pick"}
          onClick={() => void start()}
          className="sd-cta rounded-2xl py-3.5 font-bold text-lg text-slate-950 disabled:opacity-40"
        >
          {step === "working" || step === "folding"
            ? work || "응모하고 있습니다"
            : !open
              ? status.phase === "waiting"
                ? "앞 회차 추첨이 끝나면 응모할 수 있습니다"
                : "이번 회차 응모가 마감되었습니다"
              : !full
                ? `별을 ${6 - picked.length}개 더 골라 주세요`
                : "이 별 6개로 응모하기"}
        </button>
      </div>
    </section>
  );
}

/** 오류 상자. 패스키 확인을 취소했으면 설명 페이지의 패스키 칸으로 잇는다 */
function ErrorBox({ error }: { error: Failure }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-rose-100 text-sm"
    >
      <p className="break-keep">{error.text}</p>
      {error.kind === "cancelled" && (
        <a
          href="/stardraw/about#passkey"
          className="self-start text-rose-100 underline underline-offset-2"
        >
          패스키가 뭐예요?
        </a>
      )}
    </div>
  );
}

/**
 * 응모하려면 패스키가 필요하다: 별을 고르기 전에 먼저 만든다(등록만, 확인 한 번).
 * 다른 기기에서 만든 패스키가 따라왔으면 「이미 패스키가 있어요」로 찾는다.
 * 패스키를 못 쓰는 환경(앱 안 브라우저·미지원)은 한두 줄로 안내한다. 데모는 흉내라 막지 않는다
 */
export function KeySetup({
  demo,
  env,
  working,
  note,
  error,
  onCreate,
  onRecover,
}: {
  demo: boolean;
  env: Env | null;
  working: null | "create" | "recover";
  note: string | null;
  error: Failure | null;
  onCreate: () => void;
  onRecover: () => void;
}) {
  const blocked = !demo && env && (env.inApp || !env.api);
  return (
    <div
      className="sd-glass flex flex-col items-center gap-3 rounded-3xl px-5 py-7 text-center"
      data-key-setup
    >
      <KeyIcon className="size-9 text-amber-100" />
      <h2 className="font-bold text-xl">응모하려면 패스키가 필요해요</h2>
      {blocked ? (
        env?.inApp ? (
          <InAppNotice app={env.inApp} />
        ) : (
          <p role="note" className="break-keep text-sm text-white/80">
            이 브라우저는 패스키를 지원하지 않아요. 최신 Safari·Chrome으로 열어
            주세요.
          </p>
        )
      ) : (
        <>
          <button
            type="button"
            disabled={working !== null || (!demo && !env)}
            onClick={onCreate}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950 disabled:opacity-40"
          >
            {working === "create"
              ? "패스키를 만들고 있습니다"
              : "패스키 만들기"}
          </button>
          {!demo && env && !env.platform && (
            <p className="break-keep text-white/55 text-xs">
              화면 잠금(지문·얼굴·PIN)을 켜면 이 기기에서 바로 만들 수 있어요.
            </p>
          )}
          {!demo && (
            <button
              type="button"
              disabled={working !== null}
              onClick={onRecover}
              className="text-sm text-white/75 underline underline-offset-2 disabled:opacity-40"
            >
              {working === "recover" ? "찾고 있습니다" : "이미 패스키가 있어요"}
            </button>
          )}
        </>
      )}
      {note && <p className="break-keep text-amber-100/85 text-xs">{note}</p>}
      {error && <ErrorBox error={error} />}
      <a
        href="/stardraw/about#passkey"
        className="text-sky-200 text-xs underline underline-offset-2"
      >
        패스키가 뭐예요?
      </a>
    </div>
  );
}

/** 실제 로또 용지처럼 1~45 칸. 하늘에서 고른 것과 같다 */
function NumberSlip({
  picked,
  onToggle,
  disabled,
}: {
  picked: readonly number[];
  onToggle: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset
      className="rounded-2xl border border-rose-300/25 bg-[linear-gradient(180deg,rgba(255,228,230,0.07),rgba(255,228,230,0.03))] p-3"
      aria-label="번호 칸"
    >
      <legend className="px-1 text-rose-200/70 text-xs">
        번호로 고르기 · 별 이름은 누르면 위에 나옵니다
      </legend>
      <div className="grid grid-cols-7 gap-1.5">
        {SKY_STARS.map((s) => {
          const on = picked.includes(s.n);
          return (
            <button
              key={s.n}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={`${s.n} ${starOf(s.n).ko}`}
              onClick={() => onToggle(s.n)}
              className={cn(
                "relative grid h-9 place-items-center rounded-md font-semibold text-sm tabular-nums transition",
                on
                  ? "bg-amber-200 text-slate-950 shadow-[0_0_14px_rgba(253,230,138,0.55)]"
                  : "text-rose-100/85 hover:bg-rose-200/10",
              )}
            >
              {/* 용지의 칸 괄호 */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-1 inset-y-1 rounded-sm border-rose-300/40 border-x",
                  on && "border-transparent",
                )}
              />
              {s.n}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 앱 안 브라우저(카톡 등)는 패스키가 막힌다: Safari·Chrome으로 열도록 주소를 복사해 준다 */
function InAppNotice({ app }: { app: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm"
    >
      <p className="break-keep text-amber-50">
        {app} 안에서는 패스키를 쓸 수 없어요. Safari나 Chrome으로 열어 주세요.
      </p>
      <p className="break-keep text-amber-100/70 text-xs">
        오른쪽 위(또는 아래) 메뉴의 「다른 브라우저로 열기」를 누르거나, 주소를
        복사해 Safari·Chrome에 붙여 넣으세요.
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 hover:bg-amber-200/10"
      >
        {copied ? "주소를 복사했어요" : "주소 복사"}
      </button>
    </div>
  );
}
