"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** 움직임 줄이기 설정(첫 그리기 뒤에 읽는다) */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * 제출·제시·발급·인사·영수증 출력 연출을 띄우는 화면 전체 오버레이 한 층(2026-10-31 사용자: 몰입감 있게).
 * 뒤 화면은 밤하늘 결로 어둡고 살짝 흐려지며, 탭바·메뉴·띠·바닥글을 모두 덮는다. 떠 있는 동안 뒤 화면은 스크롤도
 * 조작도 되지 않는다. `closing`이면 걷힌다(그 뒤 바깥에서 지운다). 움직임 줄이기면 바깥에서 아예 쓰지 않는다
 */
export function StageOverlay({
  label,
  closing = false,
  align = "top",
  scroll = false,
  appear = true,
  children,
}: {
  /** 덮일 때 나타나는 움직임. 앞 오버레이에 바로 이어 그릴 때는 false(사라졌다 다시 나타나 보이지 않게) */
  appear?: boolean;
  label: string;
  closing?: boolean;
  /** top: 위쪽(출력구 자리)부터, center: 가운데 */
  align?: "top" | "center";
  /** 안 내용이 화면보다 길면 오버레이 안에서 스크롤(발급한 등록증) */
  scroll?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-stage-overlay={closing ? "closing" : "open"}
      className={cn(
        "fixed inset-0 z-[70]",
        appear && "sd-stage",
        scroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
        closing && "sd-stage-out",
      )}
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(22,30,56,0.95),rgba(5,9,18,0.97))] backdrop-blur-md"
      />
      <div
        className={cn(
          "sd-stage-pad relative mx-auto flex min-h-full w-full max-w-xl flex-col gap-4",
          align === "center" ? "justify-center" : "justify-start",
        )}
      >
        {children}
      </div>
    </div>
  );
}
