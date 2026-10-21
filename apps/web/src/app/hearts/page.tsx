import type { Metadata } from "next";

import { HeartsApp } from "@/hearts/components/HeartsApp";

export const metadata: Metadata = {
  title: "하트 · Hearts",
  description:
    "마이티 안에 숨은 하트. 윈도우 하트 규칙으로 컴퓨터나 친구와 한다.",
  // 숨은 게임이라 검색에 드러내지 않는다.
  robots: { index: false },
};

export default function HeartsPage() {
  return <HeartsApp />;
}
