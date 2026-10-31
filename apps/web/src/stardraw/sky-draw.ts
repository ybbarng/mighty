import { createRng, nextFloat } from "@mighty/engine";

import { SKY_LINES, SKY_STARS, starRadius, tempColor } from "./sky";
import { type Meteor, type Twinkle, twinkleLevel } from "./sky-effects";

/**
 * 네모 하늘 그리기(응모·영수증·추첨이 같이 쓴다, docs/36 11-3).
 * 별은 구슬이 아니라 진짜 별처럼: 아주 작고 또렷한 점 + 빠르게 줄어드는 흐린 빛 번짐. 밝기는 점 크기가 아니라 빛 번짐의 반지름·세기로,
 * 색은 표면 온도의 별빛 색(흑체 근사, 채도 낮게)으로 낸다. 강조는 큰 원 대신 빛 번짐이 커지고 가는 십자 빛줄기가 뻗는다.
 * - 응모(pick): 고른 별은 금빛 고리, 누른 별의 별자리는 환하게 이름까지, 고른 별의 별자리는 조금 밝게.
 *   가끔 무작위 별 하나에 십자 빛줄기가 잠깐 서고(sky-effects), 가장 밝은 별 넷은 아주 가는 빛줄기를 늘 두고 미세하게 깜빡인다
 * - 영수증(receipt): 내 별 6개만 밝게, 나머지 별과 별자리 선은 더 흐리게
 * - 추첨(draw): 모든 별의 빛을 끈 하늘에서 룰렛 불빛(cursor)이 돌고, 멈춘 당첨 별만 켜진 채 남는다.
 *   보너스는 하늘빛, 내 별(파란 고리)이 당첨 번호면 고리 안의 별빛이 맥동한다. 반짝임·유성은 돌지 않는다
 *
 * 휴대폰 비용: 상태가 같으면 바탕 층(먼지·선·별)과 위 층(고리·번호)을 미리 그려 두고,
 * 프레임마다 두 층을 붙이며 그 사이에 움직이는 빛(반짝임·빛줄기·강조)만 그린다.
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
  /** 추첨 룰렛: 지금 불빛이 지나는 별 */
  cursor?: number | null;
  /** 차례가 있는 별(당첨자 확인의 별 세 개): ①②③을 단다 */
  marks?: readonly number[];
  /**
   * 켜진 별(lit·bonus)의 움직임(첫 화면 정답 예시). 시각은 SkyBoard의 clock 기준 ms.
   * 별마다 켜진 시각부터 서서히 밝아지고, 반짝인 시각에 빛 번짐·빛줄기가 잠깐 커지며, fadeFrom부터 모두 함께 흐려진다.
   * 켜진 별을 그리는 코드는 추첨 하늘과 같다(빛 모양을 화면마다 따로 맞추지 않는다)
   */
  motion?: SkyMotion;
}

export interface SkyMotion {
  lit: Readonly<Record<number, number>>;
  sparkle: Readonly<Record<number, number>>;
  fadeFrom: number | null;
}

/** 움직임 길이(ms): 켜짐, 반짝임 한 번, 흐려짐 */
export const MOTION_MS = { in: 500, sparkle: 650, fade: 700 } as const;

/** 켜진 별의 밝기 배율(0에서 1): 켜지는 중이면 서서히, 흐려지는 중이면 함께 */
function motionAlpha(m: SkyMotion, n: number, now: number): number {
  const at = m.lit[n];
  const fadeIn =
    at === undefined ? 1 : Math.min(1, Math.max(0, (now - at) / MOTION_MS.in));
  const fadeOut =
    m.fadeFrom === null
      ? 1
      : Math.max(0, 1 - (now - m.fadeFrom) / MOTION_MS.fade);
  return fadeIn * fadeOut;
}

