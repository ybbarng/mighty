import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "관측 기록 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 관측 기록: 공개 장부만으로 계산한 통계 */
export default function StardrawStatsPage() {
  return <StardrawApp page="stats" />;
}
