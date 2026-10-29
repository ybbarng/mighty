import type { Kind, Side } from "@mighty/chess-engine";
import { useId } from "react";

/**
 * 입체 체스 기물 그림. 고전 스턴턴 모양을 바탕으로 새로 그렸다(외부 그림·글꼴 없음).
 * 모든 기물은 100×100 칸 안에 그리고, 받침(타원 두 겹) 위에 몸통·목 고리·머리를 차례로 쌓는다.
 * 입체감은 세 겹으로 낸다
 *  - 부분마다 왼쪽이 밝고 오른쪽이 어두운 그러데이션(둥근 몸통)
 *  - 기물 전체에 왼쪽 위에서 비추는 빛 얼룩(한 빛이 고루 닿게 사용자 좌표로 둔다)
 *  - 오른쪽 아래로 진 바닥 그림자
 */

/** 그림 칸. 둘레를 조금 잘라 기물이 칸을 넉넉히 채우게 한다 */
const VIEW = "4 3 92 92";

const SIDES: readonly Side[] = ["w", "b"];
const KINDS: readonly Kind[] = ["K", "Q", "R", "B", "N", "P"];

/** 타원 하나 */
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;

/** 원기둥 옆면(윗면 타원은 따로 덮는다) */
const band = (top: number, bottom: number, rx: number, ry: number) =>
  `M${50 - rx} ${top}V${bottom}A${rx} ${ry} 0 0 0 ${50 + rx} ${bottom}V${top}Z`;

/** 받침: 넓은 아랫단과 좁은 윗단. `k`로 폭을 줄인다(폰은 작게) */
const base = (k = 1) => [
  band(83, 87, 31 * k, 6.5),
  ell(50, 83, 31 * k, 6.5),
  band(76, 80, 24 * k, 5),
  ell(50, 76, 24 * k, 5),
];

const ball = (cx: number, cy: number, r: number) => ell(cx, cy, r, r);

interface Shape {
  /** 뒤에서 앞으로 쌓는 면 */
  parts: string[];
  /** 새긴 선(비숍 홈, 나이트 갈기 등) */
  lines?: string[];
  /** 찍은 점(나이트 눈·콧구멍) */
  dots?: string[];
}

const SHAPES: Record<Kind, Shape> = {
  K: {
    parts: [
      ...base(),
      "M35 77C38 65 42 54 42.5 44L57.5 44C58 54 62 65 65 77Z",
      // 십자가(왕관이 아랫부분을 덮는다)
      "M47.5 5H52.5V11H58.5V16H52.5V27H47.5V16H41.5V11H47.5Z",
      // 둥근 왕관
      "M36 40C33 32 36 24.5 42.5 24.5C46 24.5 48.5 27 50 30C51.5 27 54 24.5 57.5 24.5C64 24.5 67 32 64 40A14 3.4 0 0 1 36 40Z",
      ell(50, 44, 15.5, 3.8),
    ],
    lines: ["M37.5 36A12.5 3 0 0 0 62.5 36"],
  },
  Q: {
    parts: [
      ...base(),
      "M36 77C39 66 43 56 43.5 46L56.5 46C57 56 61 66 64 77Z",
      // 다섯 갈래 왕관
      "M35 42L28.5 21L38.5 31L40 16L46 29.5L50 13L54 29.5L60 16L61.5 31L71.5 21L65 42A15 3.6 0 0 1 35 42Z",
      ball(28.5, 21, 3.4),
      ball(40, 16, 3.4),
      ball(50, 12.5, 3.6),
      ball(60, 16, 3.4),
      ball(71.5, 21, 3.4),
      ell(50, 46, 14.5, 3.8),
    ],
  },
  R: {
    parts: [
      ...base(),
      "M34 77C36 66 38 54 38.5 46L61.5 46C62 54 64 66 66 77Z",
      // 성벽 머리(톱니 셋)
      "M30.5 19H39V25.5H46V19H54V25.5H61V19H69.5V42A19.5 4 0 0 1 30.5 42Z",
    ],
    lines: ["M30.5 31A19.5 3.5 0 0 0 69.5 31"],
  },
  B: {
    parts: [
      ...base(0.95),
      "M38 77C41 69 45 63 45.5 57L54.5 57C55 63 59 69 62 77Z",
      // 주교 모자(물방울 모양)
      "M50 15C57 21 63 30 62.5 39C62 47 56.5 52 50 52C43.5 52 38 47 37.5 39C37 30 43 21 50 15Z",
      ell(50, 55.5, 12.5, 3.6),
      ball(50, 12.5, 4.3),
    ],
    lines: ["M57.5 24.5L46.5 37.5"],
  },
  N: {
    parts: [
      ...base(),
      // 말 머리: 가슴에서 목, 턱, 코, 이마, 두 귀, 갈기로 한 바퀴
      "M33 77C33 67 37 60 45 54L41 52.5C35 54.5 29 55.5 25.5 52.5C21.5 49.5 20.5 45 23.5 41.5L40 22L43 10.5L49.5 17.5L55.5 8.5C66.5 15 72 27 71.5 41C71 54 66 64 67 77Z",
    ],
    lines: [
      "M24.5 50Q28 51.5 31.5 49.5",
      "M44.5 53C44.5 46 40.5 41.5 34 41",
      "M59 17Q64 21.5 63 27.5",
      "M65 29Q68.5 34 66.5 39.5",
      "M67.5 42Q69.5 48 67 53",
      "M66 56Q67 61 64.5 65",
    ],
    dots: [ell(40.5, 30.5, 2.4, 2.8), ball(26.5, 45.5, 1.4)],
  },
  P: {
    parts: [
      ...base(0.85),
      "M37 77C39 68 44 62 45 56L55 56C56 62 61 68 63 77Z",
      ell(50, 55.5, 11.5, 3.3),
      ball(50, 41.5, 12.5),
    ],
  },
};

