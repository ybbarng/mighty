import { ImageResponse } from "next/og";

import { IconArt } from "@/components/brand/icon-art";

export const dynamic = "force-static";

/** 게임 센터의 브라우저 탭과 홈 화면 아이콘. 안드로이드 manifest용 크기와 잘라 쓰는(maskable) 아이콘을 함께 만든다 */
export function generateImageMetadata() {
  return [
    { id: "32.png", size: { width: 32, height: 32 }, contentType: "image/png" },
    {
      id: "192.png",
      size: { width: 192, height: 192 },
      contentType: "image/png",
    },
    {
      id: "512.png",
      size: { width: 512, height: 512 },
      contentType: "image/png",
    },
    {
      id: "maskable.png",
      size: { width: 512, height: 512 },
      contentType: "image/png",
    },
  ];
}

const SIZES: Record<string, number> = {
  "32.png": 32,
  "192.png": 192,
  "512.png": 512,
  "maskable.png": 512,
};

export default async function Icon({ id }: { id: Promise<string> }) {
  const key = await id;
  const size = SIZES[key] ?? 192;
  return new ImageResponse(
    <IconArt game="center" maskable={key === "maskable.png"} />,
    {
      width: size,
      height: size,
    },
  );
}
