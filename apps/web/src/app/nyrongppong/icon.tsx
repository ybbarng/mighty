import { ImageResponse } from "next/og";

import { NyrongppongIconArt } from "@/nyrongppong/icon-art";

export const dynamic = "force-static";

/** 나이롱뽕 화면의 브라우저 탭 아이콘 */
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
  return new ImageResponse(<NyrongppongIconArt />, {
    width: size,
    height: size,
  });
}