/** 편마다 색: 백은 상아·나무색, 흑은 흑단색 */
const TONE: Record<
  Side,
  {
    body: readonly [number, string][];
    sheen: number;
    outline: string;
    mark: string;
    dot: string;
  }
> = {
  w: {
    body: [
      [0, "#fffaee"],
      [0.38, "#f2e0bf"],
      [0.78, "#d1ae7f"],
      [1, "#a37d52"],
    ],
    sheen: 0.55,
    outline: "#3b2a1a",
    mark: "#7a5a38",
    dot: "#2a1d11",
  },
  b: {
    body: [
      [0, "#7d6a5f"],
      [0.3, "#3d322c"],
      [0.72, "#1c1613"],
      [1, "#080605"],
    ],
    sheen: 0.32,
    outline: "#000000",
    mark: "#c8ad86",
    dot: "#e9d7b8",
  },
};

/** 그러데이션 이름을 판·아이콘마다 따로 둔다(한 쪽에 같은 이름이 둘 생기지 않게) */
const ids = (prefix: string) => ({
  body: (s: Side) => `${prefix}body${s}`,
  sheen: (s: Side) => `${prefix}sheen${s}`,
  shadow: `${prefix}shadow`,
  piece: (s: Side, k: Kind) => `${prefix}${s}${k}`,
});

/** React가 만든 이름에서 SVG url(#…)에 걸리는 글자를 뺀다 */
export function usePiecePrefix(): string {
  return `cp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** 그러데이션 정의. 판에는 한 번만 둔다 */
function Gradients({
  prefix,
  sides,
}: {
  prefix: string;
  sides: readonly Side[];
}) {
  const id = ids(prefix);
  return (
    <>
      {sides.map((s) => (
        <linearGradient
          key={`b${s}`}
          id={id.body(s)}
          x1="0"
          y1="0.1"
          x2="1"
          y2="0.35"
        >
          {TONE[s].body.map(([at, color]) => (
            <stop key={at} offset={at} stopColor={color} />
          ))}
        </linearGradient>
      ))}
      {sides.map((s) => (
        <radialGradient
          key={`s${s}`}
          id={id.sheen(s)}
          gradientUnits="userSpaceOnUse"
          cx="36"
          cy="28"
          r="52"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity={TONE[s].sheen} />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      ))}
      <radialGradient id={id.shadow}>
        <stop offset="0" stopColor="#000000" stopOpacity={0.5} />
        <stop offset="1" stopColor="#000000" stopOpacity={0} />
      </radialGradient>
    </>
  );
}

/** 기물 하나(100×100 좌표). 그러데이션은 `prefix`로 찾는다 */
function PieceShape({
  prefix,
  side,
  kind,
}: {
  prefix: string;
  side: Side;
  kind: Kind;
}) {
  const id = ids(prefix);
  const shape = SHAPES[kind];
  const tone = TONE[side];
  return (
    <>
      <ellipse cx={53} cy={89} rx={33} ry={6} fill={`url(#${id.shadow})`} />
      <g stroke={tone.outline} strokeWidth={1.7} strokeLinejoin="round">
        {shape.parts.map((d) => (
          <path key={d} d={d} fill={`url(#${id.body(side)})`} />
        ))}
      </g>
      <g fill={`url(#${id.sheen(side)})`}>
        {shape.parts.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {shape.lines && (
        <g
          fill="none"
          stroke={tone.mark}
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          {shape.lines.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      )}
      {shape.dots?.map((d) => (
        <path key={d} d={d} fill={tone.dot} />
      ))}
    </>
  );
}

/**
 * 판 하나에 한 번 두는 정의: 그러데이션과 기물 12개(`<symbol>`).
 * 칸마다 `<use href="#…">`로 다시 써서 판이 무겁지 않다
 */
export function PieceSprite({ prefix }: { prefix: string }) {
  const id = ids(prefix);
  return (
    <defs>
      <Gradients prefix={prefix} sides={SIDES} />
      {SIDES.flatMap((s) =>
        KINDS.map((k) => (
          <symbol key={`${s}${k}`} id={id.piece(s, k)} viewBox={VIEW}>
            <PieceShape prefix={prefix} side={s} kind={k} />
          </symbol>
        )),
      )}
    </defs>
  );
}

/** 판 위 기물 하나: 정의(`PieceSprite`)를 가리킨다. (x, y)는 칸의 왼쪽 위 */
export function PieceUse({
  prefix,
  piece,
  x,
  y,
}: {
  prefix: string;
  piece: `${Side}${Kind}`;
  x: number;
  y: number;
}) {
  return (
    <use
      href={`#${ids(prefix).piece(piece[0] as Side, piece[1] as Kind)}`}
      x={x}
      y={y}
      width={1}
      height={1}
    />
  );
}

/** 판 밖(자리 표·잡은 기물·승급 고르기)에서 쓰는 입체 기물 하나. 제 편 정의만 담는다 */
export function Piece3dIcon({
  piece,
  className,
}: {
  piece: `${Side}${Kind}`;
  className?: string | undefined;
}) {
  const prefix = usePiecePrefix();
  const side = piece[0] as Side;
  return (
    <svg
      viewBox={VIEW}
      className={className}
      aria-hidden="true"
      data-piece-art="3d"
    >
      <defs>
        <Gradients prefix={prefix} sides={[side]} />
      </defs>
      <PieceShape prefix={prefix} side={side} kind={piece[1] as Kind} />
    </svg>
  );
}
