import { ImageResponse } from "next/og";

import { IconArt } from "@/components/brand/icon-art";

export const dynamic = "force-static";

/** iOS 홈 화면 아이콘. 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "180.png",
      size: { width: 180, height: 180 },
      contentType: "image/png",
    },
  ];
}

/** iOS가 모서리를 직접 둥글리므로 꽉 채운 그림을 쓴다 */
export default function AppleIcon() {
  return new ImageResponse(<IconArt game="center" maskable />, {
    width: 180,
    height: 180,
  });
}
