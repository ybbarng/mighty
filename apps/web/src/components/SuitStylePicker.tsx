"use client";

import { useSettings } from "@/game/settings";
import { SUIT_STYLES } from "@/game/suit-style";
import { cn } from "@/lib/cn";

import { SuitText } from "./SuitText";

/** 미리 보기 문구: 헷갈리기 쉬운 ♠·♣, ♥·◆가 모두 들어 있다 */
const SAMPLE = "♠13 · ♣A · ♥Q · ◆K";

/** 무늬 표기 고르기. 옵션 화면과 게임 중 설정 메뉴(마이티·하트)가 함께 쓴다 */
export function SuitStylePicker({ detail = false }: { detail?: boolean }) {
  const style = useSettings((s) => s.suitStyle);
  const setStyle = useSettings((s) => s.setSuitStyle);
  const current = SUIT_STYLES.find((o) => o.value === style);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {SUIT_STYLES.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === style}
            onClick={() => setStyle(o.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1 text-xs",
              o.value === style
                ? "border-amber-300 bg-white text-black"
                : "border-white/15 bg-white/5",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="rounded-lg bg-black/30 px-2 py-1 text-sm" data-suit-sample>
        <SuitText text={SAMPLE} />
      </p>
      {detail && current && (
        <p className="text-xs opacity-60">
          <SuitText text={current.description} style={current.value} />
        </p>
      )}
    </div>
  );
}