/** 반짝임 세기(0에서 1): 반짝인 시각부터 빠르게 올랐다가 천천히 사라진다 */
function sparkleLevel(m: SkyMotion, n: number, now: number): number {
  const at = m.sparkle[n];
  if (at === undefined) return 0;
  const t = (now - at) / MOTION_MS.sparkle;
  if (t <= 0 || t >= 1) return 0;
  return t < 0.35 ? t / 0.35 : (1 - t) / 0.65;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

/** 늘 가는 빛줄기를 두고 미세하게 깜빡이는 가장 밝은 별(번호는 밝은 순서) */
export const SPIKED_STARS = 4;

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
    r: nextFloat(rng) * 0.55 + 0.25,
    a: 0.12 + nextFloat(rng) * 0.35,
  }));
})();

/** 판 너비 360px을 기준으로 그린 크기를 늘리고 줄인다(작은 영수증 그림도 같은 모양) */
export function scaleOf(width: number): number {
  return Math.max(0.55, Math.min(1.6, width / 360));
}

/** 이 자리(px)에 있는 별 번호. 별(과 오른쪽 위 번호)을 누르면 된다 */
export function starAt(x: number, y: number, width: number): number | null {
  const scale = scaleOf(width);
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of SKY_STARS) {
    const d = Math.hypot(s.x * width - x, s.y * width - y);
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
  /** 움직이지 않는 그림(움직임 줄이기·영수증): 깜빡임·맥동 없이 멈춘 모습 */
  still?: boolean;
}

type Rgb = readonly [number, number, number];
type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 색 문자열에 지수 표기(1e-7)가 들어가지 않게 자른다 */
const al = (a: number) => Math.round(clamp01(a) * 1000) / 1000;
const rgba = (c: Rgb | string, a: number) =>
  `rgba(${typeof c === "string" ? c : c.join(",")},${al(a)})`;
const whiter = (c: Rgb, t: number): Rgb =>
  c.map((v) => Math.round(v + (255 - v) * t)) as unknown as Rgb;

/**
 * 빛 번짐의 세기 곡선(가운데 1 → 바깥 0). 가우스 핵에 멱함수 꼬리를 붙여 가운데서 빠르게 줄고 멀리 옅게 남는다.
 * 그라디언트 멈춤점으로 쓴다.
 */
const HALO_STOPS: readonly [number, number][] = [
  [0, 1],
  [0.05, 0.62],
  [0.12, 0.3],
  [0.22, 0.13],
  [0.38, 0.05],
  [0.6, 0.018],
  [1, 0],
];

function halo(
  g: Ctx,
  x: number,
  y: number,
  reach: number,
  c: Rgb | string,
  a: number,
) {
  if (!(reach > 0) || a <= 0.003) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, reach);
  for (const [t, v] of HALO_STOPS) grad.addColorStop(t, rgba(c, a * v));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, reach, 0, TAU);
  g.fill();
}

/** 가운데 흰색 → 별 색 → 투명으로 흐려지는 가는 십자 빛줄기(세로가 조금 길다, star.byb.kr과 같은 결) */
function cross(
  g: Ctx,
  x: number,
  y: number,
  c: Rgb | string,
  len: number,
  a: number,
  width: number,
  /** 대각선(✕) 빛줄기: 보너스 별 */
  diag = false,
) {
  if (!(len > 0.5) || a <= 0.01) return;
  g.lineWidth = width;
  g.lineCap = "round";
  const d = Math.SQRT1_2;
  const rays = diag
    ? ([
        [d, d, 1],
        [-d, -d, 1],
        [d, -d, 1],
        [-d, d, 1],
      ] as const)
    : ([
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1.15],
        [0, -1, 1.15],
      ] as const);
  for (const [dx, dy, m] of rays) {
    const ex = x + dx * len * m;
    const ey = y + dy * len * m;
    const lg = g.createLinearGradient(x, y, ex, ey);
    lg.addColorStop(0, rgba("255,255,255", a));
    lg.addColorStop(0.3, rgba(c, a * 0.5));
    lg.addColorStop(1, rgba(c, 0));
    g.strokeStyle = lg;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    g.stroke();
  }
}

/** 별 하나의 빛 모양(CSS px). 밝기는 점 크기보다 빛 번짐 반지름·세기로 낸다 */
interface StarLook {
  /** 가운데 점 반지름 */
  core: number;
  /** 흐린 빛 번짐이 닿는 거리 */
  reach: number;
  /** 빛 번짐 세기 */
  glow: number;
  /** 밝기 0(45번쯤) ~ 1(시리우스) */
  b: number;
}

