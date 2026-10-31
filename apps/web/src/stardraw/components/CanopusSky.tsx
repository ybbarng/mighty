"use client";

import { useId, useMemo, useState } from "react";

import {
  apparentAltitude,
  extinction,
  MARADO,
  type Place,
  SEOUL,
  toHorizontal,
  transitAfterNoon,
} from "../astro";
import data from "../canopus-sky.json";
import { tempColor } from "../sky";

/** 카노푸스 둘레의 실제 별(Bright Star Catalogue 5판)과 별자리 선(d3-celestial, BSD). 출처는 데이터 파일 source 칸 */
interface Star {
  hr: number;
  ra: number;
  dec: number;
  mag: number;
  k: number;
  name?: string;
}
const STARS = data.stars as Star[];
const LINES = data.lines as { con: string; pts: [number, number][] }[];
const CANOPUS = data.canopus;
export const CANOPUS_SKY_SOURCE = data.source;

const NAMES: Record<string, string> = {
  Canopus: "카노푸스",
  Sirius: "시리우스",
  Rigel: "리겔",
  Betelgeuse: "베텔게우스",
  Achernar: "아케르나르",
  Procyon: "프로키온",
  Adhara: "아다라",
};
/** 성도에 이름을 적을 별자리 */
const LABELED = new Set([
  "용골자리",
  "고물자리",
  "돛자리",
  "큰개자리",
  "오리온자리",
  "비둘기자리",
  "토끼자리",
  "화가자리",
  "황새치자리",
  "남십자자리",
  "센타우루스자리",
  "에리다누스자리",
]);

const rad = (d: number) => (d * Math.PI) / 180;
const rgb = ([r, g, b]: [number, number, number], a = 1) =>
  `rgba(${r}, ${g}, ${b}, ${a})`;
/** 별 크기(밝기 등급 → 그림 반지름) */
const sizeOf = (mag: number, scale = 1) =>
  Math.max(0.35, (3.1 - 0.52 * mag) * scale);

/** 카노푸스의 빛: 번짐과 ＋ 빛줄기(게임 하늘의 켜진 별과 같은 결) */
function Glow({
  x,
  y,
  r,
  color,
  rays = true,
}: {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  rays?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <g className="sd-canopus-glow">
      <defs>
        <radialGradient id={`g${id}`}>
          <stop offset="0" stopColor={rgb(color, 0.9)} />
          <stop offset="0.35" stopColor={rgb(color, 0.35)} />
          <stop offset="1" stopColor={rgb(color, 0)} />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={r * 7} fill={`url(#g${id})`} />
      {rays && (
        <g stroke={rgb(color, 0.7)} strokeLinecap="round">
          <line
            x1={x - r * 9}
            y1={y}
            x2={x + r * 9}
            y2={y}
            strokeWidth={r * 0.35}
          />
          <line
            x1={x}
            y1={y - r * 9}
            x2={x}
            y2={y + r * 9}
            strokeWidth={r * 0.35}
          />
        </g>
      )}
      <circle cx={x} cy={y} r={r} fill="#fff" />
    </g>
  );
}

/**
 * 실제 성도: 카노푸스를 가운데 둔 입체 투영(동쪽이 왼쪽, 하늘을 올려다본 모습). 은은한 적경·적위 격자와 별자리 이름,
 * 서울·마라도에서 떠오르는 별의 남쪽 끝(그 위도에서 남중 때 지평선에 닿는 적위)을 함께 그린다
 */
