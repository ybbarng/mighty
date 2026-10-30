import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "응모 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 응모(별 고르기). 화면마다 주소가 있어 뒤로가기·새로고침이 이 화면으로 돌아온다 */
export default function StardrawEnterPage() {
  return <StardrawApp page="enter" />;
}
