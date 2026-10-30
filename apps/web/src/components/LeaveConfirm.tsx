"use client";

import { useEffect, useRef } from "react";

import { useLeaveConfirm } from "@/game/screen-history";

/**
 * 온라인 판을 뒤로가기로 떠나려 할 때 묻는 페이지 안 확인창(useScreenHistory 가 연다).
 * 브라우저의 confirm()은 쓰지 않는다.
 */
export function LeaveConfirm() {
  const open = useLeaveConfirm((s) => s.open);
  const close = useLeaveConfirm((s) => s.close);
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // 실수로 나가지 않게 "계속 하기"에 먼저 초점을 둔다
    stay.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="leave-confirm-title"
      data-leave-confirm
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
    >
      <div className="flex w-full max-w-xs flex-col gap-4 rounded-2xl border border-white/15 bg-neutral-900 p-5 text-center shadow-2xl">
        <p id="leave-confirm-title" className="break-keep font-bold">
          {open.message}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            ref={stay}
            onClick={close}
            className="rounded-xl bg-white/10 px-3 py-2.5 hover:bg-white/15"
          >
            계속 하기
          </button>
          <button
            type="button"
            onClick={() => {
              const leave = open.onLeave;
              close();
              leave();
            }}
            className="rounded-xl bg-red-600 px-3 py-2.5 font-bold hover:bg-red-500"
          >
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}
