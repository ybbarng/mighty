import type { Metadata, Viewport } from "next";

import { AstronautView } from "@/stardraw/components/AstronautView";

export const metadata: Metadata = {
  title: { absolute: "우주인 등록증 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 내 우주인 등록증(이 기기의 것만) */
export default function StardrawIdPage() {
  return <AstronautView />;
}
