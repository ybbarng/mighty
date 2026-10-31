"use client";

import { useEffect, useRef } from "react";

import { tempColor } from "../sky";

/**
 * 우주국 소개의 "우주 속 카노푸스": 우리 은하를 위에서 내려다본 도식 한 장과, 태양 둘레 밝은 별의 3차원 배치.
 *
 * 수치 출처
 * - 별 거리: 히파르코스 새 처리 연주 시차(van Leeuwen 2007, VizieR I/311, 공개 자료). 광년 = 3261.56 / 시차(mas), 반올림.
 *   먼 별(리겔·안타레스·베텔게우스)은 오차가 커 "약"이다.
 * - 별 좌표: J2000 적경·적위(Bright Star Catalogue 5판).
 * - 은하: 지름 약 10만 광년, 태양은 중심에서 약 2만 6천 7백 광년(GRAVITY 협력단 2019, 8.18kpc), 오리온 팔(국부 팔) 안.
 *   나선팔은 공개 연구의 대략 모양을 따라 직접 그린 도식이다(실제 사진이 아니다).
 * - 카노푸스 은하 좌표: 은경 261.2°, 은위 −25.3°(SIMBAD).
 */

interface Body {
  ko: string;
  ra: number;
  dec: number;
  ly: number;
  k: number;
  mag: number;
}

const BODIES: Body[] = [
  { ko: "카노푸스", ra: 95.99, dec: -52.7, ly: 310, k: 7500, mag: -0.74 },
  { ko: "시리우스", ra: 101.29, dec: -16.72, ly: 8.6, k: 9750, mag: -1.46 },
  { ko: "알파 센타우리", ra: 219.9, dec: -60.83, ly: 4.4, k: 5800, mag: -0.27 },
  { ko: "아크투루스", ra: 213.92, dec: 19.18, ly: 37, k: 4300, mag: -0.05 },
  { ko: "직녀성", ra: 279.23, dec: 38.78, ly: 25, k: 9600, mag: 0.03 },
  { ko: "카펠라", ra: 79.17, dec: 46.0, ly: 43, k: 5000, mag: 0.08 },
  { ko: "리겔", ra: 78.63, dec: -8.2, ly: 860, k: 12000, mag: 0.13 },
  { ko: "프로키온", ra: 114.83, dec: 5.22, ly: 11.5, k: 6500, mag: 0.34 },
  { ko: "베텔게우스", ra: 88.79, dec: 7.41, ly: 500, k: 3500, mag: 0.42 },
  { ko: "아케르나르", ra: 24.43, dec: -57.24, ly: 139, k: 15000, mag: 0.46 },
  { ko: "하다르", ra: 210.96, dec: -60.37, ly: 390, k: 25000, mag: 0.61 },
  { ko: "견우성", ra: 297.7, dec: 8.87, ly: 16.7, k: 7700, mag: 0.76 },
  { ko: "아크룩스", ra: 186.65, dec: -63.1, ly: 320, k: 28000, mag: 0.77 },
  { ko: "알데바란", ra: 68.98, dec: 16.51, ly: 67, k: 3900, mag: 0.86 },
  { ko: "스피카", ra: 201.3, dec: -11.16, ly: 250, k: 22000, mag: 0.97 },
  { ko: "안타레스", ra: 247.35, dec: -26.43, ly: 550, k: 3500, mag: 1.06 },
  { ko: "폴룩스", ra: 116.33, dec: 28.03, ly: 34, k: 4800, mag: 1.14 },
  { ko: "포말하우트", ra: 344.41, dec: -29.62, ly: 25, k: 8600, mag: 1.16 },
  { ko: "미모사", ra: 191.93, dec: -59.69, ly: 280, k: 27000, mag: 1.25 },
  { ko: "레굴루스", ra: 152.09, dec: 11.97, ly: 79, k: 12000, mag: 1.35 },
  { ko: "아다라", ra: 104.66, dec: -28.97, ly: 405, k: 22000, mag: 1.5 },
  { ko: "카스토르", ra: 113.65, dec: 31.89, ly: 51, k: 9500, mag: 1.58 },
  { ko: "벨라트릭스", ra: 81.28, dec: 6.35, ly: 250, k: 21000, mag: 1.64 },
  { ko: "북극성", ra: 37.95, dec: 89.26, ly: 430, k: 6000, mag: 1.98 },
];

