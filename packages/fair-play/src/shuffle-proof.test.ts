import { fullDeck } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { encodedDeck, Party } from "./protocol";
import {
  answerShuffle,
  challengeBits,
  commitDigest,
  commitShuffle,
  fromB64,
  nonceCommit,
  SHUFFLE_ROUNDS,
  type ShuffleLabel,
  shuffleNonce,
  toB64,
  verifyShuffle,
} from "./shuffle-proof";
import { modInverse, newPassKey } from "./sra";
import { TEST_GROUPS } from "./test-groups";

describe.each(TEST_GROUPS)("군 %s", (_name, g) => {
  const label: ShuffleLabel = {
    device: 2,
    deal: 1,
    round: 0,
    stage: "shuffle",
  };

  /**
   * 실제 섞기(Party.lockAndShuffle)와 그때 쓴 섞기 열쇠.
   * 증명은 덱 길이와 상관없는 계산이라 4장으로 본다(53장 덱은 방 시험이 실제로 돌린다)
   */
  async function shuffled() {
    const party = new Party(2, g);
    const input = encodedDeck(g, fullDeck().slice(0, 4));
    const output = await party.lockAndShuffle(input, "shuffle");
    const e = (party as unknown as { pass(name: string): bigint }).pass(
      "shuffle",
    );
    return { input, output, e };
  }

  const ALL_ZERO = Array(SHUFFLE_ROUNDS).fill(0);
  const ALL_ONE = Array(SHUFFLE_ROUNDS).fill(1);

  describe("섞기 증명(cut-and-choose)", () => {
    it("정직하게 섞었으면 어떤 도전값에도 증명이 맞는다", async () => {
      const { input, output, e } = await shuffled();
      const work = await commitShuffle(g, label, input, e);
      const bits = await challengeBits(
        label,
        ["a1", "b2"],
        [await commitDigest(work.commit)],
      );
      for (const b of [bits, ALL_ZERO, ALL_ONE]) {
        const answers = await answerShuffle(
          g,
          label,
          input,
          output,
          e,
          work,
          b,
        );
        expect(
          await verifyShuffle(g, label, input, output, work.commit, b, answers),
        ).toBe(true);
      }
    }, 60_000);

    it("같은 섞기 열쇠면 같은 약속과 nonce를 다시 만든다(새로고침해도 이어 간다)", async () => {
      const { input, e } = await shuffled();
      const a = await commitShuffle(g, label, input, e);
      const b = await commitShuffle(g, label, input, e);
      expect(b.commit).toEqual(a.commit);
      expect(await shuffleNonce(e, label)).toBe(await shuffleNonce(e, label));
      expect(await nonceCommit("x")).not.toBe(await nonceCommit("y"));
    }, 60_000);

    describe("카드를 바꿔치기한 덱", () => {
      /** 섞은 뒤 한 장을 다른 카드의 복제로 바꿨다(남의 카드를 엿보는 부정) */
      async function tampered() {
        const { input, output, e } = await shuffled();
        const bad = [...output];
        bad[1] = bad[3] as bigint;
        return { input, output: bad, e };
      }

      it("중간 덱을 입력에서 정직하게 만들면 도전 1에서 들킨다", async () => {
        const { input, output, e } = await tampered();
        const work = await commitShuffle(g, label, input, e);
        // 복제한 카드는 입력에 짝이 없어 정직한 응답 코드는 응답을 만들지 못한다.
        await expect(
          answerShuffle(g, label, input, output, e, work, ALL_ONE),
        ).rejects.toThrow();
        const honest = await shuffled();
        const answers = await answerShuffle(
          g,
          label,
          honest.input,
          honest.output,
          honest.e,
          await commitShuffle(g, label, honest.input, honest.e),
          ALL_ONE,
        );
        // 순열인 τ를 아무렇게나 골라도 Z → Y 증명이 맞지 않는다.
        const forged = answers.map((a) =>
          a.b === 1 ? { ...a, tau: input.map((_, i) => i) } : a,
        );
        expect(
          await verifyShuffle(
            g,
            label,
            input,
            output,
            work.commit,
            ALL_ONE,
            forged,
          ),
        ).toBe(false);
      }, 60_000);

      it("중간 덱을 출력에서 거꾸로 만들면 도전 0에서 들킨다", async () => {
        const { input, output } = await tampered();
        // Z = Y^(1/s)로 두면 Z → Y는 증명할 수 있지만 X → Z(σ, t)는 보일 수 없다.
        const s = newPassKey(g);
        const z = output.map((y) => g.pow(y, modInverse(s, g.q)));
        const commit = {
          z: Array.from({ length: SHUFFLE_ROUNDS }, () => z.map(toB64)),
          d: Array.from({ length: SHUFFLE_ROUNDS }, () =>
            g.pow(g.generator, s).toString(16),
          ),
        };
        const answers = ALL_ZERO.map(() => ({
          b: 0 as const,
          sigma: input.map((_, i) => i),
          t: newPassKey(g).toString(16),
        }));
        expect(
          await verifyShuffle(
            g,
            label,
            input,
            output,
            commit,
            ALL_ZERO,
            answers,
          ),
        ).toBe(false);
      }, 60_000);
    });

    it("다른 섞기로 옮겨 쓰거나 약속 모양이 틀리면 맞지 않는다", async () => {
      const { input, output, e } = await shuffled();
      const work = await commitShuffle(g, label, input, e);
      const answers = await answerShuffle(
        g,
        label,
        input,
        output,
        e,
        work,
        ALL_ONE,
      );
      const other = { ...label, device: 3 };
      expect(
        await verifyShuffle(
          g,
          other,
          input,
          output,
          work.commit,
          ALL_ONE,
          answers,
        ),
      ).toBe(false);
      expect(
        await verifyShuffle(
          g,
          label,
          input,
          output,
          { ...work.commit, z: work.commit.z.slice(1) },
          ALL_ONE,
          answers,
        ),
      ).toBe(false);
    }, 60_000);

    it("base64로 바꿨다 되돌리면 같은 수다", () => {
      for (const n of [1n, 255n, 256n, 65535n, (1n << 2048n) - 1n])
        expect(fromB64(toB64(n))).toBe(n);
    });
  });
});
