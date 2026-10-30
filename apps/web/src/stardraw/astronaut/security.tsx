/**
 * 등록증 앞면의 보안 무늬 흉내(docs/36 11-9). 실제 신분증의 기요셰·키네그램·마이크로 문자를 꾸밈으로 흉내 낸다.
 * 추첨 화면의 크고 하얀 별과 겹쳐 보이지 않게 "무지개 필름" 결로 은은하게 둔다. 무엇을 판정하는 데 쓰지 않는다.
 * 모두 정적인 SVG·CSS 그라디언트이고 움직임은 CSS(기울기 변수 --hx·--ht, 주인 확인 뒤 애니메이션)만 쓴다.
 */

import { useId } from "react";

import { ART_H, ART_W } from "./key-art";

/** 용골자리(카노푸스가 속한 별자리)의 실제 별: 적경(시), 적위(도), 등급 */
const CARINA_STARS: readonly [string, number, number, number][] = [
  ["α", 6.399, -52.696, -0.74], // 카노푸스
  ["χ", 7.946, -52.982, 3.47],
  ["ε", 8.375, -59.51, 1.86], // 아비오르
  ["ι", 9.285, -59.275, 2.21], // 아스피디스케
  ["q", 10.284, -61.332, 3.4],
  ["p", 10.533, -61.685, 3.3],
  ["θ", 10.716, -64.394, 2.76],
  ["ω", 10.229, -70.038, 3.29],
  ["β", 9.22, -69.717, 1.67], // 미아플라키두스
  ["υ", 9.785, -65.072, 2.97],
];

/** 별자리 선(별 번호 둘) */
const CARINA_LINES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 3],
];

type Pt = { x: number; y: number; r: number };

/**
 * 하늘에서 보는 대로(동쪽이 왼쪽, 북쪽이 위) 펼친 용골자리. 가로 1 기준으로 맞추고, 세로는 비율대로.
 * 적위 -61도 근처라 적경 간격에 cos(적위)를 곱한다.
 */
const CARINA: { stars: Pt[]; height: number } = (() => {
  const dec0 = (-61 * Math.PI) / 180;
  const raw = CARINA_STARS.map(([, ra, dec, mag]) => ({
    x: -ra * 15 * Math.cos(dec0),
    y: -dec,
    mag,
  }));
  const minX = Math.min(...raw.map((s) => s.x));
  const maxX = Math.max(...raw.map((s) => s.x));
  const minY = Math.min(...raw.map((s) => s.y));
  const maxY = Math.max(...raw.map((s) => s.y));
  const w = maxX - minX;
  return {
    stars: raw.map((s) => ({
      x: (s.x - minX) / w,
      y: (s.y - minY) / w,
      // 밝을수록 크게(등급이 작을수록 밝다)
      r: 0.007 + (4 - s.mag) * 0.0025,
    })),
    height: (maxY - minY) / w,
  };
})();

/** 판 위 (x, y)에 너비 w로 놓은 용골자리 */
function placed(x: number, y: number, w: number): Pt[] {
  return CARINA.stars.map((s) => ({
    x: x + s.x * w,
    y: y + s.y * w,
    r: s.r * w,
  }));
}

/** 선 위에 고르게 놓는 작은 별(주인 확인 뒤 반짝인다). 간격은 판 단위 */
function along(stars: Pt[], gap: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [p, q] of CARINA_LINES) {
    const a = stars[p] as Pt;
    const b = stars[q] as Pt;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / gap));
    for (let i = 0; i < n; i++)
      out.push({
        x: a.x + ((b.x - a.x) * (i + 0.5)) / n,
        y: a.y + ((b.y - a.y) * (i + 0.5)) / n,
      });
  }
  return out;
}

/** 기요셰 사이에 섞는 용골자리 셋(판 좌표: 가로 158.6, 세로 100) */
const FIGURES: Pt[][] = [
  placed(10, 40, 62),
  placed(92, 6, 34),
  placed(64, 70, 26),
];

