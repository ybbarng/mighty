import { ImageResponse } from "next/og";

import { SHARE_SIZE } from "@/components/brand/game-share-image";
import { GostopIconArt } from "@/gostop/components/GostopIcon";

export const dynamic = "force-static";

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: "Go-Stop — 고스톱",
      size: SHARE_SIZE,
      contentType: "image/png",
    },
  ];
}

/**
 * 고스톱 링크를 공유할 때 보이는 미리보기(공통 `gameShareImage`와 같은 모양).
 * 아이콘이 `IconArt`에 들어가면 `gameShareImage({ game: "gostop", … })`로 바꾼다(docs/28 7절)
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
        background: "radial-gradient(circle at 50% 30%, #166534, #0a3622)",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 350,
          height: 350,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          borderRadius: 63,
        }}
      >
        <GostopIconArt />
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: 16,
          color: "#ffffff",
        }}
      >
        GO-STOP
      </div>
    </div>,
    SHARE_SIZE,
  );
}
