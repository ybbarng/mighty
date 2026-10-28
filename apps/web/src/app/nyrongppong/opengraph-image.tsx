import { ImageResponse } from "next/og";

import { SHARE_SIZE } from "@/components/brand/game-share-image";
import { NyrongppongIconArt } from "@/nyrongppong/icon-art";

export const dynamic = "force-static";

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: "Nairong-ppong — 나이롱뽕",
      size: SHARE_SIZE,
      contentType: "image/png",
    },
  ];
}

/**
 * 나이롱뽕 링크를 공유할 때 보이는 미리보기. 공통 `gameShareImage`와 같은 모양이다
 * (그 함수는 공통 `IconArt`의 게임만 받아, 아이콘을 옮기기 전까지 여기서 그린다)
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
        background: "radial-gradient(circle at 50% 30%, #14532d, #052e16)",
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
        <NyrongppongIconArt />
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
        NAIRONG-PPONG
      </div>
    </div>,
    SHARE_SIZE,
  );
}
