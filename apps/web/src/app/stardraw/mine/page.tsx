import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "내 응모 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 내 응모(이력). 영수증 하나는 #t-<일련번호> */
export default function StardrawMinePage() {
  return <StardrawApp page="mine" />;
}
