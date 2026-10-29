import type { Metadata, Viewport } from "next";

import { StardrawDemo } from "@/stardraw/components/StardrawDemo";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 데모 · Stardraw" },
  description:
    "하늘의 별 따기 응모부터 당첨자 확인까지 혼자 끝까지 해 보는 데모. 실제 게임과 따로 저장됩니다.",
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#070d19" };

export default function StardrawDemoPage() {
  return <StardrawDemo />;
}
