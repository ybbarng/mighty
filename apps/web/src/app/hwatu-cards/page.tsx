import type { Metadata } from "next";

import { HwatuGallery } from "@/hwatu/components/HwatuGallery";

export const metadata: Metadata = {
  title: { absolute: "화투 카드 모음" },
  robots: { index: false },
};

/** 화투 48장과 공통 화면 조각을 한눈에 보는 화면(만들 때 확인용, 게임 목록에는 없다) */
export default function HwatuCardsPage() {
  return <HwatuGallery />;
}
