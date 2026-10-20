import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { BRAND } from "@/components/brand/brand";
import { ServiceWorker } from "@/components/ServiceWorker";
import { StoreHydration } from "@/components/StoreHydration";

import { cardCondensed, cardSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3456",
  ),
  title: {
    default: `${BRAND.name} · ${BRAND.englishName}`,
    template: `%s · ${BRAND.name}`,
  },
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
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: `${BRAND.name} · ${BRAND.englishName}`,
    description: BRAND.description,
    siteName: BRAND.name,
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.feltDark,
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
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
