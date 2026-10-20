import type { MetadataRoute } from "next";

import { BRAND } from "@/components/brand/brand";

export const dynamic = "force-static";

/** 홈 화면에 추가했을 때의 이름·아이콘·첫 화면 색 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} (${BRAND.englishName})`,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND.feltDark,
    theme_color: BRAND.feltDark,
    categories: ["games"],
    icons: [
      { src: "/icon/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon/512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon/maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
