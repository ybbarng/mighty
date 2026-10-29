import type { Metadata, Viewport } from "next";

import { YutApp } from "@/yut/components/YutApp";

export const metadata: Metadata = {
  title: { absolute: "윷놀이 · Yut" },
  applicationName: "윷놀이",
  appleWebApp: {
    capable: true,
    title: "윷놀이",
    statusBarStyle: "black-translucent",
  },
  description:
    "윷가락을 던져 말을 몰고 업고 잡는 웹 윷놀이. 컴퓨터(입문·중수·고수)와, 친구와는 서버 없이. 던지기 결과는 모두의 기기가 함께 정해 방장도 고를 수 없다.",
  keywords: ["윷놀이", "Yut", "Yunnori", "윷", "명절 놀이"],
};

/** 안드로이드 위아래 막대 색. 윷놀이 화면 바탕(#1f0d07)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#1f0d07" };

export default function YutPage() {
  return <YutApp />;
}
