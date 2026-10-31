"use client";

import { AgencyFooter } from "@/stardraw/components/AgencyFooter";

import { useLedger } from "../services";
import { QualifyPanel } from "./QualifyPanel";

/** /stardraw/qualify: 소속 받기(실제 장부) */
export function QualifyView() {
  const { services } = useLedger();
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
          <h1 className="font-bold text-lg">소속</h1>
          <span className="w-16" />
        </div>
        <p className="break-keep text-sm text-white/75" data-qual-about>
          소속은 카노푸스 우주국장이 우주인에게 부여하는 집단입니다. 성단과
          성운이 있고, 소속마다 정한 방법으로 확인한 우주인만 받을 수 있습니다.
          받은 소속은 응모권과 등록증에 표시됩니다.
        </p>
        {services ? (
          <QualifyPanel services={services} />
        ) : (
          <p className="py-20 text-center text-white/60">
            하늘을 펴고 있습니다
          </p>
        )}
        <footer className="flex flex-col items-center gap-2 pt-4 text-center text-[11px] text-white/40">
          <a href="/stardraw/privacy" className="hover:text-white/70">
            개인정보처리방침
          </a>
          <p>
            <AgencyFooter />
          </p>
        </footer>
      </div>
    </main>
  );
}
