/*
 * 아이콘·공유 그림용 작은 화투(`next/og` ImageResponse에서도 그려진다).
 * satori는 svg 안의 컴포넌트와 글꼴 없는 글자를 못 그리므로, 경로만 쓰고 함수로 부른다.
 * 카드 그림(`components/HwatuArt.tsx`)과 같은 한국 화투 색·구도를 줄여 그린다. 그림 상자 60×96
 */

const INK = "#1d1512";
const PAPER = "#fbf4e2";
const RED = "#c3242b";
const DEEP_RED = "#8e1820";
const GOLD = "#d8a42a";
const BACK_RED = "#b5161f";

/** 카드 한 장의 자리: 왼쪽 위(x, y), 기울기, 크기 배율(1이면 60×96) */
export interface IconCardAt {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}

function place({ x, y, rotate = 0, scale = 1 }: IconCardAt) {
  return `translate(${x} ${y}) rotate(${rotate} ${30 * scale} ${48 * scale}) scale(${scale})`;
}

/** 다섯 꽃잎 꽃(원 다섯)을 한 경로로 */
function flowers(list: readonly (readonly [number, number])[], r: number) {
  return list
    .flatMap(([x, y]) =>
      Array.from({ length: 5 }, (_, k) => {
        const a = ((-90 + 72 * k) * Math.PI) / 180;
        const cx = x + r * Math.cos(a);
        const cy = y + r * Math.sin(a);
        const pr = r * 0.66;
        return `M${(cx - pr).toFixed(1)} ${cy.toFixed(1)}a${pr} ${pr} 0 1 0 ${(2 * pr).toFixed(1)} 0a${pr} ${pr} 0 1 0 ${(-2 * pr).toFixed(1)} 0`;
      }),
    )
    .join("");
}

