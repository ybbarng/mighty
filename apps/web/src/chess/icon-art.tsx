/**
 * 체스 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 체스판 모서리 위에 폰 하나.
 * 글꼴에 체스 기호가 없어도 그려지게 도형으로만 그린다.
 * 공통 `IconArt`(components/brand/icon-art.tsx)에 `game="chess"`로 옮겨 넣을 수 있게 같은 틀을 쓴다.
 * `maskable`이면 안드로이드가 잘라 쓰는 안전 영역(가운데 80%) 안에 들어가게 줄인다.
 */
export function ChessPawnArt() {
  const squares: { x: number; y: number }[] = [];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) if ((x + y) % 2 === 1) squares.push({ x, y });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" fill="#f0d9b5" />
      {squares.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x * 25}
          y={y * 25}
          width="25"
          height="25"
          fill="#b58863"
        />
      ))}
      {/* 폰: 머리, 목, 몸통, 받침 */}
      <circle
        cx="50"
        cy="30"
        r="11"
        fill="#1c1917"
        stroke="#fffdf7"
        strokeWidth="2.5"
      />
      <path
        d="M41 44 L59 44 L56 50 L62 72 L38 72 L44 50 Z"
        fill="#1c1917"
        stroke="#fffdf7"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect
        x="30"
        y="72"
        width="40"
        height="10"
        rx="3"
        fill="#1c1917"
        stroke="#fffdf7"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function ChessIconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#b58863",
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
        <ChessPawnArt />
      </div>
    </div>
  );
}
