"use client";

import { useId } from "react";

import type { Egg, Face } from "./identity";

/**
 * 등록증 사진: 공개 열쇠 해시로 고른 부위를 조합한 외계인 얼굴(docs/36 11-9).
 * 드문 사진 셋은 오마주 수준으로 직접 그렸다(우주견, 작은 별의 아이와 장미, 절구 찧는 달토끼).
 * 그림판 100×120(증명사진 비율).
 */

const SKINS: readonly [string, string][] = [
  ["#8ff0c8", "#4fbf95"],
  ["#c9b6ff", "#9a83e0"],
  ["#ffc4a3", "#e8936d"],
  ["#9fd8ff", "#5fa8e0"],
  ["#d4f57a", "#9cc23e"],
  ["#ff9fae", "#e0687c"],
  ["#ffe08a", "#e0b445"],
  ["#7fe3e0", "#3fb0ad"],
];

/** 머리 모양별 머리 꼭대기 y(더듬이를 붙이는 곳) */
const HEAD_TOP = [36, 30, 44, 28, 38] as const;

export const EGG_LABEL: Record<Egg, string> = {
  laika: "우주견",
  prince: "작은 별의 아이",
  rabbit: "달토끼",
};

/** 씨앗으로 배경 별 자리(작은 선형 합동 난수) */
function skyDots(seed: number, count: number): [number, number, number][] {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return Array.from({ length: count }, () => [
    4 + next() * 92,
    4 + next() * 60,
    0.5 + next() * 1.1,
  ]);
}