/** 반짝이는 작은 별: 셋의 선 위에 고르게. 지연은 번호에서 정해 골고루 흩는다 */
const TWINKLES = FIGURES.flatMap((f) => along(f, 3.2)).map((p, i) => ({
  ...p,
  delay: ((i * 0.37) % 1.1).toFixed(2),
  dur: (0.7 + ((i * 7) % 5) * 0.08).toFixed(2),
}));

/** 테두리 둥근 네모 길(마이크로 문자가 따라 흐른다)과 그 길이 */
const BORDER = (() => {
  const i = 1.6;
  const r = 5;
  const w = ART_W - i * 2;
  const h = ART_H - i * 2;
  const length = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
  const d = `M ${i + r} ${i} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
  return { d, length };
})();

/** 테두리 한 바퀴에 꼭 맞게 되풀이하는 마이크로 문자(끝에서 글자가 잘리지 않게 길이를 맞춘다) */
const MICRO = "CANOPUS SPACE AGENCY · ".repeat(28);

function Figure({ stars }: { stars: Pt[] }) {
  return (
    <g>
      {CARINA_LINES.map(([p, q]) => {
        const a = stars[p] as Pt;
        const b = stars[q] as Pt;
        return (
          <line
            key={`${p}-${q}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(200,220,255,0.16)"
            strokeWidth="0.25"
          />
        );
      })}
      {stars.map((s, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: 별자리의 별은 차례가 곧 id다
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="rgba(215,230,255,0.28)"
        />
      ))}
    </g>
  );
}

/**
 * 바탕 무늬 위에 까는 보안 무늬: 기요셰 사이의 용골자리, 선 위의 작은 별(주인 확인 뒤 반짝임),
 * 테두리를 따라 흐르는 아주 작은 "CANOPUS SPACE AGENCY"(확대해야 보인다).
 */
export function CardSecurity() {
  // 한 화면에 카드가 둘 이상이어도 길 id가 겹치지 않게
  const path = `sd-micro-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden="true"
      data-card-security
    >
      <defs>
        <path id={path} d={BORDER.d} />
      </defs>
      {FIGURES.map((f, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 셋
        <Figure key={i} stars={f} />
      ))}
      <g>
        {TWINKLES.map((t, i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 목록
            key={i}
            className="sd-twinkle"
            cx={t.x}
            cy={t.y}
            r="0.42"
            style={{
              animationDelay: `${t.delay}s`,
              animationDuration: `${t.dur}s`,
            }}
          />
        ))}
      </g>
      <text
        fontSize="1.05"
        textLength={BORDER.length - 0.5}
        lengthAdjust="spacing"
        fill="rgba(215,230,255,0.42)"
        data-microtext
      >
        <textPath href={`#${path}`}>{MICRO}</textPath>
      </text>
    </svg>
  );
}

/** 키네그램 안에 떠오르는 용골자리(가면 그림). 한 번 만들어 둔다 */
const KINE_MASK = (() => {
  const w = 100;
  const stars = placed(4, 4, w - 8);
  const h = Math.ceil(CARINA.height * (w - 8) + 8);
  const lines = CARINA_LINES.map(([p, q]) => {
    const a = stars[p] as Pt;
    const b = stars[q] as Pt;
    return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/>`;
  }).join("");
  const dots = stars
    .map(
      (s) =>
        `<circle cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="${(s.r * 1.6).toFixed(2)}" fill="#fff"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${lines}${dots}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

/**
 * 무지개 필름 속 용골자리(키네그램): 기울이면 무지개빛이 지나가며 떠올랐다 사라진다.
 * 투명도와 빛의 위치는 CSS 변수(--ht 기울기 세기, --hx 빛 위치)로만 바뀐다.
 */
export function Kinegram() {
  return (
    <div
      aria-hidden="true"
      data-kinegram
      className="sd-idcard-kine pointer-events-none absolute"
      style={{ maskImage: KINE_MASK, WebkitMaskImage: KINE_MASK }}
    />
  );
}
