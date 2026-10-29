import { createRng, nextFloat } from "@mighty/engine";

import { ballColor, SKY_LINES, SKY_STARS, starRadius, tempColor } from "./sky";
import { type Meteor, type Twinkle, twinkleLevel } from "./sky-effects";

/**
 * 네모 하늘 그리기(응모·영수증·추첨이 같이 쓴다, docs/36 11-3).
 * - 응모(pick): 고른 별은 금빛 고리, 누른 별의 별자리는 환하게 이름까지, 고른 별의 별자리는 조금 밝게
 * - 영수증(receipt): 내 별 6개만 밝게, 나머지 별과 별자리 선은 더 흐리게
 * - 추첨(draw): 나온 당첨 번호 별이 켜지고(보너스는 점선 고리), 내 별과 겹치면 더 강조
 */

export type SkyMode = "pick" | "receipt" | "draw";

export interface SkyState {
  mode: SkyMode;
  picked: readonly number[];
  focus: number | null;
  /** 추첨에서 지금까지 나온 당첨 번호 */
  lit: readonly number[];
  /** 추첨에서 나온 보너스(아직이면 null) */
  bonus: number | null;
  /** 차례가 있는 별(당첨자 확인의 별 세 개): ①②③을 단다 */
  marks?: readonly number[];
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

/** 어두운 별(별자리 선 꼭짓점) */
export const FAINT_STARS: readonly { x: number; y: number; con: string }[] =
  SKY_LINES.flatMap((line) =>
    line.pts.map(([x, y]) => ({ x, y, con: line.con })),
  );

/** 배경 잔별(번호 없는, 늘 같은 자리) */
const DUST = (() => {
  const rng = createRng(45);
  return Array.from({ length: 220 }, () => ({
    x: nextFloat(rng),
    y: nextFloat(rng),
    r: nextFloat(rng) * 0.8 + 0.2,
    a: 0.12 + nextFloat(rng) * 0.35,
  }));
})();

/** 판 너비 360px을 기준으로 그린 크기를 늘리고 줄인다(작은 영수증 그림도 같은 모양) */
export function scaleOf(width: number): number {
  return Math.max(0.55, Math.min(1.6, width / 360));
}

/** 번호 공(별 아래) 가운데까지의 거리 */
function labelOffset(r: number, scale: number): number {
  return r + 11 * scale;
}

/** 이 자리(px)에 있는 별 번호. 별이나 그 아래 번호 공을 누르면 된다 */
export function starAt(x: number, y: number, width: number): number | null {
  const scale = scaleOf(width);
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of SKY_STARS) {
    const px = s.x * width;
    const py = s.y * width;
    const r = starRadius(s.mag) * scale;
    const d = Math.min(
      Math.hypot(px - x, py - y),
      Math.hypot(px - x, py + labelOffset(r, scale) - y),
    );
    if (d < bestD) {
      bestD = d;
      best = s.n;
    }
  }
  return bestD < 22 * scale ? best : null;
}

export interface FrameInput {
  width: number;
  state: SkyState;
  now: number;
  twinkles: readonly Twinkle[];
  meteor: Meteor | null;
}