export function Avatar({
  face,
  egg,
  className,
  label,
}: {
  face: Face;
  egg: Egg | null;
  className?: string;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 120"
      role="img"
      aria-label={label}
      className={className}
      data-avatar={egg ?? "alien"}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#0f1d3a" />
          <stop offset="1" stopColor="#21163f" />
        </linearGradient>
        <radialGradient id={`${id}-glass`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#bfe3ff" stopOpacity="0.16" />
        </radialGradient>
      </defs>
      <rect width="100" height="120" fill={`url(#${id}-bg)`} />
      {skyDots(face.sky, egg ? 14 : 9).map(([x, y, r]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={r * 0.6}
          fill="#fff"
          opacity={0.35 + r * 0.3}
        />
      ))}
      {egg === "laika" ? (
        <Laika glass={`url(#${id}-glass)`} />
      ) : egg === "prince" ? (
        <Prince />
      ) : egg === "rabbit" ? (
        <MoonRabbit />
      ) : (
        <Alien face={face} glass={`url(#${id}-glass)`} />
      )}
    </svg>
  );
}

/** 우주복 어깨와 목 고리 */
function Suit() {
  return (
    <g>
      <path
        d="M10 120 C 12 101, 32 95, 50 95 C 68 95, 88 101, 90 120 Z"
        fill="#e9eef7"
      />
      <path
        d="M10 120 C 12 101, 32 95, 50 95 C 68 95, 88 101, 90 120"
        fill="none"
        stroke="#b7c3d8"
        strokeWidth="1.2"
      />
      <rect x="33" y="92" width="34" height="8" rx="4" fill="#9fb0cc" />
      <circle cx="70" cy="108" r="3" fill="#f2b84b" />
      <rect x="25" y="105" width="10" height="5" rx="1.5" fill="#6d84b5" />
    </g>
  );
}

function Head({ shape, fill }: { shape: number; fill: string }) {
  switch (shape) {
    case 1:
      return <ellipse cx="50" cy="64" rx="25" ry="34" fill={fill} />;
    case 2:
      return <ellipse cx="50" cy="70" rx="36" ry="26" fill={fill} />;
    case 3:
      return (
        <path
          d="M50 28 C 70 40, 84 60, 80 78 C 76 96, 24 96, 20 78 C 16 60, 30 40, 50 28 Z"
          fill={fill}
        />
      );
    case 4:
      return <rect x="20" y="38" width="60" height="56" rx="22" fill={fill} />;
    default:
      return <circle cx="50" cy="66" r="30" fill={fill} />;
  }
}

function Antenna({
  kind,
  top,
  color,
}: {
  kind: number;
  top: number;
  color: string;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
  };
  switch (kind) {
    case 1:
      return (
        <g>
          <line x1="42" y1={top + 4} x2="36" y2={top - 12} {...stroke} />
          <line x1="58" y1={top + 4} x2="64" y2={top - 12} {...stroke} />
          <circle cx="36" cy={top - 13} r="3.5" fill="#ffe27a" />
          <circle cx="64" cy={top - 13} r="3.5" fill="#ffe27a" />
        </g>
      );
    case 2:
      return (
        <g>
          <path
            d={`M50 ${top + 3} C 50 ${top - 8}, 60 ${top - 10}, 58 ${top - 16} C 56 ${top - 21}, 48 ${top - 18}, 51 ${top - 14}`}
            fill="none"
            {...stroke}
          />
          <circle cx="51" cy={top - 14} r="2.5" fill="#ff9fd2" />
        </g>
      );
    case 3:
      return (
        <g>
          {[38, 50, 62].map((x, i) => (
            <g key={x}>
              <line
                x1={x}
                y1={top + 4}
                x2={x + (i - 1) * 4}
                y2={top - 8}
                {...stroke}
              />
              <circle
                cx={x + (i - 1) * 4}
                cy={top - 9}
                r="2.6"
                fill="#9ff3ff"
              />
            </g>
          ))}
        </g>
      );
    case 4:
      return (
        <g fill={color}>
          <path d={`M36 ${top + 6} L 32 ${top - 9} L 44 ${top + 3} Z`} />
          <path d={`M64 ${top + 6} L 68 ${top - 9} L 56 ${top + 3} Z`} />
        </g>
      );
    default:
      return null;
  }
}

function Eyes({ kind }: { kind: number }) {
  const shine = (x: number, y: number, r = 1.4) => (
    <circle cx={x} cy={y} r={r} fill="#fff" />
  );
  switch (kind) {
    case 1:
      return (
        <g>
          <circle cx="50" cy="58" r="11" fill="#fff" />
          <circle cx="51" cy="59" r="6" fill="#1b1f3b" />
          {shine(53, 56, 2)}
        </g>
      );
    case 2:
      return (
        <g>
          {[
            [36, 63],
            [50, 54],
            [64, 63],
          ].map(([x, y]) => (
            <g key={`${x}`}>
              <circle cx={x} cy={y} r="5" fill="#fff" />
              <circle cx={x} cy={(y as number) + 0.8} r="2.6" fill="#1b1f3b" />
            </g>
          ))}
        </g>
      );
    case 3:
      return (
        <g fill="none" stroke="#1b1f3b" strokeWidth="2.2" strokeLinecap="round">
          <path d="M31 61 Q 38 66, 45 61" />
          <path d="M55 61 Q 62 66, 69 61" />
        </g>
      );
    case 4:
      return (
        <g>
          {[38, 62].map((x) => (
            <g key={x}>
              <circle cx={x} cy="60" r="7" fill="#fff" />
              <path
                d={`M${x} 56 L ${x + 1} 59 L ${x + 4} 60 L ${x + 1} 61 L ${x} 64 L ${x - 1} 61 L ${x - 4} 60 L ${x - 1} 59 Z`}
                fill="#f2a516"
              />
            </g>
          ))}
        </g>
      );
    case 5:
      return (
        <g>
          {[38, 62].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="61" rx="6" ry="8" fill="#1b1f3b" />
              {shine(x + 2, 58, 2)}
              {shine(x - 2, 64, 1)}
            </g>
          ))}
        </g>
      );
    default:
      return (
        <g>
          {[38, 62].map((x) => (
            <g key={x}>
              <circle cx={x} cy="60" r="7" fill="#fff" />
              <circle cx={x + 1} cy="61" r="3.6" fill="#1b1f3b" />
              {shine(x + 2, 59)}
            </g>
          ))}
        </g>
      );
  }
}

