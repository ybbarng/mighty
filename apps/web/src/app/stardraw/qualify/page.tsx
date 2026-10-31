import type { Metadata, Viewport } from "next";

import { QualifyView } from "@/stardraw/components/QualifyView";

export const metadata: Metadata = {
  title: { absolute: "소속 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 상품 자격 받기·백업·불러오기(docs/36 11-13) */
export default function StardrawQualifyPage() {
  return <QualifyView />;
}
