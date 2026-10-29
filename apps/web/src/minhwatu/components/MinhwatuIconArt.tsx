import { iconCherryGwang, iconPlumRibbon } from "@/hwatu/icon-cards";

/**
 * 민화투 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 짙은 초록 바탕에 화투 두 장(매조 홍단, 벚꽃 광).
 * 띠와 광으로 약(띠 셋·광 셋)을 모으는 민화투를 보인다. 카드는 한국 화투 그림을 줄인 `hwatu/icon-cards`를 쓴다.
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
        {iconPlumRibbon({ x: 8, y: 14, rotate: -12, scale: 0.72 })}
        {iconCherryGwang({ x: 44, y: 16, rotate: 10, scale: 0.74 })}
      </svg>
    </div>
  );
}