export function drawSky(g: CanvasRenderingContext2D, f: FrameInput): void {
  const { width: W, state, now, twinkles } = f;
  const scale = scaleOf(W);
  const receipt = state.mode === "receipt";
  const picked = new Set([...state.picked, ...(state.marks ?? [])]);
  const lit = new Set(state.lit);
  g.clearRect(0, 0, W, W);

  for (const d of DUST) {
    g.fillStyle = `rgba(200,210,240,${receipt ? d.a * 0.6 : d.a})`;
    g.beginPath();
    g.arc(d.x * W, d.y * W, d.r * scale, 0, Math.PI * 2);
    g.fill();
  }

  // 별자리 선: 평소엔 아주 흐리게, 고른(영수증은 내) 별의 별자리는 조금 밝게, 누른 별의 별자리는 환하게
  const focusCon =
    state.focus && state.mode === "pick"
      ? (SKY_STARS[state.focus - 1]?.con ?? null)
      : null;
  const pickedCons = new Set(
    [...picked].map((n) => SKY_STARS[n - 1]?.con).filter(Boolean),
  );
  const levelOf = (con: string) =>
    con === focusCon ? 2 : pickedCons.has(con) ? 1 : 0;
  const lineColors = receipt
    ? ["rgba(150,172,240,0.08)", "rgba(160,182,245,0.28)", ""]
    : [
        "rgba(150,172,240,0.16)",
        "rgba(160,182,245,0.34)",
        "rgba(185,205,255,0.75)",
      ];
  g.lineJoin = "round";
  for (const line of SKY_LINES) {
    const level = levelOf(line.con);
    g.strokeStyle = lineColors[level] as string;
    g.lineWidth = (level === 2 ? 1.4 : 1) * Math.min(1, scale);
    g.beginPath();
    line.pts.forEach(([x, y], i) => {
      if (i === 0) g.moveTo(x * W, y * W);
      else g.lineTo(x * W, y * W);
    });
    g.stroke();
  }
  FAINT_STARS.forEach((p, i) => {
    const level = levelOf(p.con);
    const a = receipt ? 0 : twinkleLevel(twinkles, "faint", i, now);
    const base = receipt ? [0.18, 0.4, 0.4][level] : [0.32, 0.5, 0.85][level];
    const x = p.x * W;
    const y = p.y * W;
    g.fillStyle = `rgba(225,232,255,${Math.min(1, (base as number) + 0.6 * a)})`;
    g.beginPath();
    g.arc(
      x,
      y,
      (level === 2 ? 1.4 : 1.1) * (1 + 0.8 * a) * Math.min(1, scale),
      0,
      Math.PI * 2,
    );
    g.fill();
    if (a > 0.05) {
      const glow = g.createRadialGradient(x, y, 0, x, y, 6);
      glow.addColorStop(0, `rgba(225,232,255,${0.35 * a})`);
      glow.addColorStop(1, "rgba(225,232,255,0)");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
  if (focusCon) {
    const pts = SKY_LINES.filter((l) => l.con === focusCon).flatMap(
      (l) => l.pts,
    );
    if (pts.length) {
      const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
      const minY = Math.min(...pts.map(([, y]) => y));
      g.fillStyle = "rgba(195,212,255,0.95)";
      g.font = `${Math.round(12 * Math.min(1.2, scale))}px sans-serif`;
      g.textAlign = "center";
      g.fillText(
        focusCon,
        Math.min(W - 50, Math.max(50, cx * W)),
        Math.max(14, minY * W - 14),
      );
    }
  }

  for (const s of SKY_STARS) {
    const x = s.x * W;
    const y = s.y * W;
    const [cr, cg, cb] = tempColor(s.k);
    const mine = picked.has(s.n);
    const drawn = lit.has(s.n);
    const isBonus = state.bonus === s.n;
    const hit = mine && (drawn || isBonus);
    const dim = receipt && !mine;
    const a = receipt ? 0 : twinkleLevel(twinkles, "star", s.n, now);
    const r =
      starRadius(s.mag) *
      scale *
      (1 + 0.35 * a) *
      (mine ? 1.15 : 1) *
      (drawn || isBonus ? 1.25 : 1);
    g.globalAlpha = dim ? 0.3 : 1;

    // 추첨: 켜진 당첨 별은 금빛 빛무리와 고리(내 별과 겹치면 더 크게 맥동)
    if (drawn || isBonus) {
      const pulse = 0.65 + 0.35 * Math.sin(now / 260 + s.n);
      const reach = (hit ? 34 : 26) * scale;
      const halo = g.createRadialGradient(x, y, 0, x, y, reach);
      halo.addColorStop(
        0,
        hit ? `rgba(255,236,150,${0.85 * pulse})` : "rgba(255,222,130,0.62)",
      );
      halo.addColorStop(
        0.45,
        hit ? "rgba(255,226,120,0.22)" : "rgba(244,210,122,0.14)",
      );
      halo.addColorStop(1, "rgba(244,210,122,0)");
      g.fillStyle = halo;
      g.beginPath();
      g.arc(x, y, reach, 0, Math.PI * 2);
      g.fill();
      if (!isBonus) {
        g.strokeStyle = "rgba(255,226,140,0.9)";
        g.lineWidth = 2 * Math.min(1.2, scale);
        g.beginPath();
        g.arc(x, y, r + 8 * scale, 0, Math.PI * 2);
        g.stroke();
      }
    }

    const glowR = r * (s.mag < 1 ? 4.2 : 3);
    const glow = g.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.38 + 0.3 * a})`);
    glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, glowR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgb(${cr},${cg},${cb})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * a})`;
    g.beginPath();
    g.arc(x, y, r * 0.45, 0, Math.PI * 2);
    g.fill();

    // 밝은 별은 반짝일 때 십자 빛살
    if (a > 0 && s.mag < 1.6) {
      const len = a * (10 + 6 * (1.6 - s.mag)) * scale;
      g.lineWidth = 0.8;
      for (const [dx, dy, m] of [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1.15],
        [0, -1, 1.15],
      ] as const) {
        const ex = x + dx * len * m;
        const ey = y + dy * len * m;
        const lg = g.createLinearGradient(x, y, ex, ey);
        lg.addColorStop(0, `rgba(255,255,255,${a})`);
        lg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        g.strokeStyle = lg;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(ex, ey);
        g.stroke();
      }
    }

    // 고리: 내 별은 금빛, 추첨에서 내 별이 당첨 번호면 두 겹, 보너스는 점선
    if (mine) {
      g.strokeStyle = "rgba(244,210,122,0.95)";
      g.lineWidth = 1.5 * Math.min(1.2, scale);
      g.beginPath();
      g.arc(x, y, r + 6 * scale, 0, Math.PI * 2);
      g.stroke();
    }
    if (hit) {
      g.strokeStyle = "rgba(134,239,172,0.95)";
      g.lineWidth = 2 * Math.min(1.2, scale);
      g.beginPath();
      g.arc(x, y, r + 10 * scale, 0, Math.PI * 2);
      g.stroke();
    }
    if (isBonus) {
      g.strokeStyle = "rgba(244,210,122,0.9)";
      g.setLineDash([3, 3]);
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, r + 13 * scale, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (state.mode === "pick" && state.focus === s.n) {
      g.strokeStyle = "rgba(232,236,246,0.6)";
      g.setLineDash([3, 3]);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r + 10 * scale, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }

    // 번호(로또 공 색 작은 공)
    const ly = y + labelOffset(r, scale);
    const br = 8 * scale;
    g.fillStyle = ballColor(s.n);
    g.globalAlpha = dim ? 0.25 : mine || drawn || isBonus ? 1 : 0.8;
    g.beginPath();
    g.arc(x, ly, br, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = dim ? 0.4 : 1;
    g.fillStyle = "#1a1a1a";
    g.font = `600 ${Math.max(7, Math.round(9 * scale))}px ui-monospace, Menlo, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(s.n), x, ly + 0.5);
    g.textBaseline = "alphabetic";
    g.globalAlpha = 1;
  }

  // 차례 표시(①②③): 별 위에 금빛 동그라미 숫자
  (state.marks ?? []).forEach((n, i) => {
    const s = SKY_STARS[n - 1];
    if (!s) return;
    const x = s.x * W;
    const y = s.y * W;
    const r = starRadius(s.mag) * scale;
    const halo = g.createRadialGradient(x, y, 0, x, y, r * 7);
    halo.addColorStop(0, "rgba(255,236,150,0.55)");
    halo.addColorStop(1, "rgba(255,236,150,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r * 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,240,190,0.98)";
    g.font = `700 ${Math.round(16 * Math.min(1.3, scale))}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText(CIRCLED[i] ?? String(i + 1), x, y - r - 9 * scale);
  });

  const m = f.meteor;
  if (m && !receipt) {
    const t = Math.min(1, Math.max(0, (now - m.start) / m.duration));
    const went = m.distance * W * (1 - (1 - t) ** 1.6);
    const tail = Math.min(went, m.tail * W);
    const hx = m.x * W + m.dx * went;
    const hy = m.y * W + m.dy * went;
    const alpha = t < 0.6 ? 1 : (1 - t) / 0.4;
    if (tail > 0) {
      const lg = g.createLinearGradient(
        hx - m.dx * tail,
        hy - m.dy * tail,
        hx,
        hy,
      );
      lg.addColorStop(0, "rgba(200,220,255,0)");
      lg.addColorStop(1, `rgba(240,245,255,${0.85 * alpha})`);
      g.strokeStyle = lg;
      g.lineWidth = 1.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(hx - m.dx * tail, hy - m.dy * tail);
      g.lineTo(hx, hy);
      g.stroke();
    }
  }
}
