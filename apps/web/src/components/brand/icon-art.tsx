import { HEART_PATH, SITE, SPADE_PATH } from "./brand";

const INK = "#111111";
const PAPER = "#ffffff";
/** 카드 그림 기본 테마의 빨강 */
const RED = "#d42a2a";

/** 카드 테두리: 위와 왼쪽, 모서리는 둥글게 */
const BORDER_PATH = "M3 100 L3 14 Q3 3 14 3 L100 3";

/** 세리프 A */
const SERIF_A_PATH =
  "M23.5 7 L37 37 L41 37 L41 42 L30 42 L30 37 L32.5 37 L30.6 32.5 L16.4 32.5 L14.5 37 L17 37 L17 42 L6 42 L6 37 L10 37 Z M18.4 27.5 L28.6 27.5 L23.5 15.5 Z";

/** 큰 무늬 안의 마름모 장식(엇갈린 흰 줄). 쓰는 쪽에서 clipPath로 자른다. satori는 svg 안의 컴포넌트를 못 그려 함수로 부른다 */
function hatchLines() {
  return Array.from({ length: 14 }, (_, i) => (
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
  ));
}

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
      <path d={BORDER_PATH} fill="none" stroke={INK} strokeWidth="4.5" />
      <path d={SERIF_A_PATH} fill={INK} fillRule="evenodd" />

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
      <g clipPath="url(#big-spade-inner)">{hatchLines()}</g>
    </svg>
  );
}

/** 100×100 무늬 경로를 `scale`배로 키워 (`dx`, `dy`)로 옮긴다. clipPath 안에서도 쓰려고 좌표를 직접 바꾼다 */
function placePath(d: string, scale: number, dx: number, dy: number): string {
  return d.replace(
    /(-?[\d.]+) (-?[\d.]+)/g,
    (_, x: string, y: string) =>
      `${(Number(x) * scale + dx).toFixed(2)} ${(Number(y) * scale + dy).toFixed(2)}`,
  );
}

/** 큰 ♥ 세 겹(겉·흰 줄·장식 안쪽). 같은 점을 중심으로 크기만 줄여 어깨가 나란하다 */
const BIG_HEART = placePath(HEART_PATH, 2, 38, 30);
const BIG_HEART_LINE = placePath(HEART_PATH, 1.86, 43.6, 35.6);
const BIG_HEART_INNER = placePath(HEART_PATH, 1.72, 49.2, 41.2);

/**
 * 하트 아이콘. 마이티 아이콘과 같은 구도로 ♥A 카드의 왼쪽 위 모서리를 크게 본 것이다:
 * 테두리, 세리프 "A", 작은 ♥, 오른쪽 아래로 잘려 보이는 큰 ♥의 둥근 왼쪽 어깨와 마름모 장식.
 */
function HeartsCorner() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <defs>
        <clipPath id="big-heart-inner">
          <path d={BIG_HEART_INNER} />
        </clipPath>
      </defs>

      <rect width="100" height="100" fill={PAPER} />
      <path d={BORDER_PATH} fill="none" stroke={RED} strokeWidth="4.5" />
      <path d={SERIF_A_PATH} fill={RED} fillRule="evenodd" />
      <path d={HEART_PATH} transform="translate(6 53) scale(0.3)" fill={RED} />

      <path d={BIG_HEART} fill={RED} />
      <path d={BIG_HEART_LINE} fill="none" stroke={PAPER} strokeWidth="2.6" />
      <g clipPath="url(#big-heart-inner)">{hatchLines()}</g>
    </svg>
  );
}

/** 컨트롤러 몸통(100×100 상자): 가운데가 넓고 아래로 손잡이 둘이 내려온다 */
const PAD_BODY =
  "M30 25 H70 C82 25 88 31 91 43 L95.5 65 C97.5 77 92.5 84 85.5 84 C79.5 84 76.5 80 73 75.5 L70 71.5 H30 L27 75.5 C23.5 80 20.5 84 14.5 84 C7.5 84 2.5 77 4.5 65 L9 43 C12 31 18 25 30 25 Z";
/** 오른쪽 단추 넷(위·오른쪽·아래·왼쪽)과 색 */
const PAD_BUTTONS = [
  [73, 38, "#f59e0b"],
  [81.5, 46.5, "#ef4444"],
  [73, 55, "#22c55e"],
  [64.5, 46.5, "#3b82f6"],
] as const;
const PAD_DARK = "#0f172a";

/**
 * 게임 센터 아이콘. 요즘 게임기 컨트롤러: 왼쪽 십자 단추, 오른쪽 색 단추 넷, 아래 막대 둘.
 * 카드·판 어느 한 게임에 치우치지 않고 "게임 모음"을 떠올리게 한다.
 */
