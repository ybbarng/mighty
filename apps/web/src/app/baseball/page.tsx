import type { Metadata, Viewport } from "next";

import { BaseballApp } from "@/baseball/components/BaseballApp";

export const metadata: Metadata = {
  title: { absolute: "숫자야구 · Number Baseball" },
  applicationName: "숫자야구",
  appleWebApp: {
    capable: true,
    title: "숫자야구",
    statusBarStyle: "black-translucent",
  },
  description:
    "숨긴 세 자리 수를 스트라이크·볼로 맞히는 웹 숫자야구. 컴퓨터(입문·중수·고수)와, 친구와는 서버 없이. 비밀 수는 각자 기기에만.",
  keywords: ["숫자야구", "Number Baseball", "Bulls and Cows", "추리 게임"],
};

/** 안드로이드 위아래 막대 색. 숫자야구 화면 바탕(#052e16)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#052e16" };

export default function BaseballPage() {
  return <BaseballApp />;
}
