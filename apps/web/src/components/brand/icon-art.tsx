import { SPADE_PATH } from "./brand";

const INK = "#111111";
const PAPER = "#ffffff";

/**
 * 원작 Mighty Network의 아이콘(32×32 흑백 픽셀, res/Mighty.ico)을 고화질로 다시 그린 것.
 * ♠A 카드의 왼쪽 위 모서리를 크게 본 구도다: 위·왼쪽 테두리, 세리프 "A", 작은 ♠,
 * 오른쪽 아래로 잘려 보이는 큰 ♠의 어깨와 그 안의 마름모 장식.
 */
function MightyCorner() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <defs>
        {/* 큰 ♠의 보이는 부분: 오른쪽 위 꼭짓점에서 왼쪽 아래로 흘러내리는 어깨 */}
        <clipPath id="big-spade">
          <path d="M91 27 C83 40 60 58 47 70 C40 77 35 88 32 100 L100 100 L100 35 C96 32 93 30 91 27 Z" />
        </clipPath>
        <clipPath id="big-spade-inner">
          <path d="M92 37 C86 47 67 63 56 73 C50 79 46 89 44 100 L100 100 L100 44 C97 42 94 40 92 37 Z" />
        </clipPath>
      </defs>

      <rect width="100" height="100" fill={PAPER} />
      {/* 카드 테두리: 위와 왼쪽, 모서리는 둥글게 */}
      <path
        d="M3 100 L3 14 Q3 3 14 3 L100 3"
        fill="none"
        stroke={INK}
        strokeWidth="4.5"
      />

      {/* 세리프 A */}
      <path
        d="M23.5 7 L37 37 L41 37 L41 42 L30 42 L30 37 L32.5 37 L30.6 32.5 L16.4 32.5 L14.5 37 L17 37 L17 42 L6 42 L6 37 L10 37 Z M18.4 27.5 L28.6 27.5 L23.5 15.5 Z"
        fill={INK}
        fillRule="evenodd"
      />

      {/* 작은 ♠ */}
      <path d={SPADE_PATH} transform="translate(6 53) scale(0.3)" fill={INK} />

      {/* 큰 ♠: 검은 어깨, 안쪽 흰 줄, 그 안의 마름모 장식 */}
      <g clipPath="url(#big-spade)">
        <rect width="100" height="100" fill={INK} />
      </g>
      <path
        d="M92 32 C85 44 64 61 52 72 C45 78 41 88 38 100"
        fill="none"
        stroke={PAPER}
        strokeWidth="2.6"
      />
      <g clipPath="url(#big-spade-inner)">
        {Array.from({ length: 14 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 장식 줄은 순서가 곧 정체다
          <g key={i}>
            <line
              x1={20 + i * 8}
              y1="30"
              x2={-50 + i * 8}
              y2="100"
              stroke={PAPER}
              strokeWidth="1.8"
            />
            <line
              x1={-30 + i * 8}
              y1="30"
              x2={40 + i * 8}
              y2="100"
              stroke={PAPER}
              strokeWidth="1.8"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * 앱 아이콘 그림(`next/og` ImageResponse용 JSX).
 * `maskable`이면 안드로이드가 잘라 쓰는 안전 영역(가운데 80%) 안에 들어가게 줄인다.
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
        background: PAPER,
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
        <MightyCorner />
      </div>
    </div>
  );
}
