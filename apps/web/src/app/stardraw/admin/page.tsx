import type { Metadata, Viewport } from "next";

import { StardrawAdmin } from "@/stardraw/director/StardrawAdmin";

export const metadata: Metadata = {
  title: { absolute: "우주국장 관리 화면 · 하늘의 별 따기" },
  description:
    "카노푸스 우주국장이 국장 패스키로 서명해 운영 기록을 남기는 화면. 모든 운영 일은 공개 장부에 3회차 예고로 남습니다.",
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 우주국장 관리 화면(docs/36 11-12). 메뉴에 없고 주소로 들어온다 */
export default function StardrawAdminPage() {
  return <StardrawAdmin />;
}
