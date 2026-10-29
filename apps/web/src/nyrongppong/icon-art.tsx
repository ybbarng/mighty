import { iconMaple } from "@/hwatu/icon-cards";

/**
 * 나이롱뽕 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 녹색 담요 위에 같은 달 화투 석 장(뽕).
 * 붉은 단풍 석 장(피·청단·피)이라 한눈에 "같은 달 셋"이 보인다. 카드는 `hwatu/icon-cards`를 쓴다.
 * 다른 게임처럼 공통 `IconArt`로 옮길 수 있게 같은 모양(`maskable`)을 받는다(docs/30 9절)
 */
export function NyrongppongIconArt({
  maskable = false,
}: {
  maskable?: boolean;
}) {
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
      <div
        style={{
          display: "flex",
          width: maskable ? "78%" : "100%",
          height: maskable ? "78%" : "100%",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: "flex" }}
        >
          {iconMaple({ x: 8, y: 24, rotate: -16, scale: 0.56 }, "pi")}
          {iconMaple({ x: 58, y: 24, rotate: 16, scale: 0.56 }, "mirror")}
          {iconMaple({ x: 33, y: 18, rotate: 0, scale: 0.58 }, "blue")}
        </svg>
      </div>
    </div>
  );
}