function Mouth({ kind, y }: { kind: number; y: number }) {
  const line = {
    fill: "none",
    stroke: "#1b1f3b",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
  };
  switch (kind) {
    case 1:
      return <ellipse cx="50" cy={y} rx="3.4" ry="4" fill="#1b1f3b" />;
    case 2:
      return (
        <path
          d={`M42 ${y - 2} Q 46 ${y + 3}, 50 ${y - 1} Q 54 ${y + 3}, 58 ${y - 2}`}
          {...line}
        />
      );
    case 3:
      return (
        <g>
          <path
            d={`M40 ${y - 3} Q 50 ${y + 7}, 60 ${y - 3} Z`}
            fill="#1b1f3b"
          />
          <path
            d={`M43 ${y - 2} L 57 ${y - 2} L 55 ${y + 1} L 45 ${y + 1} Z`}
            fill="#fff"
          />
        </g>
      );
    case 4:
      return <path d={`M45 ${y} L 55 ${y}`} {...line} />;
    case 5:
      return (
        <g>
          <path d={`M42 ${y - 2} Q 50 ${y + 5}, 58 ${y - 2}`} {...line} />
          <path
            d={`M48 ${y + 1.5} Q 50 ${y + 8}, 53 ${y + 1.5}`}
            fill="#ff7aa2"
          />
        </g>
      );
    default:
      return <path d={`M41 ${y - 3} Q 50 ${y + 5}, 59 ${y - 3}`} {...line} />;
  }
}

function Marks({ kind, shade }: { kind: number; shade: string }) {
  switch (kind) {
    case 1:
      return (
        <g fill={shade}>
          {[
            [33, 70],
            [36, 73],
            [31, 74],
            [67, 70],
            [64, 73],
            [69, 74],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />
          ))}
        </g>
      );
    case 2:
      return (
        <g fill={shade} opacity="0.7">
          <circle cx="30" cy="52" r="4" />
          <circle cx="71" cy="76" r="3" />
          <circle cx="66" cy="45" r="2.2" />
        </g>
      );
    case 3:
      return (
        <g fill="#ff6f9a" opacity="0.38">
          <ellipse cx="32" cy="72" rx="5.5" ry="3.2" />
          <ellipse cx="68" cy="72" rx="5.5" ry="3.2" />
        </g>
      );
    default:
      return null;
  }
}

