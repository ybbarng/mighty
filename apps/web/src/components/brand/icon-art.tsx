import { BRAND, SPADE_PATH } from "./brand";

/**
 * 앱 아이콘 그림(`next/og` ImageResponse용 JSX). 초록 판 위에 기울어진 ♠A 카드 한 장.
 * `maskable`이면 안드로이드가 잘라 쓰는 안전 영역(가운데 80%) 안에 들어가게 작게 그리고 모서리를 둥글리지 않는다.
 */
export function IconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at 50% 35%, ${BRAND.felt}, ${BRAND.feltDark})`,
        borderRadius: maskable ? 0 : "22%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: maskable ? "40%" : "50%",
          height: maskable ? "56%" : "70%",
          background: "#ffffff",
          borderRadius: "10%",
          border: `4px solid ${BRAND.gold}`,
          transform: "rotate(-8deg)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <svg viewBox="0 0 100 100" width="72%" height="72%" aria-hidden="true">
          <path d={SPADE_PATH} fill={BRAND.ink} />
        </svg>
      </div>
    </div>
  );
}
