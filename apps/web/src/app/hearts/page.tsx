import type { Metadata } from "next";

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

export default function HeartsPage() {
  return <HeartsApp />;
}
