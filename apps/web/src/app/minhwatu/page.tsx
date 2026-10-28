import type { Metadata, Viewport } from "next";

import { MinhwatuApp } from "@/minhwatu/components/MinhwatuApp";

export const metadata: Metadata = {
  title: { absolute: "민화투 · Minhwatu" },
  applicationName: "민화투",
  appleWebApp: {
    capable: true,
    title: "민화투",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 치는 웹 민화투. 같은 달 짝 맞추기, 초약·풍약·비약·홍단·청단, 친구와 온라인 대전, PC와 휴대폰 모두.",
  keywords: ["민화투", "Minhwatu", "화투", "풍약", "홍단", "카드게임"],
};

/** 안드로이드 위아래 막대 색. 민화투 화면 바탕(#052e16)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#052e16" };

export default function MinhwatuPage() {
  return <MinhwatuApp />;
}
