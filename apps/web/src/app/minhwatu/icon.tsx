import { ImageResponse } from "next/og";

import { MinhwatuIconArt } from "@/minhwatu/components/MinhwatuIconArt";

export const dynamic = "force-static";

/** 민화투 화면의 브라우저 탭 아이콘. 홈 화면 앱(manifest)은 사이트 하나라 게임 센터 아이콘을 쓴다 */
export function generateImageMetadata() {
  return [
    { id: "32.png", size: { width: 32, height: 32 }, contentType: "image/png" },
    {
      id: "192.png",
      size: { width: 192, height: 192 },
      contentType: "image/png",
    },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = (await id) === "32.png" ? 32 : 192;
  return new ImageResponse(<MinhwatuIconArt />, {
    width: size,
    height: size,
  });
}
