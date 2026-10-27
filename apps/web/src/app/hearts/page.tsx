import type { Metadata, Viewport } from "next";

import { HeartsApp } from "@/hearts/components/HeartsApp";

export const metadata: Metadata = {
  // 공통 제목 틀("… · 마이티")을 쓰지 않는다. 하트 화면에서는 마이티라는 말을 드러내지 않는다
  title: { absolute: "하트 · Hearts" },
  applicationName: "하트",
  appleWebApp: {
    capable: true,
    title: "하트",
    statusBarStyle: "black-translucent",
  },
  description:
    "마이티 안에 숨은 하트. 윈도우 하트 규칙으로 컴퓨터나 친구와 한다.",
  // 숨은 게임이라 검색에 드러내지 않는다.
  robots: { index: false },
};

/** 안드로이드 위아래 막대 색. 하트 화면 가장자리 색(#3b0a0a)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#3b0a0a" };

export default function HeartsPage() {
  // data-game으로 문서 바탕색도 하트 색으로 바꾼다(globals.css).
  return (
    <div data-game="hearts" className="contents">
      <HeartsApp />
    </div>
  );
}
