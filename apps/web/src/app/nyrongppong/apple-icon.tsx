import { ImageResponse } from "next/og";

import { NyrongppongIconArt } from "@/nyrongppong/icon-art";

export const dynamic = "force-static";

/** 나이롱뽕 화면을 iOS 홈 화면에 추가할 때의 아이콘 */
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
  return new ImageResponse(<NyrongppongIconArt maskable />, {
    width: 180,
    height: 180,
  });
}
