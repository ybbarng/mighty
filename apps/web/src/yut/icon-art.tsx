/**
 * 윷놀이 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 짚 멍석 위에 비스듬히 놓인 윷가락 넷.
 * 둘은 평평한 면(배, 밝은 나무에 × 무늬), 둘은 둥근 면(등, 짙은 나무)이 위다. 걸 모양(배 셋)이 아니라
 * 개(배 둘)라 한눈에 앞뒷면이 섞인 것이 보인다.
 * 공통 `IconArt`가 `game === "yut"`이면 이것을 그린다. 글꼴을 넣지 않으려고 글자는 쓰지 않는다
 */
export function YutIconArt({ maskable = false }: { maskable?: boolean }) {
  // 가락 하나: 가운데(cx, cy), 기울기(deg), 앞면(flat)인가
  const stick = (cx: number, cy: number, deg: number, flat: boolean) => {
    const w = 15;
    const h = 72;
    const x = cx - w / 2;
    const y = cy - h / 2;
    return (
      <g key={`${cx}${cy}`} transform={`rotate(${deg} ${cx} ${cy})`}>
        {/* 그림자 */}
        <rect
          x={x + 2}
          y={y + 3}
          width={w}
          height={h}
          rx={7}
          fill="#000000"
          opacity={0.28}
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={7}
          fill={flat ? "#f3dcae" : "#a16207"}
          stroke={flat ? "#c08a43" : "#713f12"}
          strokeWidth={1.4}
        />
        {flat ? (
          // 배: × 무늬 셋
          [-20, 0, 20].map((dy) => (
            <g key={dy}>
              <line
                x1={cx - 4}
                y1={cy + dy - 4}
                x2={cx + 4}
                y2={cy + dy + 4}
                stroke="#7c2d12"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <line
                x1={cx + 4}
                y1={cy + dy - 4}
                x2={cx - 4}
                y2={cy + dy + 4}
                stroke="#7c2d12"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>
          ))
        ) : (
          // 등: 둥근 면에 비친 빛
          <rect
            x={x + 3.5}
            y={y + 6}
            width={3.5}
            height={h - 12}
            rx={1.75}
            fill="#facc15"
            opacity={0.45}
          />
        )}
      </g>
    );
  };
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#9a3412",
        borderRadius: maskable ? 0 : "18%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          width: maskable ? "80%" : "100%",
          height: maskable ? "80%" : "100%",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: "flex" }}
        >
          {/* 짚 멍석: 둥근 판과 엮은 결 */}
          <circle cx={50} cy={52} r={44} fill="#c2410c" />
          <circle
            cx={50}
            cy={52}
            r={44}
            fill="none"
            stroke="#7c2d12"
            strokeWidth={2}
          />
          {[-30, -18, -6, 6, 18, 30].map((dy) => (
            <line
              key={dy}
              x1={12}
              y1={52 + dy}
              x2={88}
              y2={52 + dy}
              stroke="#9a3412"
              strokeWidth={1.2}
              opacity={0.55}
            />
          ))}
          {stick(30, 50, -24, true)}
          {stick(45, 54, -8, false)}
          {stick(58, 50, 9, true)}
          {stick(72, 54, 24, false)}
        </svg>
      </div>
    </div>
  );
}