/** 3D 그림에 이름을 적을 별(태양 곁에 몰린 가까운 별은 겹쳐 빼고 시리우스만 남긴다) */
const LABELED_3D = new Set([
  "카노푸스",
  "시리우스",
  "리겔",
  "베텔게우스",
  "안타레스",
  "북극성",
  "아크룩스",
  "스피카",
  "하다르",
  "아다라",
  "아케르나르",
  "알데바란",
]);

const rad = (d: number) => (d * Math.PI) / 180;
const rgb = ([r, g, b]: [number, number, number], a = 1) =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

/** 지름 10만 광년 은하를 그릴 폭(그림 단위)과 그 비율 */
const GW = 400;
const LY_PER_UNIT = 110_000 / GW;
const SUN_R = 26_700;
/** 카노푸스를 은하면에 비춘 거리(광년): 310 × cos(25.3°) */
const CANOPUS_PLANE = 310 * Math.cos(rad(25.3));

/**
 * 로그 나선 한 가닥(시작 반지름·각도에서 바깥으로, 피치 약 12°)과 이름표 자리(그림 각도 `labelAt`를 마지막으로 지나는 점).
 * 태양 방향(그림 아래)에서 안쪽부터 방패-남십자(약 1만 8천 광년)·궁수-용골(약 2만), 태양(2만 6천 7백) 바깥으로
 * 페르세우스(약 3만 5천)·바깥 팔(약 3만 9천)이 지나게 시작 각도를 골랐다(실제 순서와 같다)
 */
function arm(r0: number, a0: number, turns: number, labelAt: number) {
  const b = Math.tan(rad(12));
  let d = "";
  let label = { x: GW / 2, y: GW / 2 };
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * turns * 2 * Math.PI;
    const r = r0 * Math.exp(b * t);
    if (r > 52_000) break;
    const a = a0 + t;
    const x = GW / 2 + (r / LY_PER_UNIT) * Math.cos(a);
    const y = GW / 2 + (r / LY_PER_UNIT) * Math.sin(a);
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    const deg = ((((a * 180) / Math.PI) % 360) + 360) % 360;
    if (Math.abs(deg - labelAt) < 4) label = { x, y };
  }
  return { d, label };
}

