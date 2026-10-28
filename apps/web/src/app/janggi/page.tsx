import type { Metadata, Viewport } from "next";

import { JanggiApp } from "@/janggi/components/JanggiApp";

export const metadata: Metadata = {
  title: { absolute: "장기 · Janggi" },
  applicationName: "장기",
  appleWebApp: {
    capable: true,
    title: "장기",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 두는 웹 장기. 상차림·빅장 규칙, 친구와 온라인 대전, PC와 휴대폰 모두.",
  keywords: ["장기", "Janggi", "한국 장기", "외통", "보드게임"],
};

/** 안드로이드 위아래 막대 색. 장기 화면 바탕(#1c1917)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#1c1917" };

export default function JanggiPage() {
  return <JanggiApp />;
}
