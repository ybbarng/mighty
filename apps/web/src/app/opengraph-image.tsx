import { ImageResponse } from "next/og";

import { SITE } from "@/components/brand/brand";
import { IconArt } from "@/components/brand/icon-art";

export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: `${SITE.englishName} — ${SITE.name}`,
      size,
      contentType: "image/png",
    },
  ];
}

/**
 * 게임 센터 링크를 공유할 때 보이는 미리보기. 아이콘과 같은 컨트롤러 그림과 주소.
 * 한글 글꼴을 빌드에 넣지 않으려고 글자는 영문만 쓴다.
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
        background: `radial-gradient(circle at 50% 30%, #1e293b, ${SITE.bg})`,
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
        <IconArt game="center" />
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: 16,
          color: "#ffffff",
        }}
      >
        GAME.BYB.KR
      </div>
    </div>,
    size,
  );
}
