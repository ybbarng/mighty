import type { Metadata, Viewport } from "next";

import { OmokApp } from "@/omok/components/OmokApp";

export const metadata: Metadata = {
  title: { absolute: "오목 · Gomoku" },
  applicationName: "오목",
  appleWebApp: {
    capable: true,
    title: "오목",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 두는 웹 오목. 일반·자유·렌주 규칙, PC와 휴대폰 모두.",
  keywords: ["오목", "Gomoku", "렌주", "3·3 금지", "보드게임"],
};

/** 안드로이드 위아래 막대 색. 오목 화면 바탕(#1c1917)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#1c1917" };

export default function OmokPage() {
  return <OmokApp />;
}
