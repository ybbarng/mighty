"use client";

import { HWATU_DECK, MONTH_NAMES, type Month } from "@mighty/hwatu";
import { useState } from "react";

import { HwatuCardView } from "./HwatuCard";
import {
  HwatuBacks,
  HwatuCaptured,
  HwatuDeck,
  HwatuFloor,
  HwatuHand,
} from "./HwatuLayout";

const MONTHS = Object.keys(MONTH_NAMES).map(Number) as Month[];

/** 화투 카드 모음: 48장 전부, 손패·바닥·먹은 패·더미 예시 */
export function HwatuGallery() {
  const [selected, setSelected] = useState<string | null>("03g");
  const month = selected ? Number(selected.slice(0, 2)) : null;
  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#14532d_0%,#052e16_75%)] px-4 py-6 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-black text-2xl">화투 카드 모음</h1>
        <section aria-label="48장" className="flex flex-col gap-2">
          {MONTHS.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-sm text-white/80">
                {m}월 {MONTH_NAMES[m]}
              </span>
              <div className="flex flex-wrap gap-1">
                {HWATU_DECK.filter((c) => c.month === m).map((c) => (
                  <HwatuCardView key={c.id} id={c.id} width={48} />
                ))}
              </div>
            </div>
          ))}
        </section>
        <section
          aria-label="화면 조각 예시"
          className="flex flex-col gap-4 rounded-2xl bg-black/25 p-4"
        >
          <div className="flex items-center justify-between">
            <HwatuBacks count={7} />
            <HwatuDeck count={21} />
          </div>
          <HwatuFloor
            ids={["03p", "01g", "08a", "11p", "03q", "06r", "12a", "09a"]}
            highlight={(id) =>
              month !== null && Number(id.slice(0, 2)) === month
            }
          />
          <HwatuHand
            ids={["03g", "02r", "11d", "05a", "08g", "10p", "12g"]}
            playable={(id) => id !== "10p"}
            selected={selected}
            onSelect={(id) => setSelected(id === selected ? null : id)}
          />
          <HwatuCaptured
            label="나"
            ids={[
              "01g",
              "08g",
              "02a",
              "04a",
              "01r",
              "02r",
              "03r",
              "11d",
              "05p",
              "06p",
              "07q",
            ]}
          />
        </section>
      </div>
    </main>
  );
}
