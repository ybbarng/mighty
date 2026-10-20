/**
 * 화면 크기와 인원으로 카드·자리 판의 좌표를 계산한다 (docs/05-layout.md 4절).
 * 순수 함수라 화면 크기별로 테스트할 수 있다. 모든 좌표는 무대 왼쪽 위 기준 px.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  playerCount: number;
  /** 내 손패 장수 */
  handCount: number;
}

export interface SeatLayout {
  /** 나부터 차례 순서로 몇 번째인가. 0이 나 */
  offset: number;
  angle: number;
  anchor: Point;
  plate: Rect;
}

export interface Layout {
  orientation: "landscape" | "portrait";
  gutter: number;
  hud: Rect;
  table: Rect;
  /** 바닥이자 행동 패널 자리 */
  center: Rect;
  hand: { card: Size; rows: number; top: number; slots: Point[] };
  /** `offset` 순서. 0번은 내 자리(자리 판 없이 손패 위 가운데) */
  seats: SeatLayout[];
  trick: { card: Size; slots: Point[] };
}

/** 자리 판의 가장 낮은 높이. 이보다 낮아지면 한 줄짜리 간단한 판(이름·장수·점수)으로 그린다 */
export const PLATE_MIN_H = 44;
/** 이 높이보다 낮으면 자리 판을 한 줄로 줄여 그린다 */
export const PLATE_COMPACT_H = 58;

/** 카드 그림(250×350)의 높이/폭 */
export const CARD_RATIO = 350 / 250;

