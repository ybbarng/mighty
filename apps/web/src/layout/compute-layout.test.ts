import { describe, expect, it } from "vitest";

import { computeLayout, type Rect, rectsOverlap } from "./compute-layout";

const SCREENS = [
  [1920, 1080],
  [1280, 720],
  [1024, 768],
  [844, 390],
  [390, 844],
  [360, 740],
] as const;

const cases = SCREENS.flatMap(([width, height]) =>
  [2, 3, 4, 5, 6, 7].flatMap((playerCount) =>
    [10, 13].map((handCount) => ({ width, height, playerCount, handCount })),
  ),
);

function inside(inner: Rect, outer: Rect): boolean {
  const e = 0.5;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.w <= outer.x + outer.w + e &&
    inner.y + inner.h <= outer.y + outer.h + e
  );
}

describe.each(cases)(
  "$width×$height / 인원 $playerCount / 손패 $handCount",
  (input) => {
    const layout = computeLayout(input);
    const plates = layout.seats.slice(1).map((s) => s.plate);
    const handRect: Rect = {
      x: 0,
      y: layout.hand.top,
      w: input.width,
      h: input.height - layout.hand.top,
    };

    it("자리 판끼리 겹치지 않는다", () => {
      for (const [i, a] of plates.entries()) {
        for (const b of plates.slice(i + 1))
          expect(rectsOverlap(a, b)).toBe(false);
      }
    });

    it("자리 판은 손패·HUD와 겹치지 않는다", () => {
      for (const plate of plates) {
        expect(rectsOverlap(plate, handRect)).toBe(false);
        expect(rectsOverlap(plate, layout.hud)).toBe(false);
      }
    });

    it("손패는 화면 밖으로 나가지 않는다", () => {
      const { card, slots } = layout.hand;
      for (const slot of slots) {
        expect(slot.x - card.w / 2).toBeGreaterThanOrEqual(0);
        expect(slot.x + card.w / 2).toBeLessThanOrEqual(input.width);
        expect(slot.y + card.h / 2).toBeLessThanOrEqual(input.height);
      }
      expect(slots).toHaveLength(input.handCount);
    });

    it("세로 화면에서 손패 간격이 누를 수 있을 만큼 넓다", () => {
      if (layout.orientation !== "portrait") return;
      const xs = layout.hand.slots.map((s) => s.x);
      const rowSize =
        layout.hand.rows === 1 ? xs.length : Math.ceil(xs.length / 2);
      const step = (xs[1] ?? 0) - (xs[0] ?? 0);
      if (rowSize > 1) expect(step).toBeGreaterThanOrEqual(30);
    });

    it("바닥 칸은 바닥 안에 있고, 내 칸이 가장 아래다", () => {
      const { card, slots } = layout.trick;
      for (const slot of slots.slice(0, input.playerCount)) {
        expect(
          inside(
            {
              x: slot.x - card.w / 2,
              y: slot.y - card.h / 2,
              w: card.w,
              h: card.h,
            },
            layout.center,
          ),
        ).toBe(true);
      }
      const mine = slots[0]?.y ?? 0;
      for (const slot of slots.slice(1))
        expect(mine).toBeGreaterThanOrEqual(slot.y);
    });
  },
);

it("가로·세로를 화면 비율로 고른다", () => {
  expect(
    computeLayout({ width: 1280, height: 720, playerCount: 5, handCount: 10 })
      .orientation,
  ).toBe("landscape");
  expect(
    computeLayout({ width: 390, height: 844, playerCount: 5, handCount: 10 })
      .orientation,
  ).toBe("portrait");
});

it("세로 폰에서 13장이면 두 줄로 놓는다", () => {
  expect(
    computeLayout({ width: 390, height: 844, playerCount: 5, handCount: 13 })
      .hand.rows,
  ).toBe(2);
  expect(
    computeLayout({ width: 390, height: 844, playerCount: 5, handCount: 10 })
      .hand.rows,
  ).toBe(1);
});

describe.each(cases)(
  "$width×$height / 인원 $playerCount / 손패 $handCount — 바닥",
  (input) => {
    it("자리 판은 바닥 카드와 겹치지 않는다", () => {
      const layout = computeLayout(input);
      const { card, slots } = layout.trick;
      const cards = slots.map((s) => ({
        x: s.x - card.w / 2,
        y: s.y - card.h / 2,
        w: card.w,
        h: card.h,
      }));
      for (const seat of layout.seats.slice(1)) {
        for (const c of cards) expect(rectsOverlap(seat.plate, c)).toBe(false);
      }
    });
  },
);
