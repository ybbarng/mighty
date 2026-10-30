"use client";

import { MadeWith } from "@/components/brand/MadeWith";

import { useLedger } from "../services";
import { AstronautPanel } from "./AstronautPanel";

/**
 * 내 우주인 등록증 /stardraw/id(docs/36 11-9). 이 기기의 내 등록증만 보인다.
 * 등록증은 공개 열쇠에서 누구나 계산할 수 있지만, 우리 화면은 남의 등록증(얼굴·이름·주소)을 그려 주지 않는다.
 * 등록증이 없으면 등록하러 가는 길을 둔다.
 */
export function AstronautView() {
  const { services } = useLedger();
  const key = services?.wallet.loadKey() ?? null;

  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <a
            href="/stardraw"
            className="text-sm text-white/70 hover:text-white"
          >
            ← 하늘의 별 따기
          </a>
          <h1 className="font-bold text-lg">내 등록증</h1>
          <span className="w-16" />
        </div>
        {!services ? (
          <p className="py-20 text-center text-white/60">
            하늘을 펴고 있습니다
          </p>
        ) : key ? (
          <AstronautPanel services={services} pub={key.pub} />
        ) : (
          <div className="flex flex-col items-center py-8">
            <a
              href="/stardraw/enter"
              className="sd-cta w-full max-w-xs rounded-2xl py-3 text-center font-bold text-slate-950"
            >
              우주인 등록
            </a>
          </div>
        )}
        <footer className="pt-4 text-center text-[11px] text-white/40">
          <MadeWith />
        </footer>
      </div>
    </main>
  );
}
