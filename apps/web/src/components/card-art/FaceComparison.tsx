"use client";

import type { Card } from "@mighty/engine";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";

import { CardArt } from "./CardArt";
import {
  type CardTheme,
  CLASSIC,
  FACE_DEMO_THEMES,
  FOUR_COLOR,
  INDEX_FONTS,
} from "./themes";

const FACES: Card[] = [
  "SK",
  "SQ",
  "SJ",
  "HK",
  "HQ",
  "HJ",
  "DK",
  "DQ",
  "DJ",
  "CK",
  "CQ",
  "CJ",
];
/** 글씨를 견주려고 숫자 카드도 몇 장 같이 둔다 */
const NUMBERS: Card[] = ["SA", "H10", "D7", "C2"];

const NOTES: Record<string, string> = {
  classic: "지금 쓰는 글자형",
  "demo-a":
    "Dmitry Fomin 전통 그림(CC0)에서 인물만 떼어 비율 그대로 넣음. 글씨는 우리가 그림",
  "demo-b": "직접 그린 인물을 넓은 틀에 크게",
  "demo-c": "시안 A에 선을 굵게 하는 효과. 손패처럼 작을 때 또렷함",
};

const SIZES = [
  { id: "large", name: "크게", className: "w-28" },
  { id: "hand", name: "손패 크기", className: "w-14" },
] as const;

/** 그림 카드 시안 비교(/cards/faces). 모서리 글씨 폰트와 크기를 바꿔 가며 본다 */
export function FaceComparison() {
  const [fontId, setFontId] = useState<string>("condensed");
  const [sizeId, setSizeId] = useState<string>("large");
  const [fourColor, setFourColor] = useState(false);
  const font = INDEX_FONTS.find((f) => f.id === fontId)?.value;
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0];

  const rows: CardTheme[] = useMemo(() => {
    const colors = fourColor ? FOUR_COLOR : CLASSIC;
    return [CLASSIC, ...FACE_DEMO_THEMES].map((t) => ({
      ...t,
      suitColor: colors.suitColor,
      faceTint: colors.faceTint,
      id: `${t.id}-${fontId}-${fourColor ? 4 : 2}`,
      name: t.name,
      ...(font ? { indexFont: font } : {}),
    }));
  }, [font, fontId, fourColor]);

  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs",
      on
        ? "border-amber-300 bg-white text-black"
        : "border-white/20 bg-white/10",
    );

  return (
    <main className="min-h-dvh bg-[#0a3622] p-4">
      <h1 className="mb-1 font-bold text-lg">그림 카드 시안</h1>
      <p className="mb-3 text-sm opacity-70">
        J·Q·K 그리는 방법 세 가지를 지금 모양과 나란히 놓았다. 모서리 글씨
        폰트와 크기를 바꿔 가며 본다.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs opacity-70">글씨</span>
        {INDEX_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFontId(f.id)}
            className={chip(f.id === fontId)}
          >
            {f.name}
          </button>
        ))}
        <span className="mr-1 ml-4 text-xs opacity-70">크기</span>
        {SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSizeId(s.id)}
            className={chip(s.id === sizeId)}
          >
            {s.name}
          </button>
        ))}
        <span className="mr-1 ml-4 text-xs opacity-70">색</span>
        <button
          type="button"
          onClick={() => setFourColor(false)}
          className={chip(!fourColor)}
        >
          2색
        </button>
        <button
          type="button"
          onClick={() => setFourColor(true)}
          className={chip(fourColor)}
        >
          4색
        </button>
      </div>
      <div className="flex flex-col gap-6">
        {rows.map((theme) => {
          const baseId = theme.id.split("-").slice(0, 2).join("-");
          const noteKey = baseId.startsWith("classic") ? "classic" : baseId;
          return (
            <section key={theme.id} className="flex flex-col gap-2">
              <h2 className="font-semibold">
                {noteKey === "classic" ? "지금" : theme.name}
                <span className="ml-2 font-normal text-xs opacity-60">
                  {NOTES[noteKey]}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {[...FACES, ...NUMBERS].map((card) => (
                  <div
                    key={card}
                    className={cn(
                      "aspect-[5/7] drop-shadow-lg",
                      size.className,
                    )}
                  >
                    <CardArt card={card} theme={theme} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
