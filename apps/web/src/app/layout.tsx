import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@/components/Analytics";
import { SITE } from "@/components/brand/brand";
import { LeaveConfirm } from "@/components/LeaveConfirm";
import { ServiceWorker } from "@/components/ServiceWorker";
import { StoreHydration } from "@/components/StoreHydration";

import { cardCondensed, cardSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3456",
  ),
  title: {
    default: `${SITE.name} · ${SITE.englishName}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "웹 게임",
    "친구와 온라인 게임",
    "마이티",
    "Mighty",
    "하트",
    "Hearts",
    "카드게임",
    "멘탈 포커",
  ],
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: `${SITE.name} · ${SITE.englishName}`,
    description: SITE.description,
    siteName: SITE.name,
  },
};

export const viewport: Viewport = {
  themeColor: SITE.bg,
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${cardCondensed.variable} ${cardSerif.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <StoreHydration />
        <Analytics />
        {children}
        <LeaveConfirm />
        <ServiceWorker />
      </body>
    </html>
  );
}
