"use client";

import { type Card, fullDeck } from "@mighty/engine";

import { useCardTheme, useSettings } from "@/game/settings";
import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

import { CardArt } from "./CardArt";
import { CARD_THEMES } from "./themes";

/** 카드 디자인 미리보기(/cards). 테마를 바꿔 가며 53장과 뒷면을 한눈에 본다 */
export function CardGallery() {
  const theme = useCardTheme();
  const setCardTheme = useSettings((s) => s.setCardTheme);
  const cards: (Card | null)[] = [...fullDeck(), null];
  return (
    <main className="min-h-dvh bg-[#0a3622] p-4">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="font-bold text-lg">카드 디자인</h1>
        {CARD_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCardTheme(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              t.id === theme.id
                ? "border-amber-300 bg-white text-black"
                : "border-white/20 bg-white/10",
            )}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-3">
        {cards.map((card) => (
          <figure
            key={card ?? "back"}
            className="flex flex-col items-center gap-1"
          >
            <div className="aspect-[5/7] w-full drop-shadow-md">
              <CardArt card={card} theme={theme} />
            </div>
            <figcaption className="text-xs opacity-70">
              {card ? cardLabel(card) : "뒷면"}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
