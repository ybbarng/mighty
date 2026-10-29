import { describe, expect, it } from "vitest";
import { constellation } from "./constellation";
import { generateSigner } from "./keys";

const PUB_1 = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);
const PUB_2 = Uint8Array.from([4, ...new Array<number>(64).fill(2)]);

describe("별자리 지문", () => {
  // 기대값은 사용자에게 보인 시안 HTML의 스크립트를 그대로 Node에서 돌려 얻었다
  it("시험 값: 04 ‖ 01×64 → 노을빛 부엉이자리", () => {
    const c = constellation(PUB_1);
    expect(c.name).toBe("노을빛 부엉이자리");
    expect(c.color).toBe("#ff9f4a");
    expect(c.seed).toBe(74);
    expect(c.stars.map((s) => s.n)).toEqual([4, 34, 26, 30, 6, 20, 44]);
    expect(c.stars[0]?.x).toBeCloseTo(0.5336962531582685, 12);
    expect(c.stars[0]?.y).toBeCloseTo(0.4389226501722384, 12);
    expect(c.stars[6]?.x).toBeCloseTo(0.5617190832247727, 12);
    expect(c.faint).toHaveLength(9);
    expect(c.lines).toHaveLength(4);
    expect(c.lines[0]?.[0]?.x).toBeCloseTo(0.321031394223543, 12);
  });

  it("시험 값: 04 ‖ 02×64 → 붉은 여우자리", () => {
    const c = constellation(PUB_2);
    expect(c.name).toBe("붉은 여우자리");
    expect(c.color).toBe("#ff7a6b");
    expect(c.seed).toBe(34);
    expect(c.stars.map((s) => s.n)).toEqual([33, 17, 30, 26, 31, 34, 11]);
    expect(c.stars[6]?.x).toBeCloseTo(0.8167730822135431, 12);
    expect(c.stars[6]?.y).toBeCloseTo(0.6741153499246301, 12);
    expect(c.faint).toHaveLength(6);
    expect(c.lines[0]?.[0]?.y).toBeCloseTo(0.35757086917463443, 12);
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
