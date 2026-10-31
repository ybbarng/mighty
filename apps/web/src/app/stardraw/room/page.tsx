import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { RoomShortcut } from "@/stardraw/components/RoomShortcut";

export const metadata: Metadata = {
  title: { absolute: "회차 방 · 하늘의 별 따기" },
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/**
 * 로컬 데모 전용 바로가기: 응모나 카드를 거치지 않고 다음 추첨(또는 지금 추첨 중인) 회차 방으로 간다.
 * `NEXT_PUBLIC_STARDRAW_ROOM_SHORTCUT=1`로 빌드할 때만 켜진다. 운영 빌드(CI·이미지)에는 이 값이 없어 없는 주소다
 */
export default function StardrawRoomShortcutPage() {
  if (process.env.NEXT_PUBLIC_STARDRAW_ROOM_SHORTCUT !== "1") notFound();
  return <RoomShortcut />;
}
