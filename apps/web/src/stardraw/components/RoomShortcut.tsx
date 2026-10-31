"use client";

import { useEffect } from "react";

import { useLedger } from "../services";
import { nextRoomRound, ROOM_FOLLOW_KEY } from "./RoomView";

/**
 * 로컬 데모 바로가기(/stardraw/room): 장부를 받으면 다음 추첨 회차 방으로 옮기고, 그 방의 추첨이 끝나면 다음 회차 방으로
 * 따라가게 표시한다
 */
export function RoomShortcut() {
  const { services, status } = useLedger();
  useEffect(() => {
    if (!services || !status) return;
    const round = nextRoomRound(services, status.now * 1000);
    if (round === null) return;
    try {
      sessionStorage.setItem(ROOM_FOLLOW_KEY, "1");
    } catch {
      // 따라가기 없이 그 방만
    }
    window.location.replace(`/stardraw/rounds#draw-${round}`);
  }, [services, status]);
  return (
    <main className="sd-night grid min-h-dvh place-items-center text-white/60">
      하늘을 펴고 있습니다
    </main>
  );
}
