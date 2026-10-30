import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "지난 회차 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 지난 회차. 회차 하나는 #12, 추첨 보기는 #draw-12 */
export default function StardrawRoundsPage() {
  return <StardrawApp page="rounds" />;
}