export function CanopusChart() {
  const S = 400;
  const R = 52; // 가장자리까지의 각도
  const k = S / 2 / (2 * Math.tan(rad(R) / 2));
  const project = (ra: number, dec: number) => {
    const d = rad(ra - CANOPUS.ra);
    const δ = rad(dec);
    const δ0 = rad(CANOPUS.dec);
    const cosc =
      Math.sin(δ0) * Math.sin(δ) + Math.cos(δ0) * Math.cos(δ) * Math.cos(d);
    const f = (2 * k) / (1 + cosc);
    return {
      x: S / 2 - f * Math.cos(δ) * Math.sin(d),
      y:
        S / 2 -
        f *
          (Math.cos(δ0) * Math.sin(δ) -
            Math.sin(δ0) * Math.cos(δ) * Math.cos(d)),
      inside: cosc > Math.cos(rad(R + 2)),
    };
  };
  /** 점들을 SVG 경로로: 테두리 밖으로 나간 구간에서 끊는다(끊지 않으면 반대편 점과 곧은 선으로 이어진다) */
  const pathOf = (pts: { x: number; y: number; inside: boolean }[]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (!p.inside) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const decCircle = (dec: number) => {
    const pts = [];
    for (let ra = 0; ra <= 360; ra += 2) pts.push(project(ra, dec));
    return pathOf(pts);
  };
  const raLine = (ra: number) => {
    const pts = [];
    for (let dec = -89; dec <= 10; dec += 2) pts.push(project(ra, dec));
    return pathOf(pts);
  };
  const limits = [
    { place: SEOUL, label: "서울에서 떠오르는 남쪽 끝" },
    { place: MARADO, label: "마라도에서 떠오르는 남쪽 끝" },
  ];
  const canopus = project(CANOPUS.ra, CANOPUS.dec);
  const clipId = `c${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label="카노푸스 둘레의 실제 성도. 가운데 카노푸스가 빛나고, 위쪽에 시리우스와 큰개자리, 왼쪽 위에 오리온자리가 보인다. 서울에서 떠오르는 별의 남쪽 끝 선이 카노푸스 바로 위를 지난다."
      className="w-full rounded-2xl bg-[#060b16]"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={S / 2} cy={S / 2} r={S / 2 - 1} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g stroke="rgba(160,190,255,0.10)" fill="none" strokeWidth="0.6">
          {[-80, -70, -60, -50, -40, -30, -20, -10, 0].map((d) => (
            <path key={d} d={decCircle(d)} />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
            <path key={h} d={raLine(h * 15 + 30)} />
          ))}
        </g>
        {limits.map((l, i) => {
          return (
            <g key={l.label}>
              <path
                d={decCircle(l.place.lat - 90)}
                fill="none"
                stroke={
                  i === 0 ? "rgba(255,190,120,0.55)" : "rgba(120,220,200,0.5)"
                }
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            </g>
          );
        })}
        <g stroke="rgba(170,200,255,0.28)" strokeWidth="0.8" fill="none">
          {LINES.map((l, i) => {
            const pts = l.pts.map(([ra, dec]) => project(ra, dec));
            if (!pts.some((p) => p.inside)) return null;
            return (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: 고정 데이터의 차례
                key={i}
                d={pathOf(pts)}
              />
            );
          })}
        </g>
        {STARS.map((s) => {
          if (s.hr === 2326) return null;
          const p = project(s.ra, s.dec);
          if (!p.inside) return null;
          return (
            <circle
              key={s.hr}
              cx={p.x}
              cy={p.y}
              r={sizeOf(s.mag, 0.85)}
              fill={rgb(tempColor(s.k), Math.min(1, 1.25 - s.mag * 0.16))}
            />
          );
        })}
        <Glow x={canopus.x} y={canopus.y} r={3.2} color={tempColor(7500)} />
        <g fill="rgba(200,215,255,0.38)" fontSize="9" textAnchor="middle">
          {[...LABELED].map((con) => {
            const pts = LINES.filter((l) => l.con === con)
              .flatMap((l) => l.pts)
              .map(([ra, dec]) => project(ra, dec))
              .filter((p) => p.inside);
            if (pts.length < 2) return null;
            const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            return (
              <text key={con} x={x} y={y + 12}>
                {con}
              </text>
            );
          })}
        </g>
        <g fill="rgba(255,255,255,0.78)" fontSize="10">
          {STARS.filter((s) => s.name && NAMES[s.name] && s.hr !== 2326).map(
            (s) => {
              const p = project(s.ra, s.dec);
              if (!p.inside) return null;
              return (
                <text key={s.hr} x={p.x + 5} y={p.y - 4}>
                  {NAMES[s.name as string]}
                </text>
              );
            },
          )}
          <text
            x={canopus.x - 12}
            y={canopus.y - 14}
            textAnchor="end"
            fontWeight="700"
            fill="#fff"
          >
            카노푸스
          </text>
        </g>
        <g fontSize="8.5">
          {limits.map((l, i) => {
            const p = project(
              CANOPUS.ra + (i === 0 ? -34 : 30),
              l.place.lat - 90,
            );
            return (
              <text
                key={l.label}
                x={p.x}
                y={p.y - 4}
                fill={
                  i === 0 ? "rgba(255,200,140,0.85)" : "rgba(140,230,210,0.85)"
                }
                textAnchor="middle"
              >
                {l.label}
              </text>
            );
          })}
        </g>
      </g>
      <circle
        cx={S / 2}
        cy={S / 2}
        r={S / 2 - 1}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
      />
    </svg>
  );
}

/**
 * 고를 수 있는 밤(그날 밤 남중 시각이 어두운 때인 날들). 이름은 "그날 밤": 자정을 넘겨 남중하면 아래 문구의 날짜가
 * 하루 뒤라(1월 4일 밤 → 1월 5일 0시 02분) 칩에 "밤"을 붙여 어긋나 보이지 않게 한다
 */
const NIGHTS = [
  { label: "11월 15일 밤", y: 2026, m: 10, d: 15 },
  { label: "12월 15일 밤", y: 2026, m: 11, d: 15 },
  { label: "1월 4일 밤", y: 2027, m: 0, d: 4 },
  { label: "2월 1일 밤", y: 2027, m: 1, d: 1 },
  { label: "3월 1일 밤", y: 2027, m: 2, d: 1 },
] as const;
const DEFAULT_NIGHT = 2;

const KST = 9 * 3_600_000;
function kstLabel(ms: number): string {
  const t = new Date(ms + KST);
  return `${t.getUTCFullYear()}년 ${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${t.getUTCHours()}시 ${String(t.getUTCMinutes()).padStart(2, "0")}분`;
}

/** 대기를 지나며 붉어진 별빛: 어두워진 만큼 주황빛 쪽으로 섞는다(과장하지 않게 절반까지) */
function reddened(k: number, dim: number): [number, number, number] {
  const [r, g, b] = tempColor(k);
  const t = Math.min(0.5, dim / 6);
  return [
    Math.round(r + (255 - r) * t),
    Math.round(g + (175 - g) * t),
    Math.round(b + (110 - b) * t),
  ];
}

/**
 * 남쪽을 바라본 수평 시야(방위 120~240°, 고도 −9~38°). 그 곳에서 카노푸스가 남중하는 순간의 실제 별을
 * 고도·방위로 계산해 그리고(굴절 포함), 낮은 별은 대기에 흡수된 만큼 어둡고 붉게. 바다면 수면 반영
 */
function SouthView({
  place,
  ms,
  sea,
  compact = false,
}: {
  place: Place;
  ms: number;
  sea: boolean;
  compact?: boolean;
}) {
  const W = 600;
  const H = compact ? 200 : 300;
  const AZ0 = 120;
  const AZ1 = 240;
  const ALT_TOP = compact ? 24 : 38;
  const ALT_BOTTOM = compact ? -5 : -9;
  const x = (az: number) => ((az - AZ0) / (AZ1 - AZ0)) * W;
  const y = (alt: number) => ((ALT_TOP - alt) / (ALT_TOP - ALT_BOTTOM)) * H;
  const horizon = y(0);
  const id = useId().replace(/:/g, "");
  const stars = STARS.map((s) => {
    const h = toHorizontal(s.ra, s.dec, place, ms);
    const alt = apparentAltitude(h.alt);
    return { s, alt, az: h.az };
  }).filter((p) => p.alt > -0.3 && p.az > AZ0 - 2 && p.az < AZ1 + 2);
  const can = stars.find((p) => p.s.hr === 2326);
  const lines = LINES.map((l) =>
    l.pts.map(([ra, dec]) => {
      const h = toHorizontal(ra, dec, place, ms);
      return { alt: apparentAltitude(h.alt), az: h.az };
    }),
  ).filter((pts) => pts.some((p) => p.alt > 0 && p.az > AZ0 && p.az < AZ1));
  const canDim = can ? extinction(can.alt) : 0;
  const canColor = can ? reddened(7500, canDim) : tempColor(7500);
  const canR = can ? sizeOf(-0.72 + canDim, 1.15) : 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-2xl"
      role="img"
      aria-label={
        can
          ? `${place.name}에서 남쪽을 바라본 하늘. 카노푸스가 남쪽 수평선 위 약 ${can.alt.toFixed(1)}도 높이에 주황빛으로 낮게 떠 있다.`
          : `${place.name}에서 남쪽을 바라본 하늘. 카노푸스는 지평선 아래에 있어 보이지 않는다.`
      }
    >
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050a16" />
          <stop offset="0.85" stopColor="#0d1830" />
          <stop offset="1" stopColor="#1a2440" />
        </linearGradient>
        <linearGradient id={`sea${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1428" />
          <stop offset="1" stopColor="#03060d" />
        </linearGradient>
        <linearGradient id={`glint${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rgb(canColor, 0.45)} />
          <stop offset="1" stopColor={rgb(canColor, 0)} />
        </linearGradient>
      </defs>
      <rect width={W} height={horizon} fill={`url(#sky${id})`} />
      <rect
        y={horizon}
        width={W}
        height={H - horizon}
        fill={sea ? `url(#sea${id})` : "#05070c"}
      />
      <g stroke="rgba(170,200,255,0.22)" strokeWidth="0.8" fill="none">
        {lines.map((pts, i) => (
          <polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정 데이터의 차례
            key={i}
            points={pts
              .filter((p) => p.alt > -1)
              .map((p) => `${x(p.az).toFixed(1)},${y(p.alt).toFixed(1)}`)
              .join(" ")}
          />
        ))}
      </g>
      {stars.map(({ s, alt, az }) => {
        if (s.hr === 2326) return null;
        const dim = extinction(alt);
        const mag = s.mag + dim;
        if (mag > 5.2) return null;
        return (
          <circle
            key={s.hr}
            cx={x(az)}
            cy={y(alt)}
            r={sizeOf(mag, 0.9)}
            fill={rgb(reddened(s.k, dim), Math.min(1, 1.2 - mag * 0.16))}
          />
        );
      })}
      {can && sea && (
        <rect
          x={x(can.az) - 2.5}
          y={horizon + 1}
          width={5}
          height={(H - horizon) * 0.8}
          fill={`url(#glint${id})`}
          className="sd-canopus-glint"
        />
      )}
      {can && can.alt > 0 && (
        <>
          <Glow
            x={x(can.az)}
            y={y(can.alt)}
            r={Math.max(1.6, canR)}
            color={canColor}
            rays={false}
          />
          <text
            x={x(can.az) + 8}
            y={y(can.alt) - 8}
            fontSize={compact ? 13 : 12}
            fill="rgba(255,255,255,0.85)"
          >
            카노푸스 {can.alt.toFixed(1)}°
          </text>
        </>
      )}
      <line
        x1="0"
        x2={W}
        y1={horizon}
        y2={horizon}
        stroke="rgba(200,215,255,0.35)"
        strokeWidth="1"
      />
      <g fontSize="11" fill="rgba(200,215,255,0.5)" textAnchor="middle">
        <text x={x(135)} y={H - 6}>
          남동
        </text>
        <text x={x(180)} y={H - 6}>
          남
        </text>
        <text x={x(225)} y={H - 6}>
          남서
        </text>
      </g>
    </svg>
  );
}

/** 마라도에서 본 남쪽 하늘(날짜 고르기)과 같은 밤 서울의 남쪽 하늘 */
export function JejuSky() {
  const [night, setNight] = useState<number>(DEFAULT_NIGHT);
  const n = NIGHTS[night] ?? NIGHTS[DEFAULT_NIGHT];
  const day = Date.UTC(n.y, n.m, n.d) - KST + 12 * 3_600_000;
  const jeju = useMemo(() => transitAfterNoon(CANOPUS.ra, MARADO, day), [day]);
  const seoul = useMemo(() => transitAfterNoon(CANOPUS.ra, SEOUL, day), [day]);
  return (
    <div className="flex flex-col gap-3" data-jeju-sky>
      <SouthView place={MARADO} ms={jeju} sea />
      <p className="text-center text-white/60 text-xs">
        {kstLabel(jeju)}, 마라도에서 남쪽 바다를 바라본 하늘
      </p>
      <fieldset className="flex flex-wrap justify-center gap-1.5">
        <legend className="sr-only">날짜</legend>
        {NIGHTS.map((v, i) => (
          <button
            key={v.label}
            type="button"
            aria-pressed={i === night}
            onClick={() => setNight(i)}
            className={
              i === night
                ? "rounded-full border border-amber-200/60 bg-amber-200/15 px-3 py-1 text-amber-50 text-xs"
                : "rounded-full border border-white/15 px-3 py-1 text-white/60 text-xs hover:bg-white/10"
            }
          >
            {v.label}
          </button>
        ))}
      </fieldset>
      <SouthView place={SEOUL} ms={seoul} sea={false} compact />
      <p className="text-center text-white/60 text-xs">
        같은 밤 {kstLabel(seoul).replace(/^\d+년 /, "")}, 서울에서 남쪽을 바라본
        하늘
      </p>
    </div>
  );
}
