import type { Metadata, Viewport } from "next";

import { NyrongppongApp } from "@/nyrongppong/components/NyrongppongApp";

export const metadata: Metadata = {
  title: { absolute: "나이롱뽕 · Nairong-ppong" },
  applicationName: "나이롱뽕",
  appleWebApp: {
    capable: true,
    title: "나이롱뽕",
    statusBarStyle: "black-translucent",
  },
  description:
    "화투로 하는 나이롱뽕. 컴퓨터(입문·중수·고수)와 하거나 친구와 온라인으로. 뽕·스톱·약, PC와 휴대폰 모두.",
  keywords: ["나이롱뽕", "화투", "뽕", "Nairong-ppong", "카드게임"],
};

/** 안드로이드 위아래 막대 색. 나이롱뽕 화면 바탕(짙은 녹색)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#052e16" };

export default function NyrongppongPage() {
  return <NyrongppongApp />;
}
