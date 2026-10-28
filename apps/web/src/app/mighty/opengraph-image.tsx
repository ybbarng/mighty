import { ImageResponse } from "next/og";

import { BRAND, SPADE_PATH } from "@/components/brand/brand";

export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: "Mighty — 대학가 카드게임 마이티",
      size,
      contentType: "image/png",
    },
  ];
}

/** 링크를 공유할 때 보이는 미리보기. 한글 글꼴을 빌드에 넣지 않으려고 글자는 영문만 쓴다 */
export default function OpenGraphImage() {
  const card = (rotate: number, x: number, spade: boolean) => (
    <div
      style={{
        position: "absolute",
        left: 600 - 110 + x,
        top: 120,
        width: 220,
        height: 308,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: spade ? "#ffffff" : BRAND.felt,
        border: `6px solid ${spade ? BRAND.gold : "#ffffff"}`,
        borderRadius: 22,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
      }}
    >
      {spade && (
        <svg viewBox="0 0 100 100" width={140} height={140} aria-hidden="true">
          <path d={SPADE_PATH} fill={BRAND.ink} />
        </svg>
      )}
    </div>
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: `radial-gradient(circle at 50% 40%, ${BRAND.felt}, ${BRAND.feltDark})`,
      }}
    >
      {card(-16, -150, false)}
      {card(16, 150, false)}
      {card(0, 0, true)}
      <div
        style={{
          position: "absolute",
          bottom: 50,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          fontSize: 76,
          fontWeight: 800,
          letterSpacing: 18,
          color: BRAND.gold,
        }}
      >
        MIGHTY
      </div>
    </div>,
    size,
  );
}
