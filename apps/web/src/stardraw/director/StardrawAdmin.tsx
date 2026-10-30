"use client";

import { useMemo } from "react";

import { MadeWith } from "@/components/brand/MadeWith";

import { DirectorConsole } from "./DirectorConsole";
import { passkeyKeyring, remoteDirectorBackend } from "./director";

/**
 * 실제 관리 화면. 서버 주소는 빌드의 NEXT_PUBLIC_STARDRAW_API, 없으면 같은 출처 /stardraw-api
 * (연습 장부 빌드에서는 서버에 닿지 않는다는 말이 뜬다)
 */
const API = process.env.NEXT_PUBLIC_STARDRAW_API || "/stardraw-api";

export function StardrawAdmin() {
  const backend = useMemo(() => remoteDirectorBackend(API), []);
  const keyring = useMemo(() => passkeyKeyring(), []);
  return (
    <main data-game="stardraw" className="sd-night min-h-dvh pb-12 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6">
        <header className="flex flex-col gap-2">
          <a
            href="/stardraw"
            className="text-sm text-white/70 hover:text-white"
          >
            ← 하늘의 별 따기
          </a>
          <h1 className="font-black text-3xl">우주국장 관리 화면</h1>
          <p className="break-keep text-white/70">
            카노푸스 우주국장이 국장 패스키로 서명해 운영 기록을 남깁니다.
            누구나 이 화면을 열 수 있지만, 장부에 지정된 국장 열쇠의 서명만
            받습니다.{" "}
            <a href="/stardraw/demo#director" className="underline">
              데모에서 해 보기
            </a>
          </p>
        </header>
        <DirectorConsole backend={backend} keyring={keyring} />
        <footer className="pt-4 text-center text-[11px] text-white/40">
          <MadeWith />
        </footer>
      </div>
    </main>
  );
}
