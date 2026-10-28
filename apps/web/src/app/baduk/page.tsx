import type { Metadata, Viewport } from "next";

import { BadukApp } from "@/baduk/components/BadukApp";

export const metadata: Metadata = {
  title: { absolute: "바둑 · Baduk" },
  applicationName: "바둑",
  appleWebApp: {
    capable: true,
    title: "바둑",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 두는 웹 바둑. 9·13·19줄, 친구와 온라인 대전, PC와 휴대폰 모두.",
  keywords: ["바둑", "Baduk", "Go", "위기", "보드게임"],
};

/** 안드로이드 위아래 막대 색. 바둑 화면 바탕(#1c1917)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#1c1917" };

export default function BadukPage() {
  return <BadukApp />;
}
