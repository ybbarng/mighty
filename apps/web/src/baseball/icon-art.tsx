/**
 * 숫자야구 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 깎은 줄무늬 잔디 위 내야(흙·베이스·홈플레이트),
 * 가운데 야구공, 위쪽에 볼카운트 불빛(S 노랑·B 초록·O 빨강).
 * 공통 `IconArt`가 `game === "baseball"`이면 이것을 그린다. 글꼴을 넣지 않으려고 글자는 쓰지 않는다
 */
export function BaseballIconArt({ maskable = false }: { maskable?: boolean }) {
  // 공 실밥: 왼쪽·오른쪽 곡선을 따라 짧은 금을 긋는다.
  const stitches = (side: -1 | 1) =>
    [-12, -6, 0, 6, 12].map((dy) => {
      const y = 56 + dy;
      const x = 50 + side * (9 - Math.abs(dy) * 0.25);
      return (
        <line
          key={`${side}${dy}`}
          x1={x - 2.2}
          y1={y - 1.5 * side}
          x2={x + 2.2}
          y2={y + 1.5 * side}
          stroke="#dc2626"
          strokeWidth={1.6}
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
        background: "#166534",
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
          {/* 깎은 잔디 줄무늬 */}
          {[0, 25, 50, 75].map((x) => (
            <rect
              key={x}
              x={x}
              y={0}
              width={12.5}
              height={100}
              fill="#15803d"
            />
          ))}
          {/* 내야 흙과 안쪽 잔디 */}
          <path d="M50 96 L92 56 L50 16 L8 56 Z" fill="#b45309" />
          <path d="M50 82 L77 56 L50 30 L23 56 Z" fill="#16a34a" />
          {/* 베이스와 홈플레이트 */}
          <rect
            x={84}
            y={52}
            width={8}
            height={8}
            fill="#f8fafc"
            transform="rotate(45 88 56)"
          />
          <rect
            x={46}
            y={16}
            width={8}
            height={8}
            fill="#f8fafc"
            transform="rotate(45 50 20)"
          />
          <rect
            x={8}
            y={52}
            width={8}
            height={8}
            fill="#f8fafc"
            transform="rotate(45 12 56)"
          />
          <path d="M45 86 H55 V90 L50 94 L45 90 Z" fill="#f8fafc" />
          {/* 야구공 */}
          <circle
            cx={50}
            cy={56}
            r={19}
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
          <path
            d="M39 41 Q47 56 39 71"
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.8}
          />
          <path
            d="M61 41 Q53 56 61 71"
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.8}
          />
          {stitches(-1)}
          {stitches(1)}
          {/* 볼카운트 불빛 */}
          <rect x={64} y={4} width={32} height={12} rx={4} fill="#0a0a0a" />
          <circle cx={71} cy={10} r={3.6} fill="#fcd34d" />
          <circle cx={80} cy={10} r={3.6} fill="#34d399" />
          <circle cx={89} cy={10} r={3.6} fill="#f43f5e" />
        </svg>
      </div>
    </div>
  );
}