function starLook(mag: number, scale: number): StarLook {
  const flux = 10 ** (-0.4 * (mag - 2.2)); // 약 1 ~ 30
  const k = Math.sqrt(scale);
  return {
    core: (0.7 + 0.2 * Math.log(flux)) * k,
    reach: (5 + 5 * flux ** 0.42) * scale,
    glow: Math.min(0.85, 0.3 + 0.17 * Math.log(flux)),
    b: clamp01((2.2 - mag) / 3.7),
  };
}

/** 별 그림: 흐린 빛 번짐 + 작은 흰빛 번짐 + 아주 작고 또렷한 점 */
function paintStar(g: Ctx, x: number, y: number, c: Rgb, look: StarLook) {
  halo(g, x, y, look.reach, c, look.glow);
  halo(g, x, y, look.core * 5, whiter(c, 0.5), 0.5 + 0.25 * look.b);
  g.fillStyle = rgba(whiter(c, 0.7), 1);
  g.beginPath();
  g.arc(x, y, look.core, 0, TAU);
  g.fill();
}

/** 상태에서 바탕·위 층 그림이 같은지 가르는 열쇠 */
function stateKey(s: SkyState): string {
  return [
    s.mode,
    s.picked.join(","),
    s.focus ?? "",
    s.lit.join(","),
    s.bonus ?? "",
    s.cursor ?? "",
    (s.marks ?? []).join(","),
  ].join("|");
}

/** 한 장면에서 쓰는 값(층을 그릴 때와 프레임마다 같은 규칙) */
function sceneOf(W: number, state: SkyState) {
  const scale = scaleOf(W);
  const receipt = state.mode === "receipt";
  // 추첨은 하늘의 빛을 모두 끈다(켜진 당첨 별·룰렛 불빛만 밝다)
  const dark = state.mode === "draw";
  const picked = new Set([...state.picked, ...(state.marks ?? [])]);
  const lit = new Set(state.lit);
  const focusCon =
    state.focus && state.mode === "pick"
      ? (SKY_STARS[state.focus - 1]?.con ?? null)
      : null;
  const pickedCons = new Set(
    [...picked].map((n) => SKY_STARS[n - 1]?.con).filter(Boolean),
  );
  const levelOf = (con: string) =>
    con === focusCon ? 2 : pickedCons.has(con) ? 1 : 0;
  const stars = SKY_STARS.map((s) => {
    const mine = picked.has(s.n);
    const drawn = lit.has(s.n);
    const isBonus = state.bonus === s.n;
    const passing = dark && state.cursor === s.n;
    const on = drawn || isBonus || passing;
    return {
      s,
      x: s.x * W,
      y: s.y * W,
      c: tempColor(s.k) as Rgb,
      /** 룰렛 불빛·당첨 별의 빛 색: 진짜 별빛 색(sky.ts starLight와 같다. 진한 색은 번호 공에만) */
      v: tempColor(s.k) as Rgb,
      look: starLook(s.mag, scale),
      /** 고리 자리를 정하는 반지름 */
      r: starRadius(s.mag) * scale,
      mine,
      drawn,
      isBonus,
      passing,
      on,
      hit: mine && (drawn || isBonus),
      // 영수증은 내 별 말고 흐리게, 추첨은 켜진 별 말고 모두 끈다
      dim: (receipt && !mine) || (dark && !on),
    };
  });
  return { W, state, scale, receipt, dark, focusCon, levelOf, stars };
}
type Scene = ReturnType<typeof sceneOf>;

