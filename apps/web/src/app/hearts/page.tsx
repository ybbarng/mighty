import type { Metadata, Viewport } from "next";

import { HeartsApp } from "@/hearts/components/HeartsApp";

export const metadata: Metadata = {
  title: { absolute: "하트 · Hearts" },
  applicationName: "하트",
  appleWebApp: {
    capable: true,
    title: "하트",
    statusBarStyle: "black-translucent",
  },
  description: "윈도우 하트 규칙으로 컴퓨터나 친구와 하는 하트.",
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
