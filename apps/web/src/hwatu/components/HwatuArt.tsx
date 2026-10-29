import type { HwatuCard } from "@mighty/hwatu";
import type { ReactNode } from "react";

/*
 * 화투 카드 앞면 그림(docs/27 2절). 전통 화투의 구도와 소재(달마다 꽃·나무, 광·열끗의 동물과 물건)를
 * 따르되 그림은 직접 새로 그렸다. 그림 상자 60×96(화투 비율 5:8), 가장자리 3 안쪽에 그린다.
 * `lite`는 작은 카드(너비 30px 아래)용이다. 잎맥·글씨 같은 잔무늬를 빼고 큰 색 덩어리만 남긴다
 */

export const INK = "#1d1512";
export const PAPER = "#fbf4e2";
export const RED = "#c3242b";
export const DEEP_RED = "#8e1820";
export const GOLD = "#d8a42a";
const GREEN = "#2f6b3c";
const DARK_GREEN = "#1c4429";
const BLUE = "#1f4b9e";
const BARK = "#3a2418";
const SERIF =
  '"Noto Serif KR","Nanum Myeongjo","AppleMyungjo","Batang","Songti SC",serif';

type Pt = readonly [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 여러 원을 한 경로로(요소 수를 줄인다) */
function circles(list: readonly (readonly [number, number, number])[]) {
  return list
    .map(
      ([x, y, r]) =>
        `M${r1(x - r)} ${r1(y)}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`,
    )
    .join("");
}

/** 다섯 꽃잎 꽃의 꽃잎 원들 */
function petals(x: number, y: number, r: number, n = 5, rot = -90) {
  return Array.from({ length: n }, (_, k) => {
    const a = ((rot + (360 / n) * k) * Math.PI) / 180;
    return [x + r * Math.cos(a), y + r * Math.sin(a), r * 0.66] as const;
  });
}

/** 잎 하나(밑동에서 끝까지 볼록한 잎), 경로 조각 */
function leaf(x: number, y: number, len: number, deg: number, wide = 0.32) {
  const a = (deg * Math.PI) / 180;
  const tx = x + len * Math.cos(a);
  const ty = y + len * Math.sin(a);
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  const nx = -Math.sin(a) * len * wide;
  const ny = Math.cos(a) * len * wide;
  return `M${r1(x)} ${r1(y)}Q${r1(mx + nx)} ${r1(my + ny)} ${r1(tx)} ${r1(ty)}Q${r1(mx - nx)} ${r1(my - ny)} ${r1(x)} ${r1(y)}Z`;
}

/** 별 모양 점들(단풍잎·국화) */
function star(
  cx: number,
  cy: number,
  n: number,
  ro: number,
  ri: number,
  rot = -90,
) {
  return Array.from({ length: n * 2 }, (_, k) => {
    const r = k % 2 === 0 ? ro : ri;
    const a = ((rot + (180 / n) * k) * Math.PI) / 180;
    return `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`;
  }).join(" ");
}

/** 띠: 위에서 비스듬히 늘어진 끈. 홍단·청단은 글씨를 쓴다 */
function Ribbon({
  x,
  y,
  angle,
  color,
  label,
  lite,
}: {
  x: number;
  y: number;
  angle: number;
  color: string;
  label?: string;
  lite: boolean;
}) {
  const len = 44;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path
        d={`M-6.5 0L6.5 0L6.5 ${len}L0 ${len - 5}L-6.5 ${len}Z`}
        fill={color}
        stroke={INK}
        strokeWidth={1}
      />
      {!lite && (
        <path
          d={`M-4.6 2V${len - 3.5}M4.6 2V${len - 3.5}`}
          stroke={PAPER}
          strokeOpacity={0.45}
          strokeWidth={0.5}
        />
      )}
      <rect x={-7.5} y={-2} width={15} height={3.4} rx={1} fill={INK} />
      {label && !lite && (
        <g
          fill={PAPER}
          fontFamily={SERIF}
          fontSize={9.5}
          fontWeight={700}
          textAnchor="middle"
        >
          <text x={0} y={15}>
            {label[0]}
          </text>
          <text x={0} y={27}>
            {label[1]}
          </text>
        </g>
      )}
    </g>
  );
}

const MIRROR = "matrix(-1 0 0 1 60 0)";

/* ───────────────────────── 달마다 꽃·나무(바탕) ───────────────────────── */