/** 바탕 층: 잔별, 별자리 선, 어두운 별, 번호 별의 점과 빛 번짐 */
function paintBase(g: Ctx, sc: Scene) {
  const { W, scale, receipt, dark, levelOf } = sc;
  for (const d of DUST) {
    g.fillStyle = `rgba(200,210,240,${al(receipt ? d.a * 0.6 : dark ? d.a * 0.35 : d.a)})`;
    g.beginPath();
    g.arc(d.x * W, d.y * W, d.r * Math.min(1.2, scale), 0, TAU);
    g.fill();
  }

  // 별자리 선: 평소엔 아주 흐리게, 고른(영수증은 내) 별의 별자리는 조금 밝게, 누른 별의 별자리는 환하게
  const lineColors = dark
    ? ["rgba(150,172,240,0.12)", "rgba(150,172,240,0.12)", ""]
    : receipt
      ? ["rgba(150,172,240,0.08)", "rgba(160,182,245,0.28)", ""]
      : [
          "rgba(150,172,240,0.16)",
          "rgba(160,182,245,0.34)",
          "rgba(185,205,255,0.75)",
        ];
  g.lineJoin = "round";
  g.lineCap = "butt";
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
  for (const p of FAINT_STARS) {
    const level = levelOf(p.con);
    const base = dark
      ? 0.22
      : receipt
        ? [0.18, 0.4, 0.4][level]
        : [0.32, 0.5, 0.85][level];
    g.fillStyle = `rgba(225,232,255,${base})`;
    g.beginPath();
    g.arc(
      p.x * W,
      p.y * W,
      (level === 2 ? 1.1 : 0.85) * Math.min(1, scale),
      0,
      TAU,
    );
    g.fill();
  }

  for (const st of sc.stars) {
    const on = st.on && !sc.state.motion;
    g.globalAlpha = dark && !on ? 0.2 : st.dim ? 0.35 : 1;
    paintStar(g, st.x, st.y, st.c, st.look);
  }
  g.globalAlpha = 1;
}

