import { deckFor, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { tokenDeal } from "./blind";
import type { FairDevice } from "./device";
import { network } from "./device-fixture";
import { type Party, Party as PartyClass } from "./protocol";

/** 기기가 기다리는 시간(증명 미루기 10초, 응답 30초의 두 배)을 넉넉히 넘긴다 */
const PROOF_WAIT_MS = 120_000;

describe("메시지로 하는 멘탈 포커", () => {
  describe("섞기 증명: 섞을 때 카드를 바꾸면 그 기기를 짚는다", () => {
    const stateOf = (d: FairDevice) =>
      (
        d as unknown as {
          deals: Map<
            number,
            {
              shuffles: Map<
                string,
                {
                  checked: Map<number, Promise<boolean>>;
                  commits: Map<number, unknown>;
                  nonces: Map<number, unknown>;
                  answers: Map<number, unknown>;
                }
              >;
            }
          >;
        }
      ).deals
        .get(1)
        ?.shuffles.get("0:shuffle");
    async function run(cheater: number | null, hideNonce = false) {
      const rules = presetRules("standard5");
      // 고친 프로그램이 nonce를 숨기면(남의 nonce를 보고 도전값이 불리하다고 보고 멈춘다) 보내지 않는다.
      const { devices, clock, settle } = network([0, 1, 2], {
        drop: (m, from) =>
          hideNonce && from === cheater && m.k === "sproof" && !!m.nonce,
      });
      const problems: { by: number; device: number | null; reason: string }[] =
        [];
      for (const d of devices)
        d.on("problem", (_deal, reason, device) =>
          problems.push({ by: d.id, device, reason }),
        );
      // 속이는 기기: 섞은 덱에서 한 장을 다른 카드의 복제로 바꾼다(그 카드를 엿볼 수 있게).
      const real = PartyClass.prototype.lockAndShuffle;
      PartyClass.prototype.lockAndShuffle = async function (
        this: Party,
        deck,
        pass,
      ) {
        const out = await real.call(this, deck, pass);
        if (this.id === cheater && pass === "shuffle")
          out[1] = out[2] as bigint;
        return out;
      };
      try {
        const owners = new Map<number, number>();
        tokenDeal(rules).owners.forEach((seat, slot) => {
          if (seat >= 0) owners.set(slot, seat === 1 || seat === 2 ? seat : 0);
        });
        for (const d of devices) {
          d.start(1, [0, 1, 2], deckFor(rules));
          d.assign(1, owners);
        }
        // 정직한 기기는 할 수 있는 일(섞기 증명 계산·확인까지)을 모두 마친다.
        await settle();
        // 그 뒤에 기다리는 시간이 다 지나게 한다. 정직한 기기의 증명은 이미 와 있어 늦은 것으로 몰리지 않는다.
        clock.advance(PROOF_WAIT_MS);
        await settle();
      } finally {
        PartyClass.prototype.lockAndShuffle = real;
      }
      return { devices, problems };
    }

    it("정직하면 모두가 서로의 섞기 증명을 확인하고 아무도 짚지 않는다", async () => {
      const { devices, problems } = await run(null);
      expect(problems).toEqual([]);
      for (const d of devices) {
        const results = await Promise.all(stateOf(d)?.checked.values() ?? []);
        expect(results).toEqual([true, true]);
      }
    }, 180_000);

    it("복제 카드를 넣고 nonce를 숨기면(도전값을 정하지 못하게) 조작이 드러날 때 nonce를 공개하지 않은 그 기기를 짚는다", async () => {
      const { devices, problems } = await run(1, true);
      // 늦거나 없는 것만으로는 바로 탓하지 않는다(느린 정직한 기기일 수 있다).
      expect(problems.filter((p) => p.by !== 1 && p.device !== null)).toEqual(
        [],
      );
      // 같은 카드가 드러났을 때처럼 범인을 찾는다.
      for (const d of [devices[0], devices[2]]) {
        const culprit = await d?.shuffleCulprit(1);
        expect(culprit?.device).toBe(1);
        expect(culprit?.reason).toMatch(/nonce를 공개하지/);
      }
    }, 180_000);

    it("복제 카드를 넣고 섞으면(응답을 만들 수 없다) 조작이 드러날 때 다른 두 기기가 그 기기를 짚는다", async () => {
      const { devices } = await run(1);
      for (const d of [devices[0], devices[2]]) {
        const culprit = await d?.shuffleCulprit(1);
        expect(culprit?.device).toBe(1);
        expect(culprit?.reason).toMatch(/섞기 증명/);
      }
    }, 180_000);
  });
});
