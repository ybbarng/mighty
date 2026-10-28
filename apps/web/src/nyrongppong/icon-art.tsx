/**
 * 나이롱뽕 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 녹색 담요 위에 같은 달 화투 석 장(뽕).
 * 다른 게임처럼 공통 `IconArt`로 옮길 수 있게 같은 모양(`maskable`)을 받는다(docs/30 9절)
 */
export function NyrongppongIconArt({
  maskable = false,
}: {
  maskable?: boolean;
}) {
  const card = (x: number, rotate: number, key: string) => (
    <g key={key} transform={`rotate(${rotate} 50 80)`}>
      <rect
        x={x}
        y={22}
        width={30}
        height={48}
        rx={4}
        fill="#fbf5e6"
        stroke="#2b1d14"
        strokeWidth={2}
      />
      <rect x={x + 6} y={30} width={18} height={30} rx={2} fill="#c2272d" />
      <circle cx={x + 15} cy={45} r={6} fill="#f3a6b8" />
    </g>
  );
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
          {card(16, -14, "a")}
          {card(35, 0, "b")}
          {card(54, 14, "c")}
        </svg>
      </div>
    </div>
  );
}
