/**
 * 하늘의 별 따기 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 밤하늘에 흐린 별자리 선과 별,
 * 가운데 노란 로또 공에 별빛 하나가 내려앉는다. 공통 `IconArt`가 `game === "stardraw"`이면 이것을 그린다.
 * 글꼴을 넣지 않으려고 글자는 쓰지 않는다
 */
export function StardrawIconArt({ maskable = false }: { maskable?: boolean }) {
  const stars: [number, number, number][] = [
    [18, 22, 1.6],
    [33, 14, 2.2],
    [52, 20, 1.4],
    [80, 16, 2.4],
    [88, 38, 1.3],
    [14, 52, 1.2],
    [86, 66, 1.6],
    [24, 84, 1.4],
    [70, 88, 1.2],
  ];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1322",
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
          <defs>
            <radialGradient id="sd-sky" cx="70%" cy="0%" r="100%">
              <stop offset="0%" stopColor="#1e3358" />
              <stop offset="100%" stopColor="#0b1322" />
            </radialGradient>
            <radialGradient id="sd-ball" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fff7d1" />
              <stop offset="40%" stopColor="#f6c343" />
              <stop offset="100%" stopColor="#b7861d" />
            </radialGradient>
            <radialGradient id="sd-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#sd-sky)" />
          {/* 흐린 별자리 선 */}
          <polyline
            points="18,22 33,14 52,20 80,16 88,38"
            fill="none"
            stroke="#94a8e0"
            strokeOpacity="0.45"
            strokeWidth="0.9"
          />
          {stars.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#e8eeff" />
          ))}
          {/* 내려앉는 별빛(유성 꼬리) */}
          <line
            x1="74"
            y1="30"
            x2="58"
            y2="46"
            stroke="#fff4c2"
            strokeOpacity="0.8"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="50" cy="58" r="30" fill="url(#sd-glow)" />
          {/* 로또 공과 그 위의 별 */}
          <circle cx="50" cy="60" r="19" fill="url(#sd-ball)" />
          <path
            d="M50 49 L53.2 56.2 L61 56.8 L55 61.8 L56.9 69.4 L50 65.3 L43.1 69.4 L45 61.8 L39 56.8 L46.8 56.2 Z"
            fill="#ffffff"
            fillOpacity="0.92"
          />
        </svg>
      </div>
    </div>
  );
}
