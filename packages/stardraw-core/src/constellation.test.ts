import { describe, expect, it } from "vitest";
import { constellation } from "./constellation";
import { generateSigner } from "./keys";

const PUB_1 = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);
const PUB_2 = Uint8Array.from([4, ...new Array<number>(64).fill(2)]);

describe("별자리 지문", () => {
  // 기대값은 사용자에게 보인 시안 HTML의 스크립트를 그대로 Node에서 돌려 얻었다
  it("시험 값: 04 ‖ 01×64 → 금빛 물병자리", () => {
    const c = constellation(PUB_1);
    expect(c.name).toBe("금빛 물병자리");
    expect(c.color).toBe("#f4d27a");
    expect(c.seed).toBe(111);
    expect(c.stars.map((s) => s.n)).toEqual([6, 17, 22, 4, 34, 2, 45]);
    expect(c.stars[0]?.x).toBeCloseTo(0.6711556913941317, 12);
    expect(c.stars[0]?.y).toBeCloseTo(0.4604105724262273, 12);
    expect(c.stars[6]?.x).toBeCloseTo(0.6538212496912238, 12);
    expect(c.faint).toHaveLength(6);
    expect(c.lines).toHaveLength(3);
    expect(c.lines[0]?.[0]?.y).toBeCloseTo(0.21975246565840878, 12);
  });

  it("시험 값: 04 ‖ 02×64 → 하얀 등대자리", () => {
    const c = constellation(PUB_2);
    expect(c.name).toBe("하얀 등대자리");
    expect(c.color).toBe("#ffffff");
    expect(c.seed).toBe(181);
    expect(c.stars.map((s) => s.n)).toEqual([17, 26, 27, 28, 40, 14, 39]);
    expect(c.stars[2]?.x).toBeCloseTo(0.33831638529788677, 12);
    expect(c.stars[2]?.y).toBeCloseTo(0.8232516116453297, 12);
    expect(c.faint).toHaveLength(8);
    expect(c.lines).toHaveLength(5);
    expect(c.lines[0]?.[0]?.x).toBeCloseTo(0.5060879404079185, 12);
  });

  it("밝은 별 7개는 서로 다른 꼭짓점, 번호는 1~45에서 서로 다르고, 꺾은선 점은 꼭짓점 중 하나다", async () => {
    for (let k = 0; k < 20; k++) {
      const { publicKey } = await generateSigner();
      const c = constellation(publicKey);
      const numbers = c.stars.map((s) => s.n);
      expect(new Set(numbers).size).toBe(7);
      for (const n of numbers) expect(n >= 1 && n <= 45).toBe(true);
      const vertices = [...c.stars, ...c.faint].map((p) => `${p.x},${p.y}`);
      expect(new Set(vertices).size).toBe(vertices.length);
      for (const line of c.lines)
        for (const p of line) expect(vertices).toContain(`${p.x},${p.y}`);
    }
  });
});
