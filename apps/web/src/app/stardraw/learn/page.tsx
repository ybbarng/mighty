import type { Metadata, Viewport } from "next";

import { StardrawLearn } from "@/stardraw/learn/StardrawLearn";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 보안 배우기 · Stardraw" },
  description:
    "서명, 패스키, 작업 증명, 머클 나무, 시각 인증, drand, 해시 사슬, 별 세 개를 직접 눌러 보고 공격해 보며 배운다.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

export default function Page() {
  return <StardrawLearn />;
}