function Helmet({ glass }: { glass: string }) {
  return (
    <g>
      <circle
        cx="50"
        cy="62"
        r="44"
        fill={glass}
        stroke="#dbeaff"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path
        d="M22 44 A 34 34 0 0 1 46 24"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}

function Alien({ face, glass }: { face: Face; glass: string }) {
  const [skin, shade] = SKINS[face.skin] ?? (SKINS[0] as [string, string]);
  const top = HEAD_TOP[face.head as 0] ?? 36;
  return (
    <g>
      <Suit />
      <Antenna kind={face.antenna} top={top} color={shade} />
      <Head shape={face.head} fill={skin} />
      <Marks kind={face.marks} shade={shade} />
      <Eyes kind={face.eyes} />
      <Mouth kind={face.mouth} y={face.head === 2 ? 82 : 80} />
      {face.helmet && <Helmet glass={glass} />}
    </g>
  );
}

/** 우주견(오마주): 귀가 선 강아지, 둥근 유리 헬멧 */
function Laika({ glass }: { glass: string }) {
  return (
    <g>
      <Suit />
      <path d="M28 48 L 30 22 L 44 42 Z" fill="#b8794a" />
      <path d="M72 48 L 70 22 L 56 42 Z" fill="#b8794a" />
      <path d="M31 44 L 32 29 L 40 41 Z" fill="#f1c9a5" />
      <path d="M69 44 L 68 29 L 60 41 Z" fill="#f1c9a5" />
      <ellipse cx="50" cy="64" rx="27" ry="28" fill="#f5ecdf" />
      <path
        d="M24 60 C 26 44, 40 38, 46 44 C 44 54, 34 62, 24 66 Z"
        fill="#c9895a"
      />
      <path
        d="M76 60 C 74 44, 60 38, 54 44 C 56 54, 66 62, 76 66 Z"
        fill="#c9895a"
      />
      <ellipse cx="50" cy="76" rx="14" ry="11" fill="#fffaf2" />
      <circle cx="40" cy="60" r="3.4" fill="#1b1f3b" />
      <circle cx="60" cy="60" r="3.4" fill="#1b1f3b" />
      <circle cx="41" cy="59" r="1.1" fill="#fff" />
      <circle cx="61" cy="59" r="1.1" fill="#fff" />
      <ellipse cx="50" cy="71" rx="4.5" ry="3.4" fill="#1b1f3b" />
      <path
        d="M44 77 Q 50 82, 56 77"
        fill="none"
        stroke="#1b1f3b"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M48 79 Q 50 87, 53 79" fill="#ff7aa2" />
      <Helmet glass={glass} />
    </g>
  );
}

/** 작은 별의 아이(오마주): 아주 작은 별 위에 선 아이, 바람에 날리는 노란 목도리, 장미 한 송이 */
function Prince() {
  return (
    <g>
      <circle cx="80" cy="22" r="7" fill="#ffe9a8" opacity="0.9" />
      <circle cx="50" cy="128" r="46" fill="#c9a77a" />
      <path
        d="M8 112 Q 50 92, 92 112"
        fill="none"
        stroke="#a9875e"
        strokeWidth="1.2"
      />
      <circle cx="30" cy="104" r="2.4" fill="#a9875e" />
      <circle cx="66" cy="98" r="1.8" fill="#a9875e" />
      {/* 장미 */}
      <path
        d="M74 96 Q 75 88, 74 82"
        stroke="#3f8f5a"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="M74 90 Q 79 88, 80 85 Q 76 85, 74 89" fill="#3f8f5a" />
      <path d="M70 80 Q 74 72, 78 80 Q 74 84, 70 80 Z" fill="#e2445c" />
      {/* 아이 */}
      <path d="M42 96 L 44 82 L 56 82 L 58 96 Z" fill="#4f9a6a" />
      <rect x="44" y="94" width="4" height="6" fill="#3b4f7a" />
      <rect x="52" y="94" width="4" height="6" fill="#3b4f7a" />
      <circle cx="50" cy="72" r="9" fill="#ffe0c2" />
      <path
        d="M41 70 L 43 62 L 46 66 L 48 60 L 51 65 L 54 59 L 56 65 L 59 62 L 59 71 Q 50 66, 41 70 Z"
        fill="#f4c542"
      />
      <circle cx="47" cy="73" r="1" fill="#1b1f3b" />
      <circle cx="53" cy="73" r="1" fill="#1b1f3b" />
      {/* 목도리 */}
      <path
        d="M44 81 Q 50 84, 56 81 Q 66 76, 82 70 Q 74 79, 60 84 Q 52 86, 44 83 Z"
        fill="#f6d64a"
      />
    </g>
  );
}

/** 달토끼: 큰 보름달 앞에서 절구를 찧는 토끼 */
function MoonRabbit() {
  return (
    <g>
      <circle cx="50" cy="58" r="40" fill="#fbf1c7" />
      <circle cx="34" cy="44" r="6" fill="#efe1a6" />
      <circle cx="64" cy="36" r="4" fill="#efe1a6" />
      <circle cx="70" cy="70" r="7" fill="#efe1a6" />
      {/* 절구 */}
      <path d="M58 86 L 82 86 L 78 102 L 62 102 Z" fill="#8a5a3c" />
      <rect x="60" y="83" width="20" height="4" rx="2" fill="#6e452c" />
      <rect
        x="54"
        y="62"
        width="3"
        height="26"
        rx="1.5"
        fill="#6e452c"
        transform="rotate(30 55 75)"
      />
      {/* 토끼 */}
      <ellipse cx="38" cy="90" rx="13" ry="14" fill="#ffffff" />
      <ellipse cx="38" cy="68" rx="10" ry="9" fill="#ffffff" />
      <ellipse
        cx="33"
        cy="50"
        rx="3.6"
        ry="11"
        fill="#ffffff"
        transform="rotate(-12 33 50)"
      />
      <ellipse
        cx="42"
        cy="50"
        rx="3.6"
        ry="11"
        fill="#ffffff"
        transform="rotate(10 42 50)"
      />
      <ellipse
        cx="33"
        cy="50"
        rx="1.6"
        ry="8"
        fill="#ffc6d3"
        transform="rotate(-12 33 50)"
      />
      <ellipse
        cx="42"
        cy="50"
        rx="1.6"
        ry="8"
        fill="#ffc6d3"
        transform="rotate(10 42 50)"
      />
      <circle cx="42" cy="67" r="1.5" fill="#1b1f3b" />
      <circle cx="47" cy="71" r="1.2" fill="#ff9fb4" />
      <ellipse
        cx="50"
        cy="82"
        rx="7"
        ry="3"
        fill="#ffffff"
        transform="rotate(-25 50 82)"
      />
      <path d="M10 120 Q 50 104, 90 120 Z" fill="#2a2f55" />
    </g>
  );
}
