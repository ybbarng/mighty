import { describe, expect, it } from "vitest";

import { type KeyStatement, proveKeys, verifyKeys } from "./proof";
import { combine, encodeIndex, newKey, newPassKey } from "./sra";
import { TEST_GROUPS } from "./test-groups";

describe.each(TEST_GROUPS)("군 %s", (_name, g) => {
  /** 기기 하나가 자리 셋을 다시 잠근다: O[i] = I[i]^(u·k_i) */
  function relocked() {
    const u = newKey(g);
    const keys = [newPassKey(g), newPassKey(g), newPassKey(g)];
    const input = [3, 8, 20].map((i) => g.pow(encodeIndex(g, i), newKey(g)));
    const output = input.map((c, i) =>
      g.pow(c, combine(g, [u, keys[i] as bigint])),
    );
    const st: KeyStatement = {
      device: 2,
      v: g.pow(g.generator, u),
      items: keys.map((key, i) => ({
        slot: i,
        input: input[i] as bigint,
        output: output[i] as bigint,
        key,
      })),
    };
    return { u, st };
  }

  describe("열쇠 증명(Chaum–Pedersen)", () => {
    it("잠글 때 쓴 열쇠를 공개하면 증명이 맞는다", async () => {
      const { u, st } = relocked();
      const proof = await proveKeys(g, st, u);
      expect(await verifyKeys(g, st, proof)).toBe(true);
    });

    it("다른 열쇠를 공개하면 증명을 만들 수 없다", async () => {
      const { u, st } = relocked();
      const lie: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 1 ? { ...item, key: newPassKey(g) } : item,
        ),
      };
      expect(await verifyKeys(g, lie, await proveKeys(g, lie, u))).toBe(false);
    });

    it("맞는 증명이라도 다른 기기·다른 열쇠에 옮겨 쓰면 맞지 않는다", async () => {
      const { u, st } = relocked();
      const proof = await proveKeys(g, st, u);
      expect(await verifyKeys(g, { ...st, device: 3 }, proof)).toBe(false);
      const swapped: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 0 ? { ...item, key: item.key + 1n } : item,
        ),
      };
      expect(await verifyKeys(g, swapped, proof)).toBe(false);
    });

    it("잠근 값을 바꿔치기했으면 맞는 열쇠로도 증명이 맞지 않는다", async () => {
      const { u, st } = relocked();
      const tampered: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 2 ? { ...item, output: encodeIndex(g, 5) } : item,
        ),
      };
      expect(
        await verifyKeys(g, tampered, await proveKeys(g, tampered, u)),
      ).toBe(false);
    });

    it("틀린 열쇠 둘이 서로 지워지게 고를 수 없다(가중치를 해시로 정한다)", async () => {
      // 같은 값을 두 자리에 잠갔다고 하자. 가중치 없이 곱하면 열쇠 하나를 d만큼 키우고 다른 하나를
      // d만큼 줄여도 곱이 같아 증명이 맞아 버린다.
      const u = newKey(g);
      const input = g.pow(encodeIndex(g, 4), newKey(g));
      const [k1, k2] = [newPassKey(g), newPassKey(g)];
      const item = (slot: number, key: bigint) => ({
        slot,
        input,
        output: g.pow(input, combine(g, [u, key])),
        key,
      });
      const honest = [item(0, k1), item(1, k2)];
      const d = 12345n;
      const lie: KeyStatement = {
        device: 1,
        v: g.pow(g.generator, u),
        items: [
          { ...(honest[0] as (typeof honest)[0]), key: k1 + d },
          { ...(honest[1] as (typeof honest)[0]), key: k2 - d },
        ],
      };
      expect(await verifyKeys(g, lie, await proveKeys(g, lie, u))).toBe(false);
    });
  });
});