/** 위 층: 별자리 이름, 번호, 고리, 차례 표시 */
function paintTop(g: Ctx, sc: Scene) {
  const { W, state, scale, dark, focusCon } = sc;
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

  for (const st of sc.stars) {
    const { x, y, s } = st;

    // 번호: 동그라미 없이 별빛 색 글자로 별 오른쪽 위에(별 지도처럼), 은은하게 빛난다
    g.globalAlpha =
      dark && !st.on ? 0.22 : st.dim ? 0.3 : st.mine || st.on ? 1 : 0.88;
    g.save();
    g.shadowColor = rgba(st.c, 0.9);
    g.shadowBlur = 6 * scale;
    g.fillStyle = rgba(whiter(st.c, 0.2), 1);
    g.font = `600 ${Math.max(8, Math.round(10.5 * scale))}px ui-monospace, Menlo, monospace`;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText(String(s.n), x + st.r + 2.5 * scale, y - st.r - 1.5 * scale);
    g.restore();
    g.globalAlpha = 1;

    // 고리: 내 별은 금빛(추첨 화면에서는 당첨 별 금빛과 헷갈리지 않게 하늘색).
    // 맞았는지는 고리 색이 아니라 고리 안의 별이 켜져 빛나는 것으로 알린다(파란 고리 + 빛)
    if (st.mine) {
      g.strokeStyle =
        state.mode === "draw"
          ? "rgba(147,197,253,0.95)"
          : "rgba(244,210,122,0.95)";
      g.lineWidth = 1.5 * Math.min(1.2, scale);
      g.beginPath();
      g.arc(x, y, st.r + 6 * scale, 0, TAU);
      g.stroke();
    }
    if (state.mode === "pick" && state.focus === s.n) {
      g.strokeStyle = "rgba(232,236,246,0.6)";
      g.setLineDash([3, 3]);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, st.r + 10 * scale, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
  }

  // 차례 표시(①②③): 별 위에 금빛 동그라미 숫자
  (state.marks ?? []).forEach((n, i) => {
    const st = sc.stars[n - 1];
    if (!st) return;
    g.fillStyle = "rgba(255,240,190,0.98)";
    g.font = `700 ${Math.round(16 * Math.min(1.3, scale))}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText(CIRCLED[i] ?? String(i + 1), st.x, st.y - st.r - 9 * scale);
  });
}

/** 움직이는 빛: 반짝임, 밝은 별의 빛줄기와 깜빡임, 강조(룰렛 불빛·당첨 별·내 별·차례 별) */
function paintLive(g: Ctx, sc: Scene, f: FrameInput) {
  const { W, scale, receipt, dark } = sc;
  const { now } = f;
  const still = !!f.still;
  // 영수증은 내 별 6개끼리만 반짝인다(반짝임 목록이 내 별에서만 나온다)
  const twinkles = dark ? [] : f.twinkles;
  const lw = Math.max(0.5, 0.7 * Math.min(1.2, scale));

  if (twinkles.length)
    FAINT_STARS.forEach((p, i) => {
      const a = twinkleLevel(twinkles, "faint", i, now);
      if (a <= 0.02) return;
      const x = p.x * W;
      const y = p.y * W;
      halo(g, x, y, 5 * scale, "225,232,255", 0.45 * a);
      g.fillStyle = rgba("240,244,255", 0.7 * a);
      g.beginPath();
      g.arc(x, y, 0.9 * Math.min(1, scale), 0, TAU);
      g.fill();
    });

  const marks = new Set(sc.state.marks ?? []);
  for (const st of sc.stars) {
    const { x, y, c, look, s } = st;

    // 가장 밝은 별 넷: 아주 가는 빛줄기를 늘 두고 미세하게 깜빡인다(scintillation)
    if (sc.state.mode === "pick" && s.n <= SPIKED_STARS && !st.dim) {
      const w = still
        ? 1
        : 1 +
          0.1 * Math.sin(now / 310 + s.n * 1.7) +
          0.07 * Math.sin(now / 1170 + s.n * 0.9);
      cross(g, x, y, c, (5 + 7 * look.b) * scale * w, 0.32 * w, lw * 0.75);
      if (!still)
        halo(g, x, y, look.core * 3.5, "255,255,255", 0.6 * (w - 0.84));
    }

    // 반짝임: 무작위 별 하나에 십자 빛줄기가 잠깐 섰다가 사라진다(star.byb.kr과 같은 결)
    const a = twinkles.length ? twinkleLevel(twinkles, "star", s.n, now) : 0;
    if (a > 0.01) {
      const reach = receipt ? 12 + 12 * look.b : 7 + 9 * look.b;
      cross(g, x, y, c, a * reach * scale, a, lw);
      halo(g, x, y, look.core * 5, whiter(c, 0.6), 0.5 * a);
      g.fillStyle = rgba("255,255,255", 0.9 * a);
      g.beginPath();
      g.arc(x, y, look.core * (1 + 0.5 * a) + 0.2, 0, TAU);
      g.fill();
    }

    // 추첨: 룰렛 불빛이 지나는 별은 그 별빛 색으로 밝게 번지고 빛줄기가 뻗는다.
    // 당첨 별 6개가 다 나오고 보너스를 고르는 동안은 불빛 빛줄기도 보너스처럼 대각선(✕)
    if (st.passing && !st.drawn && !st.isBonus) {
      const bonusSpin = sc.state.lit.length >= 6 && sc.state.bonus === null;
      halo(g, x, y, 30 * scale, whiter(st.v, 0.45), 0.9);
      cross(g, x, y, whiter(st.v, 0.3), 15 * scale, 0.9, lw, bonusSpin);
      bright(g, x, y, look);
    }
    // 켜진 당첨 별은 그 별빛 색으로 빛난다. 보너스는 같은 색에 빛줄기만 대각선(✕)으로.
    // 내 별과 맞으면 빛 번짐과 빛줄기가 맥동한다
    if (st.drawn || st.isBonus) {
      const m = sc.state.motion;
      g.globalAlpha = m ? motionAlpha(m, s.n, now) : 1;
      const p = st.hit && !still ? 0.8 + 0.2 * Math.sin(now / 260 + s.n) : 1;
      const tone = st.v;
      halo(g, x, y, (st.hit ? 36 : 28) * scale * p, tone, st.hit ? 0.9 : 0.75);
      cross(
        g,
        x,
        y,
        tone,
        (st.hit ? 22 : 15) * scale * p,
        0.9,
        lw * 1.1,
        st.isBonus,
      );
      bright(g, x, y, look);
      // 반짝임: 같은 빛 번짐·빛줄기가 잠깐 더 크게(당첨 ＋, 보너스 ✕)
      const sp = m ? sparkleLevel(m, s.n, now) : 0;
      if (sp > 0) {
        halo(g, x, y, (28 + 22 * sp) * scale, tone, 0.6 * sp);
        cross(
          g,
          x,
          y,
          tone,
          (15 + 20 * sp) * scale,
          0.9 * sp,
          lw * 1.2,
          st.isBonus,
        );
      }
      g.globalAlpha = 1;
    } else if (st.mine && !dark) {
      // 내가 고른 별(응모·영수증): 큰 원 대신 빛 번짐이 커지고 가는 빛줄기
      halo(g, x, y, look.reach * 1.6, c, 0.45);
      cross(g, x, y, c, (9 + 5 * look.b) * scale, 0.65, lw);
    }
    // 차례 별(①②③): 금빛 빛 번짐과 빛줄기
    if (marks.has(s.n)) {
      halo(g, x, y, 26 * scale, "255,236,150", 0.7);
      cross(g, x, y, "255,236,150", 16 * scale, 0.85, lw);
    }
  }
}

/** 켜진 별의 가운데를 또렷하게 */
function bright(g: Ctx, x: number, y: number, look: StarLook) {
  halo(g, x, y, look.core * 5, "255,252,240", 0.8);
  g.fillStyle = "rgba(255,255,255,1)";
  g.beginPath();
  g.arc(x, y, look.core * 1.25, 0, TAU);
  g.fill();
}

function paintMeteor(g: Ctx, W: number, m: Meteor, now: number) {
  const t = clamp01((now - m.start) / m.duration);
  const went = m.distance * W * (1 - (1 - t) ** 1.6);
  const tail = Math.min(went, m.tail * W);
  const hx = m.x * W + m.dx * went;
  const hy = m.y * W + m.dy * went;
  const alpha = t < 0.6 ? 1 : (1 - t) / 0.4;
  if (!(tail > 0)) return;
  const lg = g.createLinearGradient(hx - m.dx * tail, hy - m.dy * tail, hx, hy);
  lg.addColorStop(0, "rgba(200,220,255,0)");
  lg.addColorStop(1, rgba("240,245,255", 0.85 * alpha));
  g.strokeStyle = lg;
  g.lineWidth = 1.1;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(hx - m.dx * tail, hy - m.dy * tail);
  g.lineTo(hx, hy);
  g.stroke();
  g.fillStyle = rgba("255,255,255", alpha);
  g.beginPath();
  g.arc(hx, hy, 0.9, 0, TAU);
  g.fill();
}

interface Layers {
  key: string;
  base: HTMLCanvasElement;
  top: HTMLCanvasElement;
}
const layerCache = new WeakMap<Ctx, Layers>();

function newLayer(px: number, dpr: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

/** 상태·크기가 같으면 미리 그린 두 층을 다시 쓴다 */
function layersOf(g: Ctx, sc: Scene): Layers | null {
  const dpr = g.getTransform?.().a || 1;
  const px = Math.round(sc.W * dpr);
  const key = `${px}|${dpr}|${stateKey(sc.state)}`;
  const had = layerCache.get(g);
  if (had?.key === key) return had;
  const base = had && had.base.width === px ? had.base : newLayer(px, dpr);
  const top = had && had.top.width === px ? had.top : newLayer(px, dpr);
  const bg = base?.getContext("2d");
  const tg = top?.getContext("2d");
  if (!base || !top || !bg || !tg) return null;
  for (const c of [bg, tg]) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, sc.W, sc.W);
  }
  paintBase(bg, sc);
  paintTop(tg, sc);
  const layers = { key, base, top };
  layerCache.set(g, layers);
  return layers;
}

export function drawSky(g: CanvasRenderingContext2D, f: FrameInput): void {
  const { width: W, state, now } = f;
  const sc = sceneOf(W, state);
  g.clearRect(0, 0, W, W);
  const layers = layersOf(g, sc);
  if (layers) g.drawImage(layers.base, 0, 0, W, W);
  else paintBase(g, sc);
  paintLive(g, sc, f);
  if (layers) g.drawImage(layers.top, 0, 0, W, W);
  else paintTop(g, sc);
  if (f.meteor && !sc.receipt && !sc.dark) paintMeteor(g, W, f.meteor, now);
}