/** 위에서 내려다본 우리 은하 도식과 태양 둘레 돋보기 */
export function GalaxyMap() {
  // 태양은 중심 아래쪽(관례대로), 은하 회전은 시계 방향
  const sun = { x: GW / 2, y: GW / 2 + SUN_R / LY_PER_UNIT };
  const arms = [
    { name: "페르세우스 팔", ...arm(14_000, rad(200), 1.1, 150), w: 9 },
    { name: "방패-남십자 팔", ...arm(14_000, rad(20), 1.1, 330), w: 9 },
    { name: "궁수-용골 팔", ...arm(11_000, rad(290), 1.05, 30), w: 6 },
    { name: "바깥 팔", ...arm(11_000, rad(110), 1.05, 230), w: 6 },
  ];
  // 돋보기: 태양 둘레 ±450광년
  const Z = 120;
  const zoom = Z / 2 / 450;
  // 은경 l: 0 = 은하 중심 쪽(그림 위), 90 = 회전 방향(그림 왼쪽, 시계 방향 회전에서 태양 자리의 진행 방향)
  const l = rad(261.2);
  const can = {
    x: Z / 2 - Math.sin(l) * CANOPUS_PLANE * zoom,
    y: Z / 2 - Math.cos(l) * CANOPUS_PLANE * zoom,
  };
  const sep = CANOPUS_PLANE / LY_PER_UNIT;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${GW} ${GW + 140}`}
        role="img"
        aria-label="위에서 내려다본 우리 은하 도식. 가운데 막대 모양 중심부에서 나선팔 네 가닥이 휘어 나가고, 중심에서 아래쪽으로 약 2만 6천 7백 광년 떨어진 오리온 팔 안에 태양이 있다. 아래 돋보기 창에서 태양과 카노푸스가 약 310광년 떨어져 함께 오리온 팔 안에 있다."
        className="w-full rounded-2xl bg-[#050912]"
      >
        <defs>
          <radialGradient id="galaxy-core">
            <stop offset="0" stopColor="rgba(255,236,200,0.9)" />
            <stop offset="0.4" stopColor="rgba(255,215,160,0.35)" />
            <stop offset="1" stopColor="rgba(255,200,140,0)" />
          </radialGradient>
          <radialGradient id="galaxy-disk">
            <stop offset="0" stopColor="rgba(150,170,230,0.20)" />
            <stop offset="1" stopColor="rgba(150,170,230,0)" />
          </radialGradient>
        </defs>
        <circle cx={GW / 2} cy={GW / 2} r={GW / 2} fill="url(#galaxy-disk)" />
        <g fill="none" strokeLinecap="round">
          {arms.map((a) => (
            <g key={a.name}>
              <path
                d={a.d}
                stroke="rgba(170,190,255,0.10)"
                strokeWidth={a.w * 2.2}
              />
              <path
                d={a.d}
                stroke="rgba(190,205,255,0.32)"
                strokeWidth={a.w * 0.6}
              />
            </g>
          ))}
          {/* 오리온 팔(국부 팔): 궁수-용골 팔과 페르세우스 팔 사이의 짧은 가지 */}
          <path
            d={`M${sun.x + 34} ${sun.y + 10} Q ${sun.x} ${sun.y + 3} ${sun.x - 38} ${sun.y - 14}`}
            stroke="rgba(255,225,170,0.35)"
            strokeWidth="5"
          />
        </g>
        <g transform={`rotate(-27 ${GW / 2} ${GW / 2})`}>
          <ellipse
            cx={GW / 2}
            cy={GW / 2}
            rx={40}
            ry={13}
            fill="url(#galaxy-core)"
          />
        </g>
        <circle cx={GW / 2} cy={GW / 2} r={22} fill="url(#galaxy-core)" />
        <g fontSize="10" fill="rgba(200,215,255,0.55)">
          <text x={GW / 2} y={GW / 2 - 28} textAnchor="middle">
            은하 중심
          </text>
          {/* 바깥 팔은 이름표를 둘 만한 자리(먼 구간)가 그림 밖이라 이름 없이 둔다 */}
          {arms
            .filter((a) => a.name !== "바깥 팔")
            .map((a) => (
              <text
                key={a.name}
                x={a.label.x}
                y={a.label.y - 9}
                textAnchor="middle"
              >
                {a.name}
              </text>
            ))}
          <text x={sun.x + 30} y={sun.y + 24} fill="rgba(255,225,170,0.8)">
            오리온 팔
          </text>
        </g>
        <circle cx={sun.x} cy={sun.y} r={2.2} fill="#ffe7a8" />
        <text
          x={sun.x - 6}
          y={sun.y - 6}
          fontSize="11"
          fill="#fff"
          textAnchor="end"
        >
          태양 · 카노푸스
        </text>
        <line
          x1={GW / 2}
          y1={GW / 2}
          x2={sun.x}
          y2={sun.y}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="3 4"
        />
        <text
          x={GW / 2 + 6}
          y={(GW / 2 + sun.y) / 2}
          fontSize="9"
          fill="rgba(255,255,255,0.45)"
        >
          약 2만 6천 7백 광년
        </text>

        {/* 돋보기 */}
        <g transform={`translate(${GW / 2 - Z / 2 - 60} ${GW + 10})`}>
          <rect
            width={Z}
            height={Z}
            rx="12"
            fill="#070d1a"
            stroke="rgba(255,225,170,0.45)"
          />
          <path
            d={`M0 ${Z * 0.62} Q ${Z / 2} ${Z * 0.5} ${Z} ${Z * 0.3}`}
            stroke="rgba(255,225,170,0.18)"
            strokeWidth="38"
            fill="none"
          />
          {[100, 300].map((r) => (
            <circle
              key={r}
              cx={Z / 2}
              cy={Z / 2}
              r={r * zoom}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="2 3"
            />
          ))}
          <circle cx={Z / 2} cy={Z / 2} r={2.6} fill="#ffe7a8" />
          <circle cx={can.x} cy={can.y} r={2.6} fill={rgb(tempColor(7500))} />
          <g fontSize="9" fill="rgba(255,255,255,0.8)">
            <text x={Z / 2 + 5} y={Z / 2 - 4}>
              태양
            </text>
            <text x={can.x + 5} y={can.y + 11}>
              카노푸스
            </text>
            <text
              x={Z / 2 + 300 * zoom - 2}
              y={Z / 2 + 3}
              fontSize="7"
              fill="rgba(255,255,255,0.45)"
              textAnchor="end"
            >
              300광년
            </text>
          </g>
        </g>
        <line
          x1={sun.x}
          y1={sun.y}
          x2={GW / 2 - 60}
          y2={GW + 10}
          stroke="rgba(255,225,170,0.3)"
        />
        <g fontSize="10" fill="rgba(200,215,255,0.6)">
          <text x={GW / 2 + 16} y={GW + 40}>
            태양 둘레 돋보기
          </text>
          <text x={GW / 2 + 16} y={GW + 56}>
            (가로세로 약 900광년)
          </text>
        </g>
      </svg>
      <figcaption className="text-white/60 text-xs">
        은하 지름을 이 그림의 폭으로 그리면 태양과 카노푸스 사이는 폭의 약{" "}
        {Math.round(GW / sep)}분의 1, 휴대폰 화면에서 1픽셀이 되지 않습니다.
        밤하늘에서 두 번째로 밝은 별도 은하 전체로 보면 바로 이웃입니다. 둘은
        함께 오리온 팔 안에 있습니다.
      </figcaption>
    </figure>
  );
}

/** 태양 둘레 밝은 별의 3차원 배치(끌어서 돌리기). 거리는 제곱근 눈금으로 줄여 가까운 별과 먼 별을 한 그림에 */
export function NearbyStars3D() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = BODIES.map((b) => {
      const r = Math.sqrt(b.ly);
      return {
        b,
        x: r * Math.cos(rad(b.dec)) * Math.cos(rad(b.ra)),
        y: r * Math.cos(rad(b.dec)) * Math.sin(rad(b.ra)),
        z: r * Math.sin(rad(b.dec)),
      };
    });
    // 처음 보는 방향: 카노푸스가 잘 보이게
    let yaw = rad(-60);
    let pitch = rad(-20);
    let vy = 0;
    let vp = 0;
    let drag: { x: number; y: number } | null = null;
    let frame = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = Math.min(w, h) / 2 / Math.sqrt(900);
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const view = (x: number, y: number, z: number) => {
        const x1 = x * cy - y * sy;
        const y1 = x * sy + y * cy;
        const y2 = y1 * cp - z * sp;
        const z2 = y1 * sp + z * cp;
        const f = 1 / (1 + y2 / 160);
        return { sx: w / 2 + x1 * s * f, sy: h / 2 - z2 * s * f, depth: y2, f };
      };
      // 거리 고리(적도면)
      ctx.lineWidth = 1;
      for (const ly of [10, 100, 300, 900]) {
        const r = Math.sqrt(ly);
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * 2 * Math.PI;
          const p = view(r * Math.cos(a), r * Math.sin(a), 0);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = "rgba(160,190,255,0.16)";
        ctx.stroke();
        const p = view(r, 0, 0);
        ctx.fillStyle = "rgba(200,215,255,0.45)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`${ly}광년`, p.sx + 3, p.sy - 3);
      }
      const sun = view(0, 0, 0);
      const canopus = pts[0] as (typeof pts)[number];
      const cv = view(canopus.x, canopus.y, canopus.z);
      ctx.strokeStyle = "rgba(255,225,170,0.55)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sun.sx, sun.sy);
      ctx.lineTo(cv.sx, cv.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      const order = pts
        .map((p) => ({ p, v: view(p.x, p.y, p.z) }))
        .sort((a, b) => b.v.depth - a.v.depth);
      for (const { p, v } of order) {
        const isCan = p.b.ko === "카노푸스";
        const r =
          Math.max(1.4, (2.6 - 0.45 * p.b.mag) * v.f) * (isCan ? 1.4 : 1);
        const col = tempColor(p.b.k);
        if (isCan) {
          const g = ctx.createRadialGradient(v.sx, v.sy, 0, v.sx, v.sy, r * 6);
          g.addColorStop(0, rgb(col, 0.8));
          g.addColorStop(1, rgb(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(v.sx, v.sy, r * 6, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.fillStyle = rgb(col, 0.95);
        ctx.beginPath();
        ctx.arc(v.sx, v.sy, r, 0, 2 * Math.PI);
        ctx.fill();
        if (!LABELED_3D.has(p.b.ko)) continue;
        ctx.fillStyle = isCan ? "#fff" : "rgba(220,230,255,0.55)";
        ctx.font = `${isCan ? "bold 12px" : "10px"} system-ui, sans-serif`;
        ctx.fillText(p.b.ko, v.sx + r + 3, v.sy - r - 1);
      }
      ctx.fillStyle = "#ffe7a8";
      ctx.beginPath();
      ctx.arc(sun.sx, sun.sy, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,200,0.9)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillText("태양", sun.sx - 30, sun.sy + 16);
    };
    const tick = () => {
      if (!drag && (Math.abs(vy) > 0.0002 || Math.abs(vp) > 0.0002)) {
        yaw += vy;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + vp));
        vy *= 0.9;
        vp *= 0.9;
        draw();
        frame = requestAnimationFrame(tick);
      } else frame = 0;
    };
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) * 0.008;
      const dy = (e.clientY - drag.y) * 0.008;
      yaw -= dx;
      pitch = Math.max(-1.4, Math.min(1.4, pitch - dy));
      vy = -dx;
      vp = -dy;
      drag = { x: e.clientX, y: e.clientY };
      draw();
    };
    const up = () => {
      drag = null;
      if (!reduce && !frame) frame = requestAnimationFrame(tick);
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
  }, []);
  return (
    <figure className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label="태양을 가운데 두고 밝은 별 스물네 개를 실제 방향과 거리로 놓은 3차원 그림. 시리우스는 태양 바로 곁 8.6광년에, 카노푸스는 약 310광년 떨어진 곳에 있다. 끌어서 돌려 볼 수 있다."
        data-nearby-3d
        className="aspect-square w-full touch-none rounded-2xl bg-[#050912]"
      />
      <figcaption className="text-white/60 text-xs">
        카노푸스는 하늘에서 시리우스 다음으로 밝지만, 실제로는 시리우스보다 약
        36배 멀리 있습니다. 그만큼 스스로 내는 빛이 훨씬 셉니다. 거리는 제곱근
        눈금으로 줄여 그렸고, 고리는 지구 적도면에 놓았습니다.
      </figcaption>
    </figure>
  );
}
