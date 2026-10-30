// @vitest-environment node
import { generateSigner } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";
import { ART_H, ART_W, keyArt } from "./key-art";

describe("등록증 뒷면 열쇠 그림", () => {
  it("같은 공개 열쇠면 같은 그림, 다른 열쇠면 다른 그림", async () => {
    const a = (await generateSigner()).publicKey;
    const b = (await generateSigner()).publicKey;
    expect(keyArt(a)).toEqual(keyArt(Uint8Array.from(a)));
    expect(keyArt(a)).not.toEqual(keyArt(b));
  });

  it("별은 판 안에 있고, 밝은 별 일곱이 한 줄 별자리로 이어진다", async () => {
    const art = keyArt((await generateSigner()).publicKey);
    expect(art.stars).toHaveLength(20);
    for (const s of art.stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(ART_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(ART_H);
    }
    expect(art.lines).toHaveLength(6);
    expect(new Set(art.lines.flat())).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(art.hue).toBeGreaterThanOrEqual(0);
    expect(art.hue).toBeLessThan(360);
  });
});
