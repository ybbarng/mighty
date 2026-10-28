import type { Metadata, Viewport } from "next";

import { GostopApp } from "@/gostop/components/GostopApp";

export const metadata: Metadata = {
  title: { absolute: "고스톱 · Go-Stop" },
  applicationName: "고스톱",
  appleWebApp: {
    capable: true,
    title: "고스톱",
    statusBarStyle: "black-translucent",
  },
  description:
    "컴퓨터(입문·중수·고수)와 치는 웹 고스톱. 맞고(2명)·3명 고스톱, 고·스톱과 박, 친구와 온라인 대전, PC와 휴대폰 모두.",
  keywords: ["고스톱", "맞고", "화투", "Go-Stop", "Hwatu"],
};

/** 안드로이드 위아래 막대 색. 고스톱 화면 바탕(#0a3622)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#0a3622" };

export default function GostopPage() {
  return <GostopApp />;
}
