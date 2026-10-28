import type { Metadata, Viewport } from "next";

import { ChessApp } from "@/chess/components/ChessApp";

export const metadata: Metadata = {
  title: { absolute: "체스 · Chess" },
  applicationName: "체스",
  appleWebApp: {
    capable: true,
    title: "체스",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 두는 웹 체스. 캐슬링·앙파상·승급까지 FIDE 규칙 그대로, 친구와 온라인 대전, PC와 휴대폰 모두.",
  keywords: ["체스", "Chess", "체크메이트", "보드게임"],
};

/** 안드로이드 위아래 막대 색. 체스 화면 바탕(#1c1917)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#1c1917" };

export default function ChessPage() {
  return <ChessApp />;
}
