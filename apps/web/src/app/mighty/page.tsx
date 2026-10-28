import type { Metadata, Viewport } from "next";

import { BRAND } from "@/components/brand/brand";
import { MightyApp } from "@/components/MightyApp";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} · ${BRAND.englishName}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  keywords: [
    "마이티",
    "Mighty",
    "카드게임",
    "트릭테이킹",
    "기루다",
    "Mighty Network",
  ],
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: `${BRAND.name} · ${BRAND.englishName}`,
    description: BRAND.description,
  },
};

/** 안드로이드 위아래 막대 색. 마이티 화면 가장자리 색과 맞춘다 */
export const viewport: Viewport = { themeColor: BRAND.feltDark };

export default function MightyPage() {
  return <MightyApp />;
}
