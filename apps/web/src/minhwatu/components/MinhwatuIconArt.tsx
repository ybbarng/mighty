/**
 * 민화투 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 짙은 초록 바탕에 화투 두 장(붉은 광 표시와 달 숫자).
 * 합칠 때 공통 `IconArt`의 `game="minhwatu"`로 옮긴다(docs/29 9절).
 * `maskable`이면 안드로이드가 잘라 쓰는 안전 영역(가운데 80%) 안에 들어가게 줄인다
 */
export function MinhwatuIconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#14532d",
        borderRadius: maskable ? 0 : "18%",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={maskable ? "78%" : "100%"}
        height={maskable ? "78%" : "100%"}
        aria-hidden="true"
      >
        <g transform="rotate(-12 38 52)">
          <rect x="18" y="20" width="38" height="60" rx="5" fill="#b91c1c" />
          <rect
            x="22"
            y="24"
            width="30"
            height="52"
            rx="3"
            fill="none"
            stroke="#e8b04a"
            strokeWidth="2"
          />
        </g>
        <g transform="rotate(10 62 50)">
          <rect x="42" y="18" width="40" height="64" rx="5" fill="#fbf6ea" />
          <circle cx="62" cy="46" r="13" fill="#dc2626" />
          <rect x="48" y="62" width="28" height="9" rx="2" fill="#16a34a" />
          <circle cx="74" cy="27" r="6" fill="#b91c1c" />
        </g>
      </svg>
    </div>
  );
}
