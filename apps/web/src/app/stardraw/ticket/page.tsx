import type { Metadata, Viewport } from "next";

import { TicketView } from "@/stardraw/components/TicketView";

export const metadata: Metadata = {
  title: { absolute: "응모권 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 공유한 응모권(읽기 전용). 주소는 /stardraw/ticket#<회차>-<일련번호> */
export default function StardrawTicketPage() {
  return <TicketView />;
}
