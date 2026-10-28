import { ImageResponse } from "next/og";

import { SITE } from "@/components/brand/brand";

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

/** 판 위 격자 줄의 자리(판 안쪽 좌표) */
const GRID = [43.75, 131.25, 218.75, 306.25];

/**
 * 게임 센터 링크를 공유할 때 보이는 미리보기. 아이콘처럼 나무 판 위 돌 셋.
 * 한글 글꼴을 빌드에 넣지 않으려고 글자는 영문만 쓴다.
 */
export default function OpenGraphImage() {
  const stone = (x: number, y: number, black: boolean) => (
    <div
      style={{
        position: "absolute",
        left: x - 38,
        top: y - 38,
        width: 76,
        height: 76,
        borderRadius: 38,
        background: black ? "#111111" : "#ffffff",
        border: black ? "none" : "5px solid #111111",
        boxShadow: "0 8px 18px rgba(0,0,0,0.45)",
      }}
    />
  );
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
          position: "relative",
          display: "flex",
          width: 350,
          height: 350,
          background: SITE.board,
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
      >
        {GRID.map((p) => (
          <div
            key={`v${p}`}
            style={{
              position: "absolute",
              left: p - 3,
              top: 0,
              width: 6,
              height: 350,
              background: SITE.ink,
            }}
          />
        ))}
        {GRID.map((p) => (
          <div
            key={`h${p}`}
            style={{
              position: "absolute",
              top: p - 3,
              left: 0,
              height: 6,
              width: 350,
              background: SITE.ink,
            }}
          />
        ))}
        {stone(131.25, 131.25, true)}
        {stone(218.75, 131.25, false)}
        {stone(218.75, 218.75, true)}
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