/** 나부터 차례 순서로 k번째 사람의 각도(0° = 오른쪽, 90° = 아래). docs/05-layout.md 3.6절 */
const SEAT_ANGLES: Record<number, number[]> = {
  2: [270],
  3: [205, 335],
  4: [180, 270, 0],
  5: [165, 235, 305, 15],
  6: [160, 215, 270, 325, 20],
  7: [150, 195, 240, 300, 345, 30],
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const rad = (deg: number) => (deg * Math.PI) / 180;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

function handLayout(
  W: number,
  H: number,
  g: number,
  n: number,
  portrait: boolean,
) {
  const usableW = W - 2 * g;
  const count = Math.max(1, n);
  const byWidth = usableW / (1 + 0.55 * (count - 1));
  const byHeight = portrait ? W * 0.2 : (H * 0.24) / CARD_RATIO;
  let cw = clamp(Math.min(byWidth, byHeight), 44, 200);
  let step = count > 1 ? Math.min(cw * 0.75, (usableW - cw) / (count - 1)) : 0;
  let rows = 1;
  if (portrait && count > 1 && step < Math.max(30, cw * 0.42)) {
    rows = 2;
    const top = Math.ceil(count / 2);
    cw = Math.min(W * 0.2, usableW / (1 + 0.55 * (top - 1)));
    step = top > 1 ? Math.min(cw * 0.75, (usableW - cw) / (top - 1)) : 0;
  }
  const ch = cw * CARD_RATIO;
  const lift = ch * 0.2;
  const height = rows === 1 ? ch + lift : ch * 1.5 + lift;
  const top = H - g - height;

  const slots: Point[] = [];
  const perRow = rows === 1 ? count : Math.ceil(count / 2);
  for (let i = 0; i < n; i++) {
    const row = rows === 1 ? 0 : Math.floor(i / perRow);
    const inRow = rows === 1 ? n : row === 0 ? perRow : n - perRow;
    const col = i - row * perRow;
    const totalW = cw + step * (inRow - 1);
    const x0 = W / 2 - totalW / 2 + cw / 2;
    slots.push({ x: x0 + step * col, y: top + lift + ch / 2 + row * ch * 0.5 });
  }
  return { card: { w: cw, h: ch }, rows, top, slots };
}

export function computeLayout(input: LayoutInput): Layout {
  const { width: W, height: H, playerCount } = input;
  const portrait = W / H < 1;
  const g = clamp(Math.min(W, H) * 0.02, 8, 24);

  const hand = handLayout(W, H, g, input.handCount, portrait);
  const hudH = portrait ? 44 : H < 480 ? 32 : 40;
  const hud: Rect = { x: g, y: g, w: W - 2 * g, h: hudH };
  const table: Rect = {
    x: g,
    y: g + hudH,
    w: W - 2 * g,
    h: hand.top - g - (g + hudH),
  };

  // 자리 판
  const angles = [90, ...(SEAT_ANGLES[playerCount] ?? [])];
  let plate: Size = portrait
    ? { w: clamp(W * 0.24, 76, 112), h: 64 }
    : {
        w: clamp(W * 0.12, 120, 180),
        h: clamp(table.h * 0.22, PLATE_MIN_H, 64),
      };
  // 세로 화면은 자리 판을 위쪽에 모으고 그 아래를 바닥으로 쓴다.
  const C: Point = portrait
    ? { x: table.x + table.w / 2, y: table.y + table.h * 0.27 }
    : { x: table.x + table.w / 2, y: table.y + table.h / 2 };

  let seats: SeatLayout[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const Rx = table.w / 2 - plate.w / 2;
    const Ry = portrait ? table.h * 0.23 : table.h / 2 - plate.h / 2;
    seats = angles.map((angle, offset) => {
      if (offset === 0) {
        const anchor = { x: W / 2, y: hand.top };
        return {
          offset,
          angle,
          anchor,
          plate: { x: anchor.x - plate.w / 2, y: anchor.y, w: plate.w, h: 0 },
        };
      }
      const anchor = {
        x: C.x + Rx * Math.cos(rad(angle)),
        y: C.y + Ry * Math.sin(rad(angle)),
      };
      const x = clamp(
        anchor.x - plate.w / 2,
        table.x,
        table.x + table.w - plate.w,
      );
      const y = clamp(
        anchor.y - plate.h / 2,
        table.y,
        table.y + table.h - plate.h,
      );
      return { offset, angle, anchor, plate: { x, y, w: plate.w, h: plate.h } };
    });
    const others = seats.slice(1).map((s) => s.plate);
    const overlapping = others.some((a, i) =>
      others.some((b, j) => i < j && rectsOverlap(a, b)),
    );
    if (!overlapping) break;
    plate = { w: plate.w * 0.85, h: Math.max(PLATE_MIN_H, plate.h * 0.9) };
  }

  // 바닥
  let center: Rect;
  let trickCard: Size;
  if (portrait) {
    const platesBottom = Math.max(
      ...seats.slice(1).map((s) => s.plate.y + s.plate.h),
    );
    const top = platesBottom + g;
    const room = table.y + table.h - top;
    // 자리 판 아래 공간이 너무 좁으면(아주 낮은 화면) 겹치더라도 일정 크기를 지킨다.
    const side = Math.min(table.w * 0.8, Math.max(room, table.h * 0.4));
    const cy = room >= side ? top + room / 2 : table.y + table.h - side / 2;
    center = { x: W / 2 - side / 2, y: cy - side / 2, w: side, h: side };
    const tw = Math.min(side * 0.28, hand.card.w);
    trickCard = { w: tw, h: tw * CARD_RATIO };
  } else {
    const tw = hand.card.w * 0.85;
    trickCard = { w: tw, h: tw * CARD_RATIO };
    const w = Math.min(tw * 3.4, table.w * 0.42);
    const h = Math.min(trickCard.h * 2.4, table.h * 0.62);
    const cx = table.x + table.w / 2;
    const cy = table.y + table.h / 2 + table.h * 0.06;
    center = { x: cx - w / 2, y: cy - h / 2, w, h };
    // 맞은편 자리 판(위쪽 가운데)이 바닥 위로 내려와 있으면 바닥을 그 아래로 줄인다.
    const above = seats
      .slice(1)
      .map((s) => s.plate)
      .filter(
        (p) =>
          p.x < center.x + center.w &&
          center.x < p.x + p.w &&
          p.y < center.y + center.h / 2,
      );
    const top = Math.max(center.y, ...above.map((p) => p.y + p.h + g / 2));
    if (top > center.y) {
      const bottom = Math.min(
        table.y + table.h,
        center.y + center.h + (top - center.y) / 2,
      );
      center = { ...center, y: top, h: bottom - top };
      if (trickCard.h > center.h * 0.75) {
        const th = center.h * 0.75;
        trickCard = { w: th / CARD_RATIO, h: th };
      }
    }
  }

  // 바닥 칸: 자리와 같은 각도로 바닥 안 작은 타원 위에
  const Tc: Point = { x: center.x + center.w / 2, y: center.y + center.h / 2 };
  const Tx = center.w / 2 - trickCard.w / 2;
  const maxTy = center.h / 2 - trickCard.h / 2;
  // 2인은 위·아래 두 칸뿐이라 가운데로 모은다.
  const Ty = playerCount === 2 ? Math.min(trickCard.h * 0.6, maxTy) : maxTy;
  const trickSlots = angles.map((angle) => ({
    x: Tc.x + Tx * Math.cos(rad(angle)),
    y: Tc.y + Ty * Math.sin(rad(angle)),
  }));

  return {
    orientation: portrait ? "portrait" : "landscape",
    gutter: g,
    hud,
    table,
    center,
    hand,
    seats,
    trick: { card: trickCard, slots: trickSlots },
  };
}