/** 1월 송학: 굽은 소나무 줄기와 솔잎 덩어리 */
function Pine({ lite, sky }: { lite: boolean; sky: boolean }) {
  const all: [number, number, number, number][] = [
    [36, 27, 36, 18],
    [13, 46, 28, 15],
    [47, 50, 28, 15],
    [25, 64, 30, 15],
  ];
  // 광은 맨 위 솔잎을 비워 붉은 해가 보이게 한다
  const clumps = sky ? all.slice(1) : all;
  return (
    <g>
      <path
        d="M0 96V84C12 78 22 82 30 86C40 80 50 80 60 84V96Z"
        fill={RED}
        stroke={INK}
        strokeWidth={1}
      />
      <path
        d="M14 90C18 80 14 70 21 60C26 52 31 44 35 30L41 31C38 46 33 56 29 63C24 72 26 82 24 90Z"
        fill={BARK}
        stroke={INK}
        strokeWidth={0.8}
      />
      <path d="M25 57C32 55 40 52 47 49L48 53C40 56 32 59 26 61Z" fill={BARK} />
      {clumps.map(([cx, cy, w, h]) => (
        <path
          key={`${cx}-${cy}`}
          d={`M${cx - w / 2} ${cy}C${cx - w / 2} ${cy - h} ${cx + w / 2} ${cy - h} ${cx + w / 2} ${cy}Q${cx + w / 4} ${cy + h * 0.3} ${cx} ${cy + 1}Q${cx - w / 4} ${cy + h * 0.3} ${cx - w / 2} ${cy}Z`}
          fill={DARK_GREEN}
          stroke={INK}
          strokeWidth={0.9}
        />
      ))}
      {!lite && (
        <path
          d={clumps
            .map(([cx, cy, w, h]) =>
              [-0.36, -0.18, 0, 0.18, 0.36]
                .map(
                  (t) =>
                    `M${r1(cx + t * w * 0.5)} ${cy}L${r1(cx + t * w * 1.05)} ${r1(cy - h * 0.62)}`,
                )
                .join(""),
            )
            .join("")}
          stroke="#5f9e5c"
          strokeWidth={0.7}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** 2월 매조: 검은 매화 가지에 붉은 꽃·흰 꽃 */
function Plum({ lite }: { lite: boolean }) {
  const red: Pt[] = [
    [12, 82],
    [30, 60],
    [41, 45],
    [52, 26],
    [17, 30],
    [8, 50],
    [46, 66],
    [26, 20],
  ];
  const white: Pt[] = [
    [21, 71],
    [48, 35],
    [26, 40],
    [38, 74],
  ];
  return (
    <g>
      <path
        d="M2 96C10 82 18 72 26 64C33 57 40 46 46 38C49 34 52 30 58 22"
        stroke={BARK}
        strokeWidth={4.4}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M31 56C27 48 22 40 14 32M24 47C27 42 28 36 26 22M14 40C10 44 8 48 8 50M30 62C36 64 42 66 46 66"
        stroke={BARK}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={circles(red.flatMap(([x, y]) => petals(x, y, 3.8)))}
        fill="#d42a3a"
        stroke={DEEP_RED}
        strokeWidth={0.4}
      />
      <path
        d={circles(white.flatMap(([x, y]) => petals(x, y, 3.8)))}
        fill="#fffaf0"
        stroke={RED}
        strokeWidth={0.5}
      />
      {!lite && (
        <path
          d={circles([...red, ...white].map(([x, y]) => [x, y, 1.3]))}
          fill={GOLD}
        />
      )}
    </g>
  );
}

/** 3월 벚꽃: 분홍 꽃구름 */
function Cherry({ lite }: { lite: boolean }) {
  const flowers: Pt[] = [
    [12, 24],
    [25, 18],
    [39, 20],
    [51, 26],
    [18, 36],
    [32, 32],
    [45, 38],
    [9, 49],
    [24, 48],
    [38, 50],
    [52, 52],
    [17, 61],
    [31, 63],
    [45, 64],
  ];
  return (
    <g>
      <path
        d="M0 72C8 66 16 68 22 72C30 64 40 66 46 70C52 66 56 66 60 68V0H0Z"
        fill="#f6c3cf"
        stroke="#d4607c"
        strokeWidth={0.8}
      />
      <path
        d="M0 46C10 42 20 44 30 42C40 40 50 44 60 42M0 30C12 28 24 30 40 26M10 60C20 56 34 58 54 56"
        stroke={BARK}
        strokeWidth={lite ? 2 : 1.6}
        fill="none"
      />
      <path
        d={circles(flowers.flatMap(([x, y]) => petals(x, y, 4.4)))}
        fill="#ee7f9b"
        stroke="#a8304c"
        strokeWidth={0.6}
      />
      <path d={circles(flowers.map(([x, y]) => [x, y, 1.8]))} fill={RED} />
    </g>
  );
}

/** 4월 흑싸리: 위에서 늘어진 검은 잎 줄기 */
function Wisteria() {
  const sprays: [number, number][] = [
    [10, 64],
    [23, 80],
    [37, 70],
    [50, 60],
  ];
  const leaves = sprays.flatMap(([x, end]) =>
    Array.from({ length: Math.floor((end - 8) / 6) }, (_, k) => {
      const y = 8 + k * 6;
      const sway = Math.sin(k * 0.7) * 2;
      return [
        leaf(x + sway, y, 8, 128, 0.36),
        leaf(x + sway, y + 2, 8, 52, 0.36),
      ];
    }).flat(),
  );
  return (
    <g>
      <path
        d={sprays
          .map(([x, end]) => `M${x} 4Q${x + 3} ${(end + 4) / 2} ${x} ${end}`)
          .join("")}
        stroke={INK}
        strokeWidth={1}
        fill="none"
      />
      <path d={leaves.join("")} fill="#1f1a22" stroke={INK} strokeWidth={0.4} />
      <path
        d={circles(
          sprays.flatMap(([x, end]) => [
            [x, end + 2, 2.2],
            [x - 3, end - 3, 1.6],
            [x + 3, end - 4, 1.6],
          ]),
        )}
        fill={RED}
      />
    </g>
  );
}

/** 5월 난초(창포): 긴 잎과 보랏빛 꽃 */
function Iris({ lite }: { lite: boolean }) {
  const flowers: Pt[] = [
    [16, 26],
    [42, 20],
    [30, 42],
    [48, 46],
  ];
  return (
    <g>
      <path
        d={[
          leaf(8, 96, 76, -82, 0.07),
          leaf(17, 96, 66, -76, 0.08),
          leaf(26, 96, 58, -92, 0.09),
          leaf(36, 96, 78, -97, 0.07),
          leaf(46, 96, 62, -104, 0.08),
          leaf(54, 96, 50, -96, 0.08),
        ].join("")}
        fill={GREEN}
        stroke={INK}
        strokeWidth={0.7}
      />
      <path
        d={flowers
          .map(
            ([x, y]) =>
              `${leaf(x, y, 11, -90, 0.34)}${leaf(x, y, 11, 150, 0.4)}${leaf(x, y, 11, 30, 0.4)}`,
          )
          .join("")}
        fill="#3d37a8"
        stroke={INK}
        strokeWidth={0.8}
      />
      {!lite && (
        <path
          d={flowers
            .map(
              ([x, y]) =>
                `${leaf(x, y, 6, 150, 0.25)}${leaf(x, y, 6, 30, 0.25)}`,
            )
            .join("")}
          fill="#f0c419"
        />
      )}
    </g>
  );
}

/** 6월 모란: 큰 붉은 꽃과 검푸른 잎 */
function Peony() {
  const outer = petals(30, 42, 11.5, 9, -90).map(
    ([x, y]) => [x, y, 7.6] as const,
  );
  return (
    <g>
      <path
        d={[
          leaf(30, 58, 28, 196, 0.3),
          leaf(30, 58, 28, -16, 0.3),
          leaf(30, 62, 26, 140, 0.32),
          leaf(30, 62, 26, 40, 0.32),
          leaf(30, 60, 36, 92, 0.16),
        ].join("")}
        fill={DARK_GREEN}
        stroke={INK}
        strokeWidth={0.9}
      />
      <path d={circles(outer)} fill="#d32a3c" stroke={INK} strokeWidth={0.9} />
      <path
        d={circles(petals(30, 42, 6, 6, -60).map(([x, y]) => [x, y, 5.4]))}
        fill="#ef5f78"
        stroke={DEEP_RED}
        strokeWidth={0.6}
      />
      <circle
        cx={30}
        cy={42}
        r={3.6}
        fill={GOLD}
        stroke={DEEP_RED}
        strokeWidth={0.5}
      />
    </g>
  );
}

/** 7월 홍싸리: 휘어진 가지에 붉은 잔잎 */
function BushClover({ lite }: { lite: boolean }) {
  const stems = [
    "M8 93C12 70 26 46 52 20",
    "M18 93C22 74 34 58 54 44",
    "M6 70C12 56 20 44 30 32",
  ];
  const along = (
    p0: Pt,
    p1: Pt,
    p2: Pt,
    p3: Pt,
    n: number,
  ): [number, number, number][] =>
    Array.from({ length: n }, (_, k) => {
      const t = 0.15 + (0.8 * k) / (n - 1);
      const u = 1 - t;
      const x =
        u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0];
      const y =
        u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1];
      const dx =
        3 * u * u * (p1[0] - p0[0]) +
        6 * u * t * (p2[0] - p1[0]) +
        3 * t * t * (p3[0] - p2[0]);
      const dy =
        3 * u * u * (p1[1] - p0[1]) +
        6 * u * t * (p2[1] - p1[1]) +
        3 * t * t * (p3[1] - p2[1]);
      return [x, y, (Math.atan2(dy, dx) * 180) / Math.PI];
    });
  const pts = [
    ...along([8, 93], [12, 70], [26, 46], [52, 20], 11),
    ...along([18, 93], [22, 74], [34, 58], [54, 44], 8),
    ...along([6, 70], [12, 56], [20, 44], [30, 32], 6),
  ];
  return (
    <g>
      <path
        d={stems.join("")}
        stroke={BARK}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={pts
          .flatMap(([x, y, a], k) => [
            leaf(x, y, 7.5, a - 55 - (k % 2) * 10, 0.42),
            leaf(x, y, 7.5, a + 55 + (k % 2) * 10, 0.42),
          ])
          .join("")}
        fill="#c8213a"
        stroke={INK}
        strokeWidth={0.5}
      />
      {!lite && (
        <path
          d={pts
            .filter((_, k) => k % 3 === 1)
            .map(([x, y, a]) => leaf(x, y, 5, a, 0.4))
            .join("")}
          fill="#2d5130"
        />
      )}
    </g>
  );
}

/** 8월 공산: 붉은 하늘, 검은 언덕, 은빛 억새 */
function Moor({ lite, sky }: { lite: boolean; sky: string | null }) {
  return (
    <g>
      {sky && <path d="M0 0H60V62H0Z" fill={sky} />}
      <path
        d="M0 96V52C10 42 22 40 30 48C38 38 50 38 60 46V96Z"
        fill="#1b1614"
      />
      {!lite && (
        <path
          d={[
            [6, 56],
            [12, 50],
            [18, 54],
            [24, 50],
            [32, 52],
            [38, 46],
            [44, 50],
            [50, 46],
            [10, 70],
            [22, 72],
            [34, 70],
            [46, 72],
          ]
            .map(
              ([x, y]) =>
                `M${x} ${(y as number) + 18}Q${(x as number) + 1} ${(y as number) + 8} ${(x as number) + 4} ${y}`,
            )
            .join("")}
          stroke="#e9dcc0"
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** 9월 국화: 노란 국화 둘 */
function Chrysanthemum({ lite }: { lite: boolean }) {
  return (
    <g>
      <path
        d="M30 96C30 78 28 62 32 44M30 80C24 72 20 66 16 58M31 70C38 64 44 60 48 54"
        stroke={DARK_GREEN}
        strokeWidth={1.8}
        fill="none"
      />
      <path
        d={[
          leaf(31, 72, 15, -20, 0.42),
          leaf(30, 84, 15, 200, 0.42),
          leaf(31, 60, 12, -30, 0.42),
          leaf(29, 66, 13, 210, 0.42),
          leaf(30, 90, 14, -10, 0.42),
        ].join("")}
        fill={GREEN}
        stroke={INK}
        strokeWidth={0.8}
      />
      <polygon
        points={star(31, 32, 18, 17, 9.5)}
        fill="#f6b80f"
        stroke={INK}
        strokeWidth={0.8}
      />
      <polygon
        points={star(15, 56, 12, 10, 5.5, -75)}
        fill="#e2402a"
        stroke={INK}
        strokeWidth={0.7}
      />
      <polygon
        points={star(48, 52, 12, 8, 4.5, -60)}
        fill="#f6b80f"
        stroke={INK}
        strokeWidth={0.7}
      />
      {!lite && (
        <polygon
          points={star(31, 32, 16, 10, 5, -80)}
          fill="#fbd75a"
          stroke="#a26a0c"
          strokeWidth={0.4}
        />
      )}
      <path
        d={circles([
          [31, 32, 3.6],
          [15, 56, 2.6],
          [48, 52, 2],
        ])}
        fill="#b4610e"
      />
    </g>
  );
}

/** 10월 단풍: 붉은 단풍잎과 가지 */
function Maple({ lite }: { lite: boolean }) {
  const leaves: [number, number, number, string][] = [
    [17, 22, 10, "#d93a1e"],
    [40, 17, 10, "#b8231a"],
    [29, 37, 11, "#e8541f"],
    [49, 38, 9.5, "#d93a1e"],
    [11, 46, 9.5, "#b8231a"],
    [36, 57, 10, "#d93a1e"],
    [51, 62, 8, "#e8541f"],
  ];
  return (
    <g>
      <path
        d="M62 76C46 62 38 50 30 38C24 30 20 26 17 22M38 50C42 44 46 40 49 38M30 38C34 30 37 24 40 17M24 32C20 38 15 42 11 46M44 58C40 58 38 57 36 57"
        stroke={BARK}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {leaves.map(([x, y, r, c]) => (
        <polygon
          key={`${x}-${y}`}
          points={star(x, y, 7, r, r * 0.42)}
          fill={c}
          stroke={INK}
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      ))}
      {!lite && (
        <path
          d={leaves
            .map(
              ([x, y, r]) =>
                `M${x} ${y}V${r1(y - r * 0.8)}M${x} ${y}L${r1(x - r * 0.7)} ${r1(y - r * 0.2)}M${x} ${y}L${r1(x + r * 0.7)} ${r1(y - r * 0.2)}`,
            )
            .join("")}
          stroke="#7a1410"
          strokeWidth={0.4}
        />
      )}
    </g>
  );
}

/** 11월 오동: 아래의 큰 오동잎과 위로 솟은 꽃대 */
function Paulownia({ lite, leafColor }: { lite: boolean; leafColor: string }) {
  const leafShape = (x: number, y: number, s: number) =>
    `M${x} ${y + s}C${x - s * 1.3} ${y + s * 0.5} ${x - s * 1.2} ${y - s * 0.9} ${x} ${y - s * 0.5}C${x + s * 1.2} ${y - s * 0.9} ${x + s * 1.3} ${y + s * 0.5} ${x} ${y + s}Z`;
  return (
    <g>
      <path d="M30 70V24" stroke={BARK} strokeWidth={2} />
      <path
        d={circles([
          [30, 22, 3.8],
          [24.5, 28, 3.4],
          [35.5, 28, 3.4],
          [23.5, 35, 3.2],
          [36.5, 35, 3.2],
          [25, 42, 3],
          [35, 42, 3],
          [30, 48, 2.8],
        ])}
        fill="#f0c21f"
        stroke={INK}
        strokeWidth={0.7}
      />
      {!lite && (
        <path
          d={circles([
            [30, 22, 1.2],
            [24.5, 28, 1.1],
            [35.5, 28, 1.1],
            [23.5, 35, 1],
            [36.5, 35, 1],
          ])}
          fill="#7b4fa0"
        />
      )}
      <path
        d={`${leafShape(14, 70, 15)}${leafShape(46, 72, 15)}${leafShape(30, 82, 14)}`}
        fill={leafColor}
        stroke={INK}
        strokeWidth={1}
      />
      {!lite && (
        <path
          d={[
            [14, 70, 15],
            [46, 72, 15],
            [30, 82, 14],
          ]
            .map(
              ([x, y, s]) =>
                `M${x} ${(y as number) + (s as number)}V${(y as number) - (s as number) * 0.4}M${x} ${y}L${(x as number) - (s as number) * 0.7} ${(y as number) - (s as number) * 0.3}M${x} ${y}L${(x as number) + (s as number) * 0.7} ${(y as number) - (s as number) * 0.3}`,
            )
            .join("")}
          stroke={leafColor === RED ? "#f2b2a0" : "#6d6a5c"}
          strokeWidth={0.5}
        />
      )}
    </g>
  );
}

/** 12월 비: 늘어진 버들가지 */
function Willow({ lite }: { lite: boolean }) {
  const strands: [number, number][] = [
    [6, 66],
    [14, 80],
    [22, 58],
    [50, 52],
    [56, 70],
  ];
  return (
    <g>
      <path
        d={strands
          .map(([x, end]) => `M${x} 0Q${x + 4} ${end / 2} ${x - 1} ${end}`)
          .join("")}
        stroke={BARK}
        strokeWidth={1.2}
        fill="none"
      />
      <path
        d={strands
          .flatMap(([x, end]) =>
            Array.from({ length: Math.floor(end / 7) }, (_, k) => {
              const y = 5 + k * 7;
              const xx = x + 3 * Math.sin((y / end) * Math.PI);
              return [leaf(xx, y, 8, 112, 0.25), leaf(xx, y + 3, 8, 68, 0.25)];
            }).flat(),
          )
          .join("")}
        fill="#3f8f34"
        stroke={INK}
        strokeWidth={0.4}
      />
      {!lite && (
        <path
          d="M36 6l-3 9M44 12l-3 9M30 22l-3 9M48 28l-3 9"
          stroke="#7a8ca8"
          strokeWidth={0.6}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/* ───────────────────────── 광·열끗의 동물과 물건 ───────────────────────── */

function Sun() {
  return (
    <circle
      cx={29}
      cy={23}
      r={13}
      fill={RED}
      stroke={DEEP_RED}
      strokeWidth={0.6}
    />
  );
}

/** 1월 광: 학 */
function Crane({ lite }: { lite: boolean }) {
  return (
    <g transform="translate(40 64)">
      <path d="M-13 9Q-20 14 -18 22L-9 13Z" fill={INK} />
      <path
        d="M-13 7C-11 -1 3 -4 8 0C11 4 7 12 -4 14C-9 14 -13 11 -13 7Z"
        fill="#ffffff"
        stroke={INK}
        strokeWidth={1}
      />
      <path d="M-9 8C-4 4 2 4 6 6C1 9 -4 11 -11 11Z" fill="#3a3330" />
      <path
        d="M6 2C10 -6 5 -13 9 -21"
        stroke={INK}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx={10}
        cy={-22.5}
        r={2.8}
        fill="#fff"
        stroke={INK}
        strokeWidth={0.9}
      />
      <circle cx={9.6} cy={-24.4} r={1.5} fill={RED} />
      <path
        d="M12.5 -22.6L19 -21L12.5 -21.2Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={0.3}
      />
      <path
        d="M-2 14L-4 28M2 13L4 28"
        stroke={INK}
        strokeWidth={lite ? 1.4 : 1}
      />
    </g>
  );
}

/** 2월 열끗: 꾀꼬리(휘파람새) */
function Warbler() {
  return (
    <g transform="translate(36 58) rotate(-12)">
      <path
        d="M7 2L19 7L18 10L6 5Z"
        fill="#4c611c"
        stroke={INK}
        strokeWidth={0.7}
      />
      <ellipse
        cx={0}
        cy={1}
        rx={9.5}
        ry={6}
        fill="#86a234"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path d="M-7 3Q0 9 7 3Q0 6 -7 3Z" fill="#dfe39a" />
      <path d="M-2 -1Q5 -4 11 1Q4 3.5 -2 -1Z" fill="#56711f" />
      <circle
        cx={-8}
        cy={-3.5}
        r={4.4}
        fill="#86a234"
        stroke={INK}
        strokeWidth={0.9}
      />
      <circle cx={-9.2} cy={-4.2} r={1.2} fill="#fff" />
      <circle cx={-9.4} cy={-4.2} r={0.7} fill={INK} />
      <path d="M-12 -3.4L-15.5 -2.2L-11.8 -1.6Z" fill={INK} />
      <path d="M-1 6.5L-2 10M2 6.5L2 10" stroke={INK} strokeWidth={1} />
    </g>
  );
}

/** 3월 광: 벚꽃 장막(만막) */
function Curtain({ lite }: { lite: boolean }) {
  return (
    <g>
      <path
        d="M0 60C6 56 14 62 20 58C26 54 30 62 36 58C42 54 46 62 52 58C56 56 58 57 60 58V96H0Z"
        fill="#b51f2a"
        stroke={INK}
        strokeWidth={1}
      />
      <path d="M3 58Q30 52 57 58" stroke={GOLD} strokeWidth={1.4} fill="none" />
      {!lite && (
        <path
          d="M12 62V92M24 61V92M36 61V92M48 62V92"
          stroke="#7d1219"
          strokeWidth={0.6}
        />
      )}
      <path d="M3 72H57V80H3Z" fill={PAPER} stroke={INK} strokeWidth={0.8} />
      <path
        d={circles([10, 22, 34, 46].flatMap((x) => petals(x + 2, 76, 2, 5)))}
        fill="#e0405a"
      />
    </g>
  );
}

/** 4월 열끗: 두견새와 초승달 */
function Cuckoo() {
  return (
    <g>
      <path
        d="M44 66A10 10 0 1 0 54 82A8 8 0 1 1 44 66Z"
        fill={GOLD}
        stroke="#8a6410"
        strokeWidth={0.5}
      />
      <g transform="translate(28 74) rotate(-10)">
        <path
          d="M-2 0C-8 -10 -16 -13 -22 -10C-16 -6 -10 -2 -4 3Z"
          fill="#2a2732"
          stroke={INK}
          strokeWidth={0.7}
        />
        <path
          d="M2 -1C8 -12 16 -17 22 -15C16 -9 10 -2 4 3Z"
          fill="#3a3646"
          stroke={INK}
          strokeWidth={0.7}
        />
        <path
          d="M-10 4C-4 -1 6 -1 12 2C6 6 -4 7 -10 4Z"
          fill="#45404f"
          stroke={INK}
          strokeWidth={0.8}
        />
        <path d="M-9 4L-19 10L-17 5Z" fill="#2a2732" />
        <path
          d="M-4 5Q2 7 8 4"
          stroke="#d8d0bf"
          strokeWidth={0.8}
          fill="none"
        />
        <circle
          cx={13}
          cy={1}
          r={3.2}
          fill="#45404f"
          stroke={INK}
          strokeWidth={0.8}
        />
        <circle cx={14} cy={0.4} r={0.9} fill={RED} />
        <path d="M16 1L19.5 2L16 2.4Z" fill={GOLD} />
      </g>
    </g>
  );
}

/** 5월 열끗: 나무다리(팔교) */
function Bridge({ lite }: { lite: boolean }) {
  return (
    <g>
      <path
        d="M3 70L30 60V68L3 79Z"
        fill="#a8743c"
        stroke={INK}
        strokeWidth={1}
      />
      <path
        d="M30 60L57 71V79L30 68Z"
        fill="#c58c4c"
        stroke={INK}
        strokeWidth={1}
      />
      {!lite && (
        <path
          d="M9 68V77M16 65V74M23 63V71M37 63V71M44 66V74M51 68V77"
          stroke="#5e3b17"
          strokeWidth={0.6}
        />
      )}
      <path d="M8 77V88M28 68V82M50 77V88" stroke={INK} strokeWidth={1.6} />
    </g>
  );
}

function Butterfly({
  x,
  y,
  s,
  rot,
  wing,
  inner,
}: {
  x: number;
  y: number;
  s: number;
  rot: number;
  wing: string;
  inner: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path
        d="M0 0C-5 -11 -13 -10 -12 -3C-11 1 -4 2 0 0ZM0 0C5 -11 13 -10 12 -3C11 1 4 2 0 0Z"
        fill={wing}
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M0 0C-4 7 -9 8 -8 3C-7 1 -3 0 0 0ZM0 0C4 7 9 8 8 3C7 1 3 0 0 0Z"
        fill={inner}
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M0 -5V6M0 -5L-3 -10M0 -5L3 -10"
        stroke={INK}
        strokeWidth={0.9}
        fill="none"
      />
    </g>
  );
}

/** 6월 열끗: 나비 한 쌍 */
function Butterflies() {
  return (
    <g>
      <Butterfly x={16} y={26} s={0.95} rot={-18} wing="#2d5fb8" inner={GOLD} />
      <Butterfly x={44} y={74} s={0.85} rot={14} wing={GOLD} inner="#2d5fb8" />
    </g>
  );
}

/** 7월 열끗: 멧돼지 */
function Boar({ lite }: { lite: boolean }) {
  return (
    <g transform="translate(31 77) scale(1.3)">
      <path
        d="M-14 -2C-12 -11 6 -13 14 -7C18 -4 17 3 12 4L-10 4C-14 3 -15 1 -14 -2Z"
        fill="#3e2c1f"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M-12 -7L-21 -1L-20 2.4L-12 2Z"
        fill="#3e2c1f"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M-18 1Q-17 -2 -15 -2"
        stroke="#f5ecd8"
        strokeWidth={1}
        fill="none"
      />
      <circle cx={-13.5} cy={-3.5} r={0.9} fill={RED} />
      <path
        d="M-9 4L-11 12M-4 4L-3 12M6 4L5 12M11 3L14 11"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {!lite && (
        <path
          d="M-10 -8l1 -3M-6 -10l1 -3M-2 -11l1 -3M2 -11l1 -3M6 -10l1 -3M10 -8l1 -3"
          stroke="#7a5a3a"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
      )}
      <path d="M14 -5Q18 -8 17 -2" stroke={INK} strokeWidth={0.8} fill="none" />
    </g>
  );
}

/** 8월 광: 보름달 */
function FullMoon() {
  return (
    <circle
      cx={30}
      cy={31}
      r={15}
      fill="#f7ebcb"
      stroke="#e0c58a"
      strokeWidth={1}
    />
  );
}

/** 8월 열끗: 기러기 세 마리 */
function Geese() {
  const goose = (x: number, y: number, s: number) =>
    `M${x} ${y}l${-6 * s} ${2 * s}l${-2 * s} ${-1 * s}l${2 * s} ${-1.4 * s}l${-1 * s} ${-6 * s}l${5 * s} ${4.6 * s}l${4 * s} ${-6 * s}l${1 * s} ${7 * s}l${4 * s} ${1 * s}l${-3 * s} ${1 * s}Z`;
  return (
    <path
      d={`${goose(22, 22, 1.25)}${goose(40, 16, 1.1)}${goose(38, 36, 1.2)}`}
      fill="#1b1614"
      stroke="#1b1614"
      strokeWidth={0.6}
      strokeLinejoin="round"
    />
  );
}

/** 9월 열끗: 술잔(국진) */
function SakeCup({ lite }: { lite: boolean }) {
  return (
    <g transform="translate(30 74)">
      <path
        d="M-6 6L6 6L8 11L-8 11Z"
        fill={DEEP_RED}
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M-15 -4L15 -4C13 4 7 8 0 8C-7 8 -13 4 -15 -4Z"
        fill={RED}
        stroke={INK}
        strokeWidth={1}
      />
      <ellipse
        cx={0}
        cy={-4}
        rx={15}
        ry={3.4}
        fill={GOLD}
        stroke={INK}
        strokeWidth={0.9}
      />
      <ellipse cx={0} cy={-4} rx={12.4} ry={2.2} fill="#9d1a22" />
      {!lite && (
        <path
          d="M-11 1Q0 4 11 1M-4 4.5L0 2L4 4.5L0 7Z"
          stroke={GOLD}
          strokeWidth={0.8}
          fill="none"
        />
      )}
    </g>
  );
}

/** 10월 열끗: 뒤돌아보는 사슴 */
function Deer({ lite }: { lite: boolean }) {
  return (
    <g transform="translate(34 74)">
      <path
        d="M-8 2L-10 18M-4 3L-4 18M6 3L7 18M10 1L13 17"
        stroke="#5c3415"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M-12 -3C-12 -9 8 -10 13 -5C16 -1 13 4 8 4L-8 4C-11 4 -12 1 -12 -3Z"
        fill="#b06a2c"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M-9 -4C-12 -10 -14 -14 -16 -17L-12 -19C-10 -15 -7 -10 -5 -6Z"
        fill="#b06a2c"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M-14 -17C-18 -18 -22 -17 -23 -15C-21 -13 -17 -13 -12 -15Z"
        fill="#b06a2c"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path d="M-14 -19L-11 -23L-12 -18Z" fill="#8a4f1e" />
      <path
        d="M-15 -19C-16 -25 -14 -29 -10 -32M-15 -24L-19 -28M-13 -28L-16 -32M-14 -19C-12 -24 -8 -26 -5 -29M-10 -24L-7 -24"
        stroke="#4a2a12"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={-19} cy={-16} r={0.7} fill={INK} />
      {!lite && (
        <path
          d={circles([
            [-6, -4, 0.9],
            [-1, -6, 0.9],
            [4, -5, 0.9],
            [8, -3, 0.9],
            [-3, -1, 0.8],
            [2, -1, 0.8],
          ])}
          fill="#f6e9cc"
        />
      )}
    </g>
  );
}

/** 11월 광: 봉황 */
function Phoenix({ lite }: { lite: boolean }) {
  return (
    <g>
      <path
        d="M30 40C38 46 46 50 54 46M30 40C36 50 40 58 50 62M30 40C32 52 30 60 36 68"
        stroke={RED}
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M31 41C40 49 46 52 52 50M31 41C38 52 42 57 47 60"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M26 34C18 24 10 22 5 24C10 28 14 34 22 40Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M32 32C38 20 46 16 52 18C48 24 44 32 36 38Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={0.9}
      />
      {!lite && (
        <path
          d="M8 25L16 32M12 23L19 31M46 18L40 30M50 19L42 31"
          stroke={RED}
          strokeWidth={0.9}
        />
      )}
      <path
        d="M20 38C22 32 30 30 34 36C36 40 32 44 26 44C22 44 19 42 20 38Z"
        fill="#2c7a4b"
        stroke={INK}
        strokeWidth={0.9}
      />
      <path
        d="M24 34C22 28 20 24 21 20L25 19C25 24 27 28 28 32Z"
        fill={RED}
        stroke={INK}
        strokeWidth={0.8}
      />
      <circle
        cx={22.5}
        cy={18.5}
        r={3}
        fill={RED}
        stroke={INK}
        strokeWidth={0.8}
      />
      <path
        d="M20.5 16C19 12 22 10 24 12"
        stroke={GOLD}
        strokeWidth={1}
        fill="none"
      />
      <path d="M20 18.5L16 19.6L20 20.2Z" fill={GOLD} />
      <circle cx={22} cy={18} r={0.7} fill={INK} />
    </g>
  );
}

/** 12월 광: 우산 들고 갓 쓴 선비와 개구리 */
function Umbrella({ lite }: { lite: boolean }) {
  return (
    <g>
      <path d="M0 84Q20 80 30 86T60 84V96H0Z" fill="#2a2a3a" />
      <path d="M34 42L28 76" stroke={INK} strokeWidth={1.2} />
      <path
        d="M14 48Q30 26 54 38L52 42Q32 36 16 52Z"
        fill="#b53a22"
        stroke={INK}
        strokeWidth={1}
      />
      {!lite && (
        <path
          d="M34 34L22 48M34 34L30 44M34 34L40 40M34 34L48 40"
          stroke={GOLD}
          strokeWidth={0.5}
        />
      )}
      <path
        d="M22 59C26 55 34 55 36 59L41 89H17Z"
        fill="#f3efe4"
        stroke={INK}
        strokeWidth={1}
      />
      <path d="M29 59L27 89" stroke={INK} strokeWidth={0.8} />
      <path
        d="M19 72Q29 69 39.5 71"
        stroke={RED}
        strokeWidth={1.8}
        fill="none"
      />
      <path d="M30 71L32 80" stroke={RED} strokeWidth={1.2} />
      <circle
        cx={29}
        cy={54}
        r={3.4}
        fill="#f0cfa2"
        stroke={INK}
        strokeWidth={0.8}
      />
      <path
        d="M21.5 51.6Q29 49.4 36.5 51.6L35.5 52.6Q29 51 22.5 52.6Z"
        fill={INK}
      />
      <path d="M26.4 51.2Q26.6 46.8 29 46.8Q31.4 46.8 31.6 51.2Z" fill={INK} />
      <path
        d="M26.6 56.4L28 62M31.4 56.4L30 62"
        stroke={INK}
        strokeWidth={0.4}
      />
      <ellipse
        cx={10}
        cy={80}
        rx={4.2}
        ry={3}
        fill="#5d9a3a"
        stroke={INK}
        strokeWidth={0.8}
      />
      <circle cx={8.4} cy={77.6} r={0.8} fill={INK} />
    </g>
  );
}

/** 12월 열끗: 제비 */
function Swallow() {
  return (
    <g transform="translate(34 54) rotate(28) scale(1.45)">
      <path d="M0 0L-20 -9L-4 3ZM0 0L18 -12L4 3Z" fill={INK} />
      <ellipse cx={0} cy={2} rx={3.4} ry={7} fill={INK} />
      <path d="M-1.8 3Q0 9 1.8 3Z" fill="#f4ecd8" />
      <path d="M-2.4 7.5L-6 19L0 11L6 19L2.4 7.5Z" fill={INK} />
      <circle cx={0} cy={-4.2} r={2} fill={RED} />
    </g>
  );
}

const DRUMS = [
  [12, 26, 6.5],
  [48, 32, 6],
  [14, 48, 5.5],
] as const;

/** 12월 쌍피: 번개와 천둥북 */
function Thunder({ lite }: { lite: boolean }) {
  return (
    <g>
      <path
        d="M0 0H60V56C50 60 44 54 38 58C32 62 26 56 20 60C14 64 8 58 0 60Z"
        fill={RED}
      />
      <path
        d="M26 8L38 28L31 30L44 56L26 34L33 32L20 12Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <path d={circles(DRUMS)} fill={INK} stroke={GOLD} strokeWidth={1} />
      {!lite && (
        <path
          d={DRUMS.map(
            ([x, y, r]) =>
              `M${x} ${y - r * 0.8}a${r * 0.8} ${r * 0.8} 0 0 1 0 ${r * 1.6}a${r * 0.4} ${r * 0.4} 0 0 1 0 ${-r * 0.8}a${r * 0.4} ${r * 0.4} 0 0 0 0 ${-r * 0.8}Z`,
          ).join("")}
          fill={RED}
        />
      )}
      <path
        d="M0 78C14 74 24 80 34 76C44 72 52 76 60 74V96H0Z"
        fill="#1b1614"
      />
    </g>
  );
}

/* ───────────────────────── 카드 한 장의 앞면 그림 ───────────────────────── */

/** 띠 놓는 자리(달마다 그림을 덜 가리는 곳) */
const RIBBON_AT: Partial<Record<number, [number, number, number]>> = {
  1: [24, 54, -8],
  2: [38, 52, 12],
  3: [30, 50, -8],
  4: [36, 46, 8],
  5: [42, 50, 10],
  6: [44, 52, 12],
  7: [36, 50, -10],
  9: [44, 46, 10],
  10: [24, 58, -8],
  12: [38, 48, 10],
};

/** 카드 앞면 그림(바탕 꽃·나무 + 광·열끗·띠의 소재) */
export function CardArt({ card, lite }: { card: HwatuCard; lite: boolean }) {
  const { month, kind } = card;
  const gwang = kind === "gwang";
  const animal = kind === "animal";
  const mirror = card.id.endsWith("q");
  let base: ReactNode;
  let over: ReactNode = null;
  switch (month) {
    case 1:
      base = (
        <>
          {gwang && <Sun />}
          <Pine lite={lite} sky={gwang} />
        </>
      );
      if (gwang) over = <Crane lite={lite} />;
      break;
    case 2:
      base = <Plum lite={lite} />;
      if (animal) over = <Warbler />;
      break;
    case 3:
      base = <Cherry lite={lite} />;
      if (gwang) over = <Curtain lite={lite} />;
      break;
    case 4:
      base = <Wisteria />;
      if (animal) over = <Cuckoo />;
      break;
    case 5:
      base = <Iris lite={lite} />;
      if (animal) over = <Bridge lite={lite} />;
      break;
    case 6:
      base = <Peony />;
      if (animal) over = <Butterflies />;
      break;
    case 7:
      base = <BushClover lite={lite} />;
      if (animal) over = <Boar lite={lite} />;
      break;
    case 8:
      base = (
        <>
          <Moor
            lite={lite}
            sky={gwang ? "#c8352b" : animal ? "#e6a23c" : null}
          />
          {gwang && <FullMoon />}
        </>
      );
      if (animal) over = <Geese />;
      break;
    case 9:
      base = <Chrysanthemum lite={lite} />;
      if (animal) over = <SakeCup lite={lite} />;
      break;
    case 10:
      base = <Maple lite={lite} />;
      if (animal) over = <Deer lite={lite} />;
      break;
    case 11:
      base = (
        <Paulownia
          lite={lite}
          leafColor={card.piValue === 2 ? RED : "#1e1c18"}
        />
      );
      if (gwang) over = <Phoenix lite={lite} />;
      break;
    default:
      base =
        card.piValue === 2 ? <Thunder lite={lite} /> : <Willow lite={lite} />;
      if (gwang) over = <Umbrella lite={lite} />;
      if (animal) over = <Swallow />;
      break;
  }
  const at = RIBBON_AT[month];
  if (kind === "ribbon" && at) {
    const ribbon = card.ribbon ?? "plain";
    over = (
      <Ribbon
        x={at[0]}
        y={at[1] - 22}
        angle={at[2]}
        color={ribbon === "blue" ? BLUE : RED}
        {...(ribbon === "red"
          ? { label: "홍단" }
          : ribbon === "blue"
            ? { label: "청단" }
            : {})}
        lite={lite}
      />
    );
  }
  return (
    <g>
      {mirror ? <g transform={MIRROR}>{base}</g> : base}
      {over}
    </g>
  );
}

/** 광 표시: 붉은 원 안의 "光" */
export function GwangMark() {
  return (
    <g>
      <circle
        cx={49.5}
        cy={11}
        r={7.4}
        fill={RED}
        stroke={PAPER}
        strokeWidth={1.2}
      />
      <circle
        cx={49.5}
        cy={11}
        r={5.6}
        fill="none"
        stroke={GOLD}
        strokeWidth={0.5}
      />
      <text
        x={49.5}
        y={14.4}
        textAnchor="middle"
        fontFamily={SERIF}
        fontSize={9.5}
        fontWeight={700}
        fill={PAPER}
      >
        光
      </text>
    </g>
  );
}

/** 쌍피 표시: 금테 두른 검은 도장에 한글 "쌍" */
export function SsangpiMark({ lite }: { lite: boolean }) {
  return (
    <g>
      <rect
        x={42.5}
        y={4}
        width={13.5}
        height={13.5}
        rx={1.6}
        fill={INK}
        stroke={GOLD}
        strokeWidth={1}
      />
      {!lite && (
        <text
          x={49.25}
          y={14.3}
          textAnchor="middle"
          fontFamily={SERIF}
          fontSize={9.5}
          fontWeight={700}
          fill={GOLD}
        >
          쌍
        </text>
      )}
      {lite && <path d="M46 8.5H53M46 13H53" stroke={GOLD} strokeWidth={2} />}
    </g>
  );
}

/** 왼쪽 위 달 숫자. 작은 카드에서는 크게 쓴다 */
export function MonthIndex({ month, lite }: { month: number; lite: boolean }) {
  return (
    <text
      x={lite ? 3.5 : 4.5}
      y={lite ? 24 : 14}
      fontFamily={SERIF}
      fontSize={lite ? (month >= 10 ? 21 : 26) : 12}
      fontWeight={800}
      fill={RED}
      stroke={PAPER}
      strokeWidth={lite ? 4 : 2.6}
      strokeLinejoin="round"
      paintOrder="stroke"
      letterSpacing={month >= 10 ? -1 : 0}
    >
      {month}
    </text>
  );
}