/** 단풍잎(일곱 갈래 별) */
function mapleLeaf(cx: number, cy: number, r: number) {
  return `${Array.from({ length: 14 }, (_, k) => {
    const rr = k % 2 === 0 ? r : r * 0.42;
    const a = ((-90 + (180 / 7) * k) * Math.PI) / 180;
    return `${k === 0 ? "M" : "L"}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join("")}Z`;
}

/** 앞면 틀: 붉은 테와 흰 바탕 */
function frame() {
  return (
    <g>
      <rect x="0" y="0" width="60" height="96" rx="5" fill={DEEP_RED} />
      <rect x="2.6" y="2.6" width="54.8" height="90.8" rx="3.4" fill={PAPER} />
    </g>
  );
}

/** 광 표시: 붉은 원 안 "光"(획을 경로로) */
function gwangMark() {
  return (
    <g>
      <circle
        cx="48"
        cy="12"
        r="8.6"
        fill={RED}
        stroke={PAPER}
        strokeWidth="1.4"
      />
      <path
        d="M44.6 8.6L45.6 10.4M48 7.2V10.6M51.4 8.6L50.4 10.4M43.6 11.6H52.4M46.4 11.6Q46.4 15 43.8 16.6M49.6 11.6V15.4Q49.6 16.4 51 16.4H52.6"
        stroke={PAPER}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/** 띠(글씨 없이) */
function ribbon(x: number, y: number, angle: number, color: string) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path
        d="M-7 0L7 0L7 42L0 37L-7 42Z"
        fill={color}
        stroke={INK}
        strokeWidth="1.2"
      />
      <rect x="-8" y="-2" width="16" height="4" rx="1" fill={INK} />
      <path d="M-3 10H3M-3 20H3" stroke={PAPER} strokeWidth="2" />
    </g>
  );
}

/** 뒷면: 진한 빨강에 금테와 가운데 꽃 문양 */
export function iconBack(at: IconCardAt) {
  return (
    <g transform={place(at)}>
      <rect
        x="0"
        y="0"
        width="60"
        height="96"
        rx="5"
        fill={BACK_RED}
        stroke="#5c0a10"
        strokeWidth="1.4"
      />
      <rect
        x="5"
        y="5"
        width="50"
        height="86"
        rx="3"
        fill="none"
        stroke={GOLD}
        strokeWidth="2.4"
      />
      <circle
        cx="30"
        cy="48"
        r="13"
        fill="#8c0d15"
        stroke={GOLD}
        strokeWidth="2.4"
      />
      <path d={flowers([[30, 48]], 5.6)} fill={GOLD} />
      <circle cx="30" cy="48" r="2.4" fill="#8c0d15" />
    </g>
  );
}

/** 8월 공산 광: 붉은 하늘, 보름달, 검은 언덕 */
export function iconMoonGwang(at: IconCardAt) {
  return (
    <g transform={place(at)}>
      {frame()}
      <path
        d="M2.6 6Q2.6 2.6 6 2.6H54Q57.4 2.6 57.4 6V64H2.6Z"
        fill="#c8352b"
      />
      <circle
        cx="26"
        cy="28"
        r="14"
        fill="#f7ebcb"
        stroke="#e0c58a"
        strokeWidth="1"
      />
      <path
        d="M2.6 66L18 52L28 60L42 46L57.4 60V90Q57.4 93.4 54 93.4H6Q2.6 93.4 2.6 90Z"
        fill="#1b1614"
      />
      <path
        d="M8 88Q10 76 14 66M20 88Q22 76 26 66M32 88Q34 74 38 62M44 88Q46 74 50 62"
        stroke="#e9dcc0"
        strokeWidth="1.6"
        fill="none"
      />
      {gwangMark()}
    </g>
  );
}

/** 3월 벚꽃 광: 분홍 꽃구름과 붉은 장막 */
export function iconCherryGwang(at: IconCardAt) {
  return (
    <g transform={place(at)}>
      {frame()}
      <path
        d="M2.6 6Q2.6 2.6 6 2.6H54Q57.4 2.6 57.4 6V62H2.6Z"
        fill="#f6c3cf"
      />
      <path
        d={flowers(
          [
            [16, 20],
            [40, 22],
            [26, 38],
            [12, 50],
            [44, 46],
          ],
          8,
        )}
        fill="#ee7f9b"
        stroke="#a8304c"
        strokeWidth="1.2"
      />
      <path
        d="M2.6 60C9 56 14 62 20 58C26 54 30 62 36 58C42 54 46 62 52 58C54 57 56 57 57.4 58V90Q57.4 93.4 54 93.4H6Q2.6 93.4 2.6 90Z"
        fill="#b51f2a"
        stroke={INK}
        strokeWidth="1.2"
      />
      <path
        d="M2.6 72H57.4V80H2.6Z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="1"
      />
      <path
        d="M2.6 58Q30 52 57.4 58"
        stroke={GOLD}
        strokeWidth="2"
        fill="none"
      />
      {gwangMark()}
    </g>
  );
}

/** 2월 매조 홍단: 검은 가지, 붉은 매화, 붉은 띠 */
export function iconPlumRibbon(at: IconCardAt) {
  return (
    <g transform={place(at)}>
      {frame()}
      <path
        d="M4 92C10 82 18 72 26 64C33 57 40 46 46 38C49 34 52 30 56 24M31 56C27 48 22 40 14 32"
        stroke="#3a2418"
        strokeWidth="4.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={flowers(
          [
            [12, 80],
            [30, 60],
            [48, 36],
            [16, 34],
            [44, 74],
          ],
          6.6,
        )}
        fill="#d42a3a"
        stroke={INK}
        strokeWidth="1.2"
      />
      {ribbon(32, 30, 8, RED)}
    </g>
  );
}

/** 10월 단풍: 붉은 단풍잎. `blue`면 청단 띠를 걸고, `mirror`면 좌우를 뒤집은 피 */
export function iconMaple(at: IconCardAt, extra: "pi" | "blue" | "mirror") {
  const leaves: [number, number, number][] = [
    [19, 22, 14],
    [42, 40, 14],
    [18, 60, 14],
    [41, 78, 13],
  ];
  const list =
    extra === "mirror"
      ? leaves.map(([x, y, r]) => [60 - x, y, r] as const)
      : leaves;
  return (
    <g transform={place(at)}>
      {frame()}
      <path
        d={
          extra === "mirror"
            ? "M41 22L18 40L42 60L19 78"
            : "M19 22L42 40L18 60L41 78"
        }
        stroke="#3a2418"
        strokeWidth="3"
        fill="none"
      />
      <path
        d={list.map(([x, y, r]) => mapleLeaf(x, y, r)).join("")}
        fill="#d93a1e"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {extra === "blue" && ribbon(30, 26, 0, "#1f4b9e")}
    </g>
  );
}
