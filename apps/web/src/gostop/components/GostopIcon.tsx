/*
 * 고스톱 아이콘(`next/og` ImageResponse용 JSX). 초록 담요 위에 화투 두 장: 붉은 뒷면과 공산(8월) 광.
 * 글꼴 없이 그림만 쓴다. 합칠 때 `components/brand/icon-art.tsx`의 `IconArt`에 `game="gostop"`으로 옮긴다(docs/28 7절)
 */

const FELT = "#0f5132";
const PAPER = "#fbf5e6";
const RED = "#c2272d";
const INK = "#2b1d14";

/** 카드 두 장 그림(100×100) */
export function GostopCards() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <rect width="100" height="100" fill={FELT} />
      {/* 뒷면 */}
      <g transform="rotate(-14 38 52)">
        <rect
          x="16"
          y="20"
          width="42"
          height="64"
          rx="5"
          fill="#000"
          opacity="0.3"
        />
        <rect
          x="14"
          y="17"
          width="42"
          height="64"
          rx="5"
          fill={RED}
          stroke="#7f1d1d"
          strokeWidth="2"
        />
        <rect
          x="21"
          y="25"
          width="28"
          height="48"
          rx="3"
          fill="none"
          stroke="#e8b04a"
          strokeWidth="2"
        />
        <rect
          x="30"
          y="44"
          width="10"
          height="10"
          fill="#e8b04a"
          transform="rotate(45 35 49)"
        />
      </g>
      {/* 공산 광: 둥근 달과 검은 산 */}
      <g transform="rotate(10 62 50)">
        <rect
          x="45"
          y="22"
          width="42"
          height="64"
          rx="5"
          fill="#000"
          opacity="0.35"
        />
        <rect
          x="42"
          y="18"
          width="42"
          height="64"
          rx="5"
          fill={PAPER}
          stroke={INK}
          strokeWidth="2"
        />
        <circle cx="63" cy="40" r="11" fill={RED} />
        <path
          d="M42 72 Q55 52 66 62 Q74 54 84 64 L84 77 Q84 82 79 82 L47 82 Q42 82 42 77 Z"
          fill={INK}
        />
        <circle cx="76" cy="26" r="5" fill={RED} />
      </g>
    </svg>
  );
}

/** 아이콘 틀: 둥근 모서리, `maskable`이면 안전 영역 안으로 줄인다(`IconArt`와 같은 모양) */
export function GostopIconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: FELT,
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
        <GostopCards />
      </div>
    </div>
  );
}
