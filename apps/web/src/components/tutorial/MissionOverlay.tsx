"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { MissionStatus } from "@/tutorial/lessons";

import { ActionButton } from "../panels/common";
import { RichText } from "./RichText";

export interface MissionProps {
  title: string;
  objective: string;
  hint: string;
  status: MissionStatus;
  successText: string;
  failText: string;
  onNext: () => void;
  onRetry: () => void;
}

/** 게임 화면 위의 미션 목표 띠와 성공·실패 안내 */
export function MissionOverlay({
  mission,
  top,
}: {
  mission: MissionProps;
  top: number;
}) {
  const [showHint, setShowHint] = useState(false);
  // 성공 안내를 잠시 접고 뒤에 깔린 판 결과를 볼 수 있다.
  const [peek, setPeek] = useState(false);
  const { status } = mission;

  return (
    <>
      <div
        className="absolute inset-x-0 z-[260] mx-auto flex w-[min(92%,30rem)] items-start gap-2 rounded-2xl border border-amber-300/40 bg-black/75 px-3 py-2 text-sm shadow-xl backdrop-blur"
        style={{ top }}
      >
        <span className="shrink-0 rounded-md bg-amber-400 px-1.5 py-0.5 font-bold text-black text-xs">
          미션
        </span>
        <p className="min-w-0 flex-1 leading-snug">
          <RichText text={showHint ? mission.hint : mission.objective} />
        </p>
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          className="shrink-0 rounded-lg bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
        >
          {showHint ? "목표" : "힌트"}
        </button>
      </div>

      {status && peek && (
        <button
          type="button"
          onClick={() => setPeek(false)}
          className="pop-in absolute inset-x-0 z-[400] mx-auto w-fit rounded-full bg-amber-400 px-4 py-2 font-bold text-black text-sm shadow-xl"
          style={{ top: top + 52 }}
        >
          미션 결과로 돌아가기
        </button>
      )}

      {status && !peek && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-label={status === "success" ? "미션 성공" : "미션 실패"}
            className={cn(
              "pop-in flex w-full max-w-sm flex-col gap-3 rounded-3xl border p-5 shadow-2xl",
              status === "success"
                ? "border-emerald-300/60 bg-emerald-950/95"
                : "border-rose-300/60 bg-rose-950/95",
            )}
          >
            <h2 className="font-black text-2xl">
              {status === "success" ? "성공! 🎉" : "다시 해 볼까요?"}
            </h2>
            <p className="text-[15px] leading-relaxed">
              <RichText
                text={
                  status === "success" ? mission.successText : mission.failText
                }
              />
            </p>
            {status === "success" ? (
              <>
                <ActionButton
                  className="py-3 text-base"
                  onClick={mission.onNext}
                >
                  다음
                </ActionButton>
                <ActionButton variant="secondary" onClick={() => setPeek(true)}>
                  판 보기
                </ActionButton>
              </>
            ) : (
              <ActionButton
                className="py-3 text-base"
                onClick={mission.onRetry}
              >
                다시 하기
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </>
  );
}
