/**
 * 등록증의 보안 무늬 흉내(docs/36 11-9). 실제 신분증의 기요셰·은박 홀로그램·키네그램·반짝이·마이크로 문자를 꾸밈으로 흉내 낸다.
 * 추첨 화면의 크고 하얀 별과 겹쳐 보이지 않게 "무지개 필름" 결로 둔다. 무엇을 판정하는 데 쓰지 않는다.
 * 그림은 한 번 만든 SVG·CSS 그라디언트이고, 움직임은 카드 돌림판의 CSS 변수(빛 위치 --lx·--ly, 색 각 --la, 세기 --li)와
 * 가만히 있을 때의 일렁임(--drift)으로만 바뀐다(globals.css `.sd-idcard`).
 */

import { type CSSProperties, useId } from "react";

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
 * 사진 위에 겹친 투명 무지개 용골자리(키네그램): 기울이면 무지개빛이 지나가며 또렷해진다.
 * 투명도와 빛의 위치는 CSS 변수(--li 세기, --lx 빛 위치)로만 바뀐다.
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

/** 짧은 숫자(SVG 길이를 줄인다) */
const f1 = (n: number) => n.toFixed(1);

/** SVG 문자열을 CSS url()로 */
const svgUrl = (viewBox: string, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
  )}")`;

/**
 * 기요셰 가면 그림: 아래쪽을 가로지르는 물결 띠와 아래 가운데 꽃무늬(rosette).
 * 선 색은 CSS 무지개 그라디언트가 채우고, 기울기(--lx)에 따라 색이 바뀐다
 */
const GUILLOCHE_MASK = (() => {
  const paths: string[] = [];
  // 물결 띠: 두 주기의 사인을 겹친 선 열두 줄
  for (let i = 0; i < 12; i++) {
    let d = "";
    for (let x = -2; x <= ART_W + 2; x += 1.6) {
      const t = (x / ART_W) * Math.PI * 2;
      const y =
        68 +
        i * 0.9 +
        4 * Math.sin(t * 2 + i * 0.32) +
        2 * Math.sin(t * 7 + i * 0.6);
      d += `${d ? "L" : "M"}${f1(x)} ${f1(y)}`;
    }
    paths.push(d);
  }
  // 꽃무늬: 꽃잎 여섯 장짜리 고리를 조금씩 돌려 열여섯 겹
  const cx = 64;
  const cy = 84;
  for (let j = 0; j < 16; j++) {
    let d = "";
    for (let k = 0; k <= 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      const r = 10 + 4 * Math.sin(6 * a + (j * Math.PI * 2) / 16);
      d += `${d ? "L" : "M"}${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
    }
    paths.push(`${d}Z`);
  }
  const body = paths
    .map(
      (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="0.22"/>`,
    )
    .join("");
  return svgUrl(`0 0 ${ART_W} ${ART_H}`, body);
})();

/** 기요셰: 가는 선에 무지개빛이 기울기를 따라 미끄러진다 */
export function Guilloche() {
  return (
    <div
      aria-hidden="true"
      data-guilloche
      className="sd-guilloche pointer-events-none absolute inset-0"
      style={{ maskImage: GUILLOCHE_MASK, WebkitMaskImage: GUILLOCHE_MASK }}
    />
  );
}

/** 정해진 차례로 흩는 수(시드 고정, 화면마다 같은 반짝이 자리) */
function scatter(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** 반짝이 무리 셋. 무리마다 빛나는 기울기가 달라 기울이면 반짝임이 옮겨 다닌다 */
const GLITTER: string[] = [1, 2, 3].map((seed) => {
  const r = scatter(seed * 7919);
  let body = "";
  for (let i = 0; i < 11; i++) {
    const x = r() * 100;
    const y = r() * 100;
    const k = 0.5 + r() * 0.9;
    // 작은 네 갈래 반짝이와 점
    if (r() < 0.3) {
      const L = k * 2.4;
      const w = k * 0.5;
      const pt = (dx: number, dy: number) => `${f1(x + dx)} ${f1(y + dy)}`;
      body += `<path d="M${pt(0, -L)}L${pt(w, 0)}L${pt(0, L)}L${pt(-w, 0)}ZM${pt(-L, 0)}L${pt(0, w)}L${pt(L, 0)}L${pt(0, -w)}Z" fill="#fff"/>`;
    } else
      body += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${k.toFixed(2)}" fill="#fff"/>`;
  }
  return svgUrl("0 0 100 100", body);
});

/** 무지개 필름과 반짝이(앞뒷면 맨 위에 덮는다) */
export function HoloFilm() {
  return (
    <>
      <div aria-hidden="true" className="sd-holo-film" data-holo-film>
        <div className="sd-holo-band" />
      </div>
      <div aria-hidden="true" className="sd-holo-glitter">
        {GLITTER.map((g, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 셋
            key={i}
            style={{ backgroundImage: g, "--k": i } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}

/** 은박 패치의 새김 무늬: 두 고리, 고리 글자, 카노푸스(여덟 갈래 별), 작은 용골자리 */
const FOIL_ART = (() => {
  const ink = "rgba(18,28,58,0.5)";
  const rings = [22, 27, 32]
    .map(
      (r) =>
        `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${ink}" stroke-width="0.5" stroke-dasharray="1.2 1.4"/>`,
    )
    .join("");
  const star = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? 17 : 10) : 3.6;
    return `${f1(50 + r * Math.cos(a))},${f1(50 + r * Math.sin(a))}`;
  }).join(" ");
  const mini = placed(30, 60, 40);
  const lines = CARINA_LINES.map(([p, q]) => {
    const a = mini[p] as Pt;
    const b = mini[q] as Pt;
    return `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${ink}" stroke-width="0.6"/>`;
  }).join("");
  const dots = mini
    .map(
      (s) =>
        `<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${(s.r * 1.4).toFixed(2)}" fill="${ink}"/>`,
    )
    .join("");
  const body =
    `<defs><path id="r" d="M50 50m-41 0a41 41 0 1 1 82 0a41 41 0 1 1 -82 0"/></defs>` +
    `<circle cx="50" cy="50" r="47.5" fill="none" stroke="${ink}" stroke-width="1"/>` +
    `<circle cx="50" cy="50" r="36" fill="none" stroke="${ink}" stroke-width="0.8"/>` +
    `<text font-family="sans-serif" font-size="7.2" font-weight="700" letter-spacing="1.2" fill="${ink}"><textPath href="#r">CANOPUS SPACE AGENCY · CANOPUS ·</textPath></text>` +
    rings +
    `<polygon points="${star}" fill="rgba(255,255,255,0.55)" stroke="${ink}" stroke-width="0.6"/>` +
    lines +
    dots;
  return svgUrl("0 0 100 100", body);
})();

/**
 * 은박 홀로그램 패치(실제 신분증의 은빛 무지개 필름 조각). 카노푸스 우주국 상징과 용골자리를 새기고,
 * 은빛 바탕 위 무지개빛이 기울기(--la·--lx·--ly)에 따라 돌고 반사광이 미끄러진다. 가만히 있어도 천천히 일렁인다
 */
export function FoilPatch({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-foil
      className={`sd-foil pointer-events-none absolute ${className ?? ""}`}
      style={{ "--foil-art": FOIL_ART } as CSSProperties}
    />
  );
}
