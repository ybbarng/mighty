import { describe, expect, it } from "vitest";

import {
  CENTER,
  DONE,
  distanceTable,
  HOME,
  MO,
  type Position,
  START,
  travel,
} from "./board";

const at = (point: number, trail: number[] = []): Position => ({
  point,
  trail,
});

function landing(from: Position, steps: number, landOnHome = false): number {
  const moved = travel(from, steps, landOnHome);
  if (!moved) throw new Error("움직일 수 없다");
  return moved.finished ? DONE : moved.to.point;
}

describe("말 길", () => {
  it("판에 없던 말은 참먹이 다음 점부터 센다", () => {
    expect(landing(at(HOME), 1)).toBe(1);
    expect(landing(at(HOME), 5)).toBe(MO);
  });

  it("모에 멈춘 말은 지름길로 간다", () => {
    expect(landing(at(MO), 1)).toBe(20);
    expect(landing(at(MO), 3)).toBe(CENTER);
    // 방을 지나가면 찌모 쪽으로 이어 간다.
    expect(landing(at(MO), 5)).toBe(24);
  });

  it("모를 지나가기만 하면 바깥 길로 간다", () => {
    expect(landing(at(3), 4)).toBe(7);
  });

  it("뒷모에 멈춘 말은 참먹이 쪽 지름길로 간다", () => {
    expect(landing(at(10), 3)).toBe(CENTER);
    expect(landing(at(10), 5)).toBe(28);
  });

  it("방에 멈춘 말은 참먹이 쪽(출구)으로 간다", () => {
    expect(landing(at(CENTER, [MO, 20, 21]), 1)).toBe(27);
    expect(landing(at(CENTER, [MO, 20, 21]), 3)).toBe(START);
    expect(landing(at(CENTER, [MO, 20, 21]), 4)).toBe(DONE);
  });

  it("방을 지나갈 때는 온 지름길을 따라간다", () => {
    expect(landing(at(21, [MO, 20]), 2)).toBe(23);
    expect(landing(at(26, [10, 25]), 2)).toBe(27);
  });

  it("참먹이를 지나야 나고, 정확히 서면 아직 판에 있다", () => {
    expect(landing(at(19), 1)).toBe(START);
    expect(landing(at(19), 2)).toBe(DONE);
    expect(landing(at(28), 1)).toBe(START);
    expect(landing(at(28), 2)).toBe(DONE);
    // 참먹이에 서 있던 말은 무엇이 나와도 난다.
    expect(landing(at(START, [19]), 1)).toBe(DONE);
  });

  it("서면 남 규칙이면 참먹이에 정확히 서도 난다", () => {
    expect(landing(at(19), 1, true)).toBe(DONE);
  });

  it("빽도는 지나온 길로 한 칸 되돌아간다", () => {
    expect(landing(at(20, [MO]), -1)).toBe(MO);
    expect(landing(at(23, [MO, 20, 21, CENTER]), -1)).toBe(CENTER);
    // 도 자리에서 빽도면 참먹이에 선다.
    expect(landing(at(1), -1)).toBe(START);
    // 판에 없는 말과 난 말은 빽도를 쓸 수 없다.
    expect(travel(at(HOME), -1, false)).toBeNull();
    expect(travel(at(DONE), 2, false)).toBeNull();
  });

  it("움직인 뒤 지나온 길이 쌓인다", () => {
    const moved = travel(at(HOME), 4, false);
    expect(moved?.to).toEqual({ point: 4, trail: [1, 2, 3] });
    expect(moved?.path).toEqual([1, 2, 3, 4]);
  });
});

describe("남은 거리", () => {
  it("지름길을 쓰는 최단 칸 수", () => {
    const { points, home } = distanceTable(false);
    // 참먹이에 서 있으면 한 칸이면 난다.
    expect(points[START]).toBe(1);
    // 방 → 27 → 28 → 참먹이 → 남(4칸)
    expect(points[CENTER]).toBe(4);
    // 모 → 20 → 21 → 방 → 27 → 28 → 참먹이 → 남
    expect(points[MO]).toBe(7);
    expect(home).toBe(12);
  });
});
