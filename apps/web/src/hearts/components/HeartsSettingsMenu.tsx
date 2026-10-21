"use client";

import { CARD_THEMES } from "@/components/card-art/themes";
import { SPEEDS, useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

import { HEARTS_LEVELS } from "../bots";
import { useHeartsSettings } from "../settings";

function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            o.value === value
              ? "border-amber-300 bg-white text-black"
              : "border-white/15 bg-white/5",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 게임 중 설정(하트): 진행 속도, 효과음, 카드, 컴퓨터 실력 */
export function HeartsSettingsMenu({ onClose }: { onClose: () => void }) {
  const speed = useSettings((s) => s.speed);
  const setSpeed = useSettings((s) => s.setSpeed);
  const sound = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  const level = useHeartsSettings((s) => s.level);
  const setLevel = useHeartsSettings((s) => s.setLevel);
  return (
    <div className="fixed inset-0 z-[400]" onPointerDown={onClose}>
      <div
        className="absolute top-14 right-3 flex max-h-[calc(100dvh-4.5rem)] w-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/15 bg-felt-dark/95 p-4 shadow-2xl backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">진행 속도</span>
          <Chips options={SPEEDS} value={speed} onChange={setSpeed} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">효과음</span>
          <Chips
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            value={sound ? "on" : "off"}
            onChange={(v) => setSound(v === "on")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">카드</span>
          <Chips
            options={CARD_THEMES.map((t) => ({ value: t.id, label: t.name }))}
            value={cardThemeId}
            onChange={setCardTheme}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">컴퓨터 실력 (새 게임부터)</span>
          <Chips options={HEARTS_LEVELS} value={level} onChange={setLevel} />
        </div>
      </div>
    </div>
  );
}
