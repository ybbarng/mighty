"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import {
  subscribeUnlock,
  type UnlockAsk,
  type UnlockPurpose,
} from "../demo-unlock";

/** 기기에 맞는 잠금 이름과 그림(데모 흉내라 기기 잠금 지원 여부는 묻지 않는다) */
type Method = "face" | "touch" | "finger" | "hello";

/** 잠금 이름과, 조사까지 붙인 안내 문장 */
function methodOf(ua: string): {
  method: Method;
  name: string;
  prompt: string;
} {
  if (/iPhone|iPad/i.test(ua))
    return { method: "face", name: "Face ID", prompt: "Face ID로 확인" };
  if (/Macintosh|Mac OS X/i.test(ua))
    return { method: "touch", name: "Touch ID", prompt: "Touch ID로 확인" };
  if (/Windows/i.test(ua))
    return {
      method: "hello",
      name: "Windows Hello",
      prompt: "Windows Hello로 확인",
    };
  return { method: "finger", name: "지문", prompt: "지문으로 확인" };
}

const TITLE: Record<UnlockPurpose, string> = {
  create: "패스키를 만들까요?",
  sign: "패스키로 서명할까요?",
};

/**
 * 데모의 패스키 흉내 시트: 휴대폰 시스템 창을 닮은 작은 창. 데모 지갑이 서명하기 전에 뜬다(`demo-unlock.ts`).
 * 데모 페이지에 하나만 둔다.
 */
export function DemoUnlockSheet() {
  const [ask, setAsk] = useState<UnlockAsk | null>(null);
  useEffect(() => subscribeUnlock(setAsk), []);
  if (!ask) return null;
  return <DemoUnlockPrompt key={ask.id} ask={ask} />;
}

/** 흉내 시트 한 장(화면 둘러보기는 가짜 요청으로 바로 띄운다) */
export function DemoUnlockPrompt({ ask }: { ask: UnlockAsk }) {
  const [phase, setPhase] = useState<"scan" | "done">("scan");
  const [{ method, name, prompt }] = useState(() =>
    methodOf(typeof navigator === "undefined" ? "" : navigator.userAgent),
  );
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ask.answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask]);

  const confirm = () => {
    if (phase === "done") return;
    setPhase("done");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 확인 표시를 잠깐 보인 뒤 닫는다(화면 연출일 뿐, 흐름은 답을 받은 뒤 이어진다)
    setTimeout(() => ask.answer(true), reduce ? 0 : 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 확인(데모 흉내)`}
        data-demo-unlock={ask.purpose}
        className="sd-unlock-in m-3 flex w-full max-w-[22rem] flex-col items-center gap-4 rounded-[1.75rem] border border-white/10 bg-slate-800/95 px-6 pt-6 pb-5 text-center text-white shadow-2xl"
      >
        <span className="rounded-full bg-amber-300/90 px-2.5 py-0.5 font-bold text-[11px] text-slate-950">
          데모 · 흉내
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-white/60 text-xs">
            하늘의 별 따기 · game.byb.kr
          </p>
          <p className="font-bold text-lg">{TITLE[ask.purpose]}</p>
        </div>

        <UnlockIcon method={method} done={phase === "done"} />
        <p className="text-sm text-white/75" aria-live="polite">
          {phase === "done" ? "확인했습니다" : prompt}
        </p>

        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => ask.answer(false)}
            disabled={phase === "done"}
            className="rounded-xl bg-white/10 py-2.5 font-semibold text-sm hover:bg-white/15 disabled:opacity-40"
          >
            취소
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            disabled={phase === "done"}
            className="rounded-xl bg-sky-500 py-2.5 font-semibold text-sm hover:bg-sky-400 disabled:opacity-60"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/** 잠금 그림: 훑는 빛이 지나가고, 확인하면 체크로 바뀐다 */
function UnlockIcon({ method, done }: { method: Method; done: boolean }) {
  return (
    <div
      className={cn(
        "relative grid size-20 place-items-center overflow-hidden rounded-2xl",
        done ? "text-emerald-300" : "text-sky-300",
      )}
      aria-hidden="true"
    >
      {done ? (
        <svg
          viewBox="0 0 48 48"
          className="sd-unlock-check size-14"
          aria-hidden="true"
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="M15 25l6 6 12-13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <>
          <svg viewBox="0 0 48 48" className="size-14" aria-hidden="true">
            {method === "face" || method === "hello" ? (
              <FaceGlyph />
            ) : (
              <FingerGlyph />
            )}
          </svg>
          <span className="sd-unlock-scan pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-sky-200/80 shadow-[0_0_10px_2px_rgba(125,211,252,0.55)]" />
        </>
      )}
    </div>
  );
}

/** Face ID·Windows Hello: 네 모서리 괄호와 눈·코·입 */
function FaceGlyph() {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <g {...s}>
      <path d="M6 15V10a4 4 0 0 1 4-4h5" />
      <path d="M33 6h5a4 4 0 0 1 4 4v5" />
      <path d="M42 33v5a4 4 0 0 1-4 4h-5" />
      <path d="M15 42h-5a4 4 0 0 1-4-4v-5" />
      <path d="M17 18v4" />
      <path d="M31 18v4" />
      <path d="M24 18v9h-2" />
      <path d="M18 33c3.5 3 8.5 3 12 0" />
    </g>
  );
}

/** Touch ID·지문: 겹친 활 모양 */
function FingerGlyph() {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
  };
  return (
    <g {...s}>
      <path d="M14 13a14 14 0 0 1 22 2" />
      <path d="M11 21a13 13 0 0 1 26-1c0 6-1 11-3 15" />
      <path d="M16 36c2-4 3-9 3-14a5 5 0 0 1 10 0c0 7-1 13-4 19" />
      <path d="M24 22c0 8-2 15-6 21" />
      <path d="M11 29c0 3-1 6-2 8" />
      <path d="M34 40c1-3 1.5-6 1.8-9" />
    </g>
  );
}
