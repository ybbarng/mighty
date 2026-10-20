"use client";

import { SPEEDS, useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

import { CARD_THEMES } from "./card-art/themes";

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
    <div className="flex gap-1.5">
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

/** 게임 중 설정: 진행 속도, 카드 디자인 */
export function SettingsMenu({ onClose }: { onClose: () => void }) {
  const speed = useSettings((s) => s.speed);
  const setSpeed = useSettings((s) => s.setSpeed);
  const sound = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  return (
    <div className="fixed inset-0 z-[400]" onPointerDown={onClose}>
      <div
        className="absolute top-14 right-3 flex w-64 flex-col gap-3 rounded-2xl border border-white/15 bg-felt-dark/95 p-4 shadow-2xl backdrop-blur"
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
        <p className="text-[11px] leading-relaxed opacity-50">
          키보드: ← → 로 카드 고르기, Enter 로 내기, Esc 로 선택 취소
        </p>
      </div>
    </div>
  );
}
