import { ImageResponse } from "next/og";

import { GostopIconArt } from "@/gostop/components/GostopIcon";

export const dynamic = "force-static";

/** 고스톱 화면을 iOS 홈 화면에 추가할 때의 아이콘 */
export function generateImageMetadata() {
  return [
    {
      id: "180.png",
      size: { width: 180, height: 180 },
      contentType: "image/png",
    },
  ];
}

export default function AppleIcon() {
  return new ImageResponse(<GostopIconArt maskable />, {
    width: 180,
    height: 180,
  });
}
