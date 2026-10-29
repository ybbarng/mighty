/**
 * 숫자야구 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 밤 야구장 잔디 위 야구공과 볼카운트 불빛.
 * 공통 `IconArt`가 `game === "baseball"`이면 이것을 그린다. 글꼴을 넣지 않으려고 글자는 쓰지 않는다
 */
export function BaseballIconArt({ maskable = false }: { maskable?: boolean }) {
  // 공 실밥: 왼쪽·오른쪽 곡선을 따라 짧은 금을 긋는다.
  const stitches = (side: -1 | 1) =>
    [-18, -9, 0, 9, 18].map((dy) => {
      const y = 46 + dy;
      const x = 46 + side * (14 - Math.abs(dy) * 0.28);
      return (
        <line
          key={`${side}${dy}`}
          x1={x - 3}
          y1={y - 2 * side}
          x2={x + 3}
          y2={y + 2 * side}
          stroke="#dc2626"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      );
    });
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
          <circle
            cx={46}
            cy={46}
            r={30}
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth={2}
          />
          <path
            d="M 30 22 Q 42 46 30 70"
            fill="none"
            stroke="#dc2626"
            strokeWidth={2.4}
          />
          <path
            d="M 62 22 Q 50 46 62 70"
            fill="none"
            stroke="#dc2626"
            strokeWidth={2.4}
          />
          {stitches(-1)}
          {stitches(1)}
          <circle cx={84} cy={70} r={6} fill="#fcd34d" />
          <circle cx={84} cy={84} r={6} fill="#34d399" />
          <circle cx={70} cy={88} r={6} fill="#f43f5e" />
        </svg>
      </div>
    </div>
  );
}
