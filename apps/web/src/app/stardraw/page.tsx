import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 · Stardraw" },
  applicationName: "하늘의 별 따기",
  appleWebApp: {
    capable: true,
    title: "하늘의 별 따기",
    statusBarStyle: "black-translucent",
  },
  description:
    "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요? 서울 하늘의 밝은 별 45개에서 6개를 고르는 정시 추첨. 운영자도 결과를 고를 수 없고, 누구나 장부를 다시 계산해 볼 수 있습니다.",
  keywords: [
    "하늘의 별 따기",
    "Stardraw",
    "로또",
    "별",
    "공정한 추첨",
    "패스키",
  ],
};

/** 안드로이드 위아래 막대 색. 밤하늘 바탕(#070d19)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#070d19" };

export default function StardrawPage() {
  return <StardrawApp />;
}