function CenterPad() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <rect width="100" height="100" fill={SITE.bg} />
      <path
        d={PAD_BODY}
        fill="#000000"
        opacity="0.45"
        transform="translate(0 3)"
      />
      <path d={PAD_BODY} fill="#e2e8f0" />
      <path
        d="M30 25 H70 C82 25 88 31 91 43 L91.6 46 H8.4 L9 43 C12 31 18 25 30 25 Z"
        fill={PAPER}
      />
      <rect x="22" y="40" width="7" height="19" rx="1.6" fill={PAD_DARK} />
      <rect x="16" y="46" width="19" height="7" rx="1.6" fill={PAD_DARK} />
      {PAD_BUTTONS.map(([x, y, color]) => (
        <circle key={color} cx={x} cy={y} r="4.6" fill={color} />
      ))}
      <rect x="41" y="38" width="6" height="2.6" rx="1.3" fill="#94a3b8" />
      <rect x="53" y="38" width="6" height="2.6" rx="1.3" fill="#94a3b8" />
      {[38, 62].map((x) => (
        <g key={x}>
          <circle cx={x} cy="60" r="7.6" fill="#94a3b8" />
          <circle cx={x} cy="60" r="5.4" fill={PAD_DARK} />
        </g>
      ))}
    </svg>
  );
}

/** 오목 아이콘의 격자 줄 자리 */
const OMOK_GRID = [10, 26, 42, 58, 74, 90];
/** 오목 아이콘의 흑돌 다섯(왼쪽 아래에서 오른쪽 위로 잇는 대각선) */
const OMOK_FIVE = [0, 1, 2, 3, 4].map(
  (k) => [10 + k * 16, 90 - k * 16] as const,
);

/** 오목 아이콘. 판 위 대각선으로 이은 흑돌 다섯과 이긴 줄, 막다 만 백돌 둘 */
function OmokFive() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <rect width="100" height="100" fill={SITE.board} />
      {OMOK_GRID.map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1="0"
            x2={p}
            y2="100"
            stroke={SITE.ink}
            strokeWidth="1.8"
          />
          <line
            x1="0"
            y1={p}
            x2="100"
            y2={p}
            stroke={SITE.ink}
            strokeWidth="1.8"
          />
        </g>
      ))}
      {OMOK_FIVE.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="7.4" fill={INK} />
      ))}
      <circle
        cx="74"
        cy="58"
        r="6.6"
        fill={PAPER}
        stroke={INK}
        strokeWidth="1.8"
      />
      <circle
        cx="42"
        cy="26"
        r="6.6"
        fill={PAPER}
        stroke={INK}
        strokeWidth="1.8"
      />
      <line
        x1="10"
        y1="90"
        x2="74"
        y2="26"
        stroke={RED}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 장기 아이콘의 팔각형 말(반지름 r) */
function octagonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/**
 * 장기 아이콘. 대각선이 그려진 궁성 위에 초(초록)·한(빨강) 말 둘.
 * 아이콘을 만들 때 한글 글꼴이 없어 글자 대신 테두리 색과 안쪽 고리로 편을 보인다
 */
function JanggiPalace() {
  const lines = [10, 50, 90];
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <rect width="100" height="100" fill={SITE.board} />
      {lines.map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1="0"
            x2={p}
            y2="100"
            stroke={SITE.ink}
            strokeWidth="2.2"
          />
          <line
            x1="0"
            y1={p}
            x2="100"
            y2={p}
            stroke={SITE.ink}
            strokeWidth="2.2"
          />
        </g>
      ))}
      <line
        x1="10"
        y1="10"
        x2="90"
        y2="90"
        stroke={SITE.ink}
        strokeWidth="2.2"
      />
      <line
        x1="90"
        y1="10"
        x2="10"
        y2="90"
        stroke={SITE.ink}
        strokeWidth="2.2"
      />
      <polygon
        points={octagonPoints(68, 34, 21)}
        fill="#000000"
        opacity="0.3"
      />
      <polygon
        points={octagonPoints(66, 31, 21)}
        fill="#f1e2c0"
        stroke="#b91c1c"
        strokeWidth="3.4"
      />
      <polygon
        points={octagonPoints(66, 31, 12)}
        fill="none"
        stroke="#b91c1c"
        strokeWidth="2.6"
      />
      <polygon
        points={octagonPoints(38, 66, 26)}
        fill="#000000"
        opacity="0.35"
      />
      <polygon
        points={octagonPoints(35, 62, 26)}
        fill="#f1e2c0"
        stroke="#0f6b3a"
        strokeWidth="3.8"
      />
      <polygon
        points={octagonPoints(35, 62, 15)}
        fill="none"
        stroke="#0f6b3a"
        strokeWidth="3"
      />
    </svg>
  );
}

/**
 * 앱 아이콘 그림(`next/og` ImageResponse용 JSX). `game`이 "hearts"면 하트, "omok"이면 오목, "janggi"면 장기, "center"면 게임 센터 아이콘을 그린다.
 * `maskable`이면 안드로이드가 잘라 쓰는 안전 영역(가운데 80%) 안에 들어가게 줄인다.
 */
export function IconArt({
  maskable = false,
  game = "mighty",
}: {
  maskable?: boolean;
  game?: "mighty" | "hearts" | "omok" | "janggi" | "center";
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          game === "center"
            ? SITE.bg
            : game === "omok" || game === "janggi"
              ? SITE.board
              : PAPER,
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
        {game === "omok" ? (
          <OmokFive />
        ) : game === "janggi" ? (
          <JanggiPalace />
        ) : game === "center" ? (
          <CenterPad />
        ) : game === "hearts" ? (
          <HeartsCorner />
        ) : (
          <MightyCorner />
        )}
      </div>
    </div>
  );
}
