"use client";

import {
  type KeyRegistration,
  makeRegistration,
  makeTicket,
  type Ticket,
} from "@mighty/stardraw-core";
import { useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { type LedgerStatus, PRACTICE_POW } from "../local-ledger";
import type { Services } from "../services";
import { SKY_STARS, starOf } from "../sky";
import { type KeyInfo, passkeySupported } from "../wallet";
import { LottoBall, StarInfo } from "./parts";
import { SkyBoard } from "./SkyBoard";

type Step = "pick" | "key" | "working" | "folding";

/** 응모: 네모 하늘이나 아래 번호 칸에서 별 6개를 고르고 낸다 */
export function EnterView({
  services,
  status,
  onDone,
  onBack,
}: {
  services: Services;
  status: LedgerStatus;
  onDone: (ticket: Ticket, receivedAt: number) => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [work, setWork] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = picked.length === 6;
  const open = status.phase === "open";

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
      if (!ledger.isRegistered(key.pub)) {
        setWork("처음 한 번, 열쇠를 장부에 올릴 계산을 하고 있습니다");
        registration = await makeRegistration(
          { publicKey: key.pub },
          key.kind === "passkey" ? "passkey" : "raw",
          key.kind === "passkey" ? key.credentialId : new Uint8Array(),
          challenge,
          entry.registerPowTarget,
          { params: PRACTICE_POW },
        );
      }
      setWork(
        key.kind === "passkey"
          ? "응모권을 계산하고, 패스키로 서명합니다"
          : "응모권을 계산하고 서명합니다",
      );
      const ticket = await makeTicket(
        signer,
        status.round,
        picked,
        challenge,
        entry.powTarget,
        { params: PRACTICE_POW },
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
      setStep("pick");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "패스키 서명을 취소했습니다. 다시 눌러 주세요"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  const start = () => {
    const key = services.wallet.loadKey();
    if (key) void submit(key);
    else setStep("key");
  };

  const makeKey = async (kind: "passkey" | "device") => {
    setError(null);
    try {
      const key =
        kind === "passkey"
          ? await services.wallet.createPasskey()
          : await services.wallet.createDeviceKey();
      await submit(key);
    } catch (err) {
      setStep("key");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "패스키를 만들지 않았습니다. 다시 하거나 이 기기에만 열쇠를 두어 주세요"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

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
          {status.round}회 응모
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

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-500/15 px-3 py-2 text-rose-200 text-sm"
        >
          {error}
        </p>
      )}

      {step === "key" ? (
        <KeyChoice onChoose={makeKey} />
      ) : (
        <button
          type="button"
          disabled={!full || !open || step !== "pick"}
          onClick={start}
          className="sd-cta rounded-2xl py-3.5 font-bold text-lg text-slate-950 disabled:opacity-40"
        >
          {step === "working" || step === "folding"
            ? work || "응모하고 있습니다"
            : !open
              ? status.phase === "waiting"
                ? "앞 회차 추첨이 끝나면 응모할 수 있습니다"
                : "이번 회차 응모가 마감되었습니다"
              : full
                ? "이 별 6개로 응모하기"
                : `별을 ${6 - picked.length}개 더 골라 주세요`}
        </button>
      )}
    </section>
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

function KeyChoice({
  onChoose,
}: {
  onChoose: (kind: "passkey" | "device") => void;
}) {
  const passkey = passkeySupported();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="font-semibold">처음 한 번, 응모 열쇠를 만듭니다</p>
      <p className="break-keep text-sm text-white/70">
        응모권에는 이 열쇠의 서명이 들어갑니다. 당첨되면 같은 열쇠로 본인임을
        확인합니다. 이름·이메일은 받지 않습니다.
      </p>
      {passkey && (
        <button
          type="button"
          onClick={() => onChoose("passkey")}
          className="sd-cta rounded-xl py-3 font-bold text-slate-950"
        >
          패스키로 만들기(추천)
        </button>
      )}
      <button
        type="button"
        onClick={() => onChoose("device")}
        className="rounded-xl border border-white/20 py-2.5 text-sm hover:bg-white/10"
      >
        이 기기에만 열쇠 두기
      </button>
      <p className="break-keep text-white/55 text-xs">
        {passkey
          ? "패스키는 iCloud 키체인·Google 비밀번호 관리자·1Password 등에 저장되어 기기를 바꿔도 따라옵니다. 이 기기에만 둔 열쇠는 브라우저 저장소를 지우면 사라집니다."
          : "이 브라우저는 패스키를 쓸 수 없어 이 기기에만 열쇠를 둡니다. 브라우저 저장소를 지우면 사라집니다."}
      </p>
    </div>
  );
}
