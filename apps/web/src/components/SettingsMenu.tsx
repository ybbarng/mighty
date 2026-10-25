"use client";

import { useState } from "react";

import { BOT_LEVELS } from "@/game/bots";
import { SPEEDS, useSettings } from "@/game/settings";
import { previewVolume } from "@/game/sound";
import { cn } from "@/lib/cn";

import { CARD_THEMES } from "./card-art/themes";
import { SuitStylePicker } from "./SuitStylePicker";
import { GlossarySheet } from "./tutorial/GlossarySheet";

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
            "whitespace-nowrap rounded-full border px-3 py-1 text-xs",
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
  const volume = useSettings((s) => s.volume);
  const setVolume = useSettings((s) => s.setVolume);
  const setSound = useSettings((s) => s.setSound);
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  const slangTerms = useSettings((s) => s.slangTerms);
  const setSlangTerms = useSettings((s) => s.setSlangTerms);
  const botLevel = useSettings((s) => s.botLevel);
  const setBotLevel = useSettings((s) => s.setBotLevel);
  const [glossary, setGlossary] = useState(false);
  if (glossary) return <GlossarySheet onClose={onClose} />;
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
          {sound && (
            <input
              type="range"
              aria-label="효과음 크기"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              // 손을 뗄 때 바뀐 크기로 한 번 들려준다.
              onPointerUp={() => previewVolume()}
              onKeyUp={() => previewVolume()}
              className="w-full accent-amber-400"
            />
          )}
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
          <span className="text-xs opacity-70">무늬 표기</span>
          <SuitStylePicker />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">
            마이티 은어 (셋트·기아·삽컴)
          </span>
          <Chips
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            value={slangTerms ? "on" : "off"}
            onChange={(v) => setSlangTerms(v === "on")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">컴퓨터 실력 (새 게임부터)</span>
          <Chips options={BOT_LEVELS} value={botLevel} onChange={setBotLevel} />
        </div>
        <button
          type="button"
          onClick={() => setGlossary(true)}
          className="rounded-xl bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/15"
        >
          📖 용어 사전
        </button>
        <p className="text-[11px] leading-relaxed opacity-50">
          키보드: ← → 로 카드 고르기, Enter 로 내기, Esc 로 선택 취소
        </p>
      </div>
    </div>
  );
}
