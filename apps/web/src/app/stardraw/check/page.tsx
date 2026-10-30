import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "당첨자 확인 · 하늘의 별 따기" },
  // 링크마다 한 번 쓰는 화면이라 검색에 올리지 않는다
  robots: { index: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 당첨자가 보낸 확인 링크(/stardraw/check#토큰). 토큰은 # 뒤라 서버 로그·Referer에 남지 않는다 */
export default function StardrawCheckPage() {
  return <StardrawApp page="check" />;
}
