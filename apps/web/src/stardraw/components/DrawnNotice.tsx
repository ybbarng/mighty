"use client";

import type { Schedule } from "@mighty/stardraw-core";

import { roundShort } from "../round-label";

/**
 * 추첨이 끝났는데 아직 열어 보지 않은 내 회차가 있으면 화면 위쪽에 띄우는 알림 띠(spoiler.ts가 가린 회차).
 * 숫자·등수는 담지 않는다. 「추첨 보기」는 가장 최근 회차 추첨으로, ✕로 닫으면 그 회차들은 이 기기에서 다시 띄우지 않는다
 */
export function DrawnNotice({
  rounds,
  schedule,
  onDraw,
  onClose,
}: {
  /** 알릴 회차(작은 번호부터) */
  rounds: readonly number[];
  schedule: Schedule;
  onDraw: (round: number) => void;
  onClose: () => void;
}) {
  const latest = rounds.at(-1);
  if (latest === undefined) return null;
  return (
    <div
      role="status"
      data-drawn-notice={rounds.join(",")}
      className="sd-rise flex items-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-200/10 py-2 pr-2 pl-4"
    >
      <span className="min-w-0 flex-1 break-keep font-semibold text-amber-50 text-sm">
        {rounds.length === 1
          ? `${roundShort(schedule, latest)} 추첨이 끝났습니다`
          : `추첨이 끝난 응모 ${rounds.length}회`}
      </span>
      <button
        type="button"
        onClick={() => onDraw(latest)}
        className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 font-bold text-slate-950 text-sm hover:bg-amber-100"
      >
        추첨 보기
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
      >
        ✕
      </button>
    </div>
  );
}
