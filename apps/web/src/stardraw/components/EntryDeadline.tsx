"use client";

import { useState } from "react";
import { EASE, FX } from "../fx-timing";
import { ReturnedPaper } from "./EnterSubmit";
import { formatLeft } from "./parts";
import { StageOverlay } from "./StageOverlay";

/**
 * 마감 안내를 띄우기 시작하는 남은 시간(초). 남은 시간은 장부 시각(서버 시각에 맞춘 값)으로 화면 마감(entryDeadline,
 * 응모하기 단추가 닫히는 때)까지 잰다
 */
export const HURRY_FROM = 60;

/**
 * 마감 1분 전부터 화면 맨 위에 뜨는 우주국 말(2026-10-31 사용자): "마감까지 0:42 · 응모 접수에 시간이 걸리니 서둘러 주세요."
 * 고르는 화면에서는 하늘판 위쪽 가장자리에 겹친 얇은 띠(자리를 차지하지 않아 화면이 밀리지 않고, 누름은 하늘로 통과),
 * 연출 오버레이가 떠 있으면(floating)
 * 오버레이 위 맨 위에 떠서(우주국 말 자리보다 위) 연출 중에도 남은 시간을 본다
 */
export function HurryNotice({
  left,
  floating = false,
}: {
  left: number;
  floating?: boolean;
}) {
  if (left > HURRY_FROM || left <= 0) return null;
  return (
    <p
      role="status"
      data-hurry
      className={`pointer-events-none rounded-full border border-amber-200/40 px-3 py-1 text-center text-amber-100 text-xs tabular-nums ${
        floating
          ? "fixed inset-x-0 z-[78] mx-auto w-fit bg-[#1a1408]/90"
          : "absolute inset-x-2 top-2 z-10 break-keep bg-[#1a1408]/55 [text-shadow:0_1px_2px_#000]"
      }`}
      style={
        floating
          ? { top: "max(10px, calc(env(safe-area-inset-top, 0px) + 6px))" }
          : undefined
      }
    >
      마감까지 {formatLeft(left)} · 응모 접수에 시간이 걸리니 서둘러 주세요.
    </p>
  );
}

/** 한국 시각 "18:55:00" */
export function kstClock(seconds: number): string {
  return new Date((seconds + 9 * 3600) * 1000).toISOString().slice(11, 19);
}

/**
 * 접수 반송: 마감 뒤에 도착한 응모권은 영수증 대신 출력구에서 냈던 응모 용지(칠한 칸 그대로, 회차 표시)가 돌아오고,
 * 다 나오면 빨간 「접수 반송」 도장이 찍힌다. 아래에 사유와 우주국이 받은 시각(작게). 반송은 내 응모에 남기지 않는다.
 * 「이 용지 보관하기」는 용지를 아래로 내려 챙기고(onKeep, 다음 회차 응모 페이지의 「이 용지로 응모」), 이어서
 * "이번 회차 추첨을 보러 갈까요?"로 「추첨 보러 가기」·「첫 화면으로」. 작은 「닫기」는 보관하지 않고 버린다.
 * 다음 회차가 열리기까지(앞 회차 추첨) 몇 분 걸려 이 자리에 붙잡아 두지 않는다(2026-11-01 사용자)
 */
export function BounceSlip({
  title,
  picked,
  deadline,
  received,
  onKeep,
  onDraw,
  onHome,
  onClose,
}: {
  /** 돌려받은 용지의 회차 표시 "1회 응모 용지" */
  title: string;
  picked: readonly number[];
  /** 화면 마감 "18:54:55" */
  deadline: string;
  /** 우주국이 받은 시각 "18:55:03" */
  received: string;
  onKeep: () => void;
  onDraw: () => void;
  onHome: () => void;
  onClose: () => void;
}) {
  const feed = FX.printFeed / 2;
  const [phase, setPhase] = useState<"slip" | "keeping" | "kept">("slip");
  const keep = () => {
    if (phase !== "slip") return;
    onKeep();
    setPhase("keeping");
    window.setTimeout(() => setPhase("kept"), FX.paperAway);
  };
  return (
    <StageOverlay label="접수 반송" appear={false}>
      <p
        key={phase === "kept" ? "kept" : "slip"}
        role="status"
        className="sd-text-in sd-submit-status min-h-14 break-keep text-center font-bold text-amber-100 text-lg"
      >
        {phase === "kept"
          ? "이번 회차 추첨을 보러 갈까요?"
          : "응모가 마감되었습니다."}
      </p>
      {phase !== "kept" && (
        <div
          className="sd-printer w-full"
          style={
            {
              "--print-feed": `${feed}ms`,
              "--print-delay": `${FX.printDelay}ms`,
            } as React.CSSProperties
          }
        >
          <div aria-hidden="true" className="sd-printer-slot" />
          <div
            className="sd-printer-feed transition-[transform,opacity]"
            data-keeping={phase === "keeping" || undefined}
            style={{
              transform: phase === "keeping" ? "translateY(110vh)" : undefined,
              opacity: phase === "keeping" ? 0.6 : 1,
              transitionDuration: `${FX.paperAway}ms`,
              transitionTimingFunction: EASE,
            }}
          >
            <div data-bounce className="sd-print flex flex-col gap-3">
              <ReturnedPaper
                title={title}
                marked={picked}
                stampDelay={FX.printDelay + feed}
              />
              <p className="break-keep text-center text-slate-100 text-sm">
                응모 마감({deadline}) 뒤에 도착했습니다.
              </p>
              <p className="text-center font-mono text-slate-400 text-xs tabular-nums">
                우주국이 받은 시각 {received}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col items-center gap-2">
        {phase === "kept" ? (
          <>
            <button
              type="button"
              onClick={onDraw}
              className="sd-text-in sd-cta w-full max-w-sm rounded-2xl py-3.5 font-bold text-lg text-slate-950"
            >
              추첨 보러 가기
            </button>
            <button
              type="button"
              onClick={onHome}
              className="sd-text-in w-full max-w-sm rounded-2xl border border-white/25 py-3 font-semibold hover:bg-white/10"
            >
              첫 화면으로
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={keep}
              disabled={phase !== "slip"}
              className="sd-cta w-full max-w-sm rounded-2xl py-3.5 font-bold text-lg text-slate-950"
            >
              이 용지 보관하기
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={phase !== "slip"}
              className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
            >
              닫기
            </button>
          </>
        )}
      </div>
    </StageOverlay>
  );
}

/**
 * 응모 중 오류(마감 반송 밖): 오버레이 위쪽 우주국 말 자리에 까닭(errors.ts 문구), 아래에 「다시 시도」와 작은 「닫기」.
 * 다시 시도는 고른 별 그대로 응모를 처음부터 다시 낸다
 */
export function ErrorStage({
  text,
  onRetry,
  onClose,
}: {
  text: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <StageOverlay label="응모 오류" appear={false}>
      <p
        role="alert"
        data-entry-error
        className="sd-text-in break-keep text-center font-bold text-amber-100 text-lg"
      >
        {text}
      </p>
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="sd-cta w-full max-w-sm rounded-2xl py-3.5 font-bold text-lg text-slate-950"
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
        >
          닫기
        </button>
      </div>
    </StageOverlay>
  );
}
