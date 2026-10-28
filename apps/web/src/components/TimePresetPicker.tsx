"use client";

import {
  TIME_PRESET_NAMES,
  TIME_PRESETS,
  type TimePreset,
} from "@mighty/engine";

import { cn } from "@/lib/cn";

const ORDER: readonly TimePreset[] = ["none", "fast", "normal"];

/** 고른 시간 규칙을 한 줄로(첫 화면 안내 등). 시간 없음이면 null */
export function timePresetLabel(preset: TimePreset | undefined): string | null {
  return !preset || preset === "none" ? null : TIME_PRESET_NAMES[preset];
}

/**
 * 판 게임 옵션의 개인 시간 고르기(docs/24). 오목·장기가 같이 쓴다.
 * 혼자 하기는 내 시계만 의미가 있고(컴퓨터는 금방 둔다), 다함께는 두 사람 모두 잰다
 */
export function TimePresetPicker({
  value,
  onChange,
}: {
  value: TimePreset;
  onChange: (preset: TimePreset) => void;
}) {
  const control = value === "none" ? null : TIME_PRESETS[value];
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value === preset}
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              value === preset
                ? "border-amber-300 bg-white text-black"
                : "border-white/15 bg-white/5",
            )}
          >
            {TIME_PRESET_NAMES[preset]}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-60">
        {control
          ? `한 사람에게 기본 ${control.base / 60_000}분, 다 쓰면 한 수에 ${control.byoyomi / 1000}초씩 초읽기 ${control.periods}번. 초읽기를 다 넘기면 시간패`
          : "시간 제한 없이 둔다"}
      </p>
    </>
  );
}
