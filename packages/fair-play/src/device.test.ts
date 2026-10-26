import { deckFor, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

declare function setTimeout(callback: () => void, ms: number): unknown;

import { tokenDeal } from "./blind";
import { network, settle } from "./device-fixture";
import type { Party, RevealReason } from "./protocol";

describe("메시지로 하는 멘탈 포커", () => {
  it("셋이 섞고 나누면 각자 자기 자리만 열고, 공개한 자리는 모두가 연다", async () => {
    const rules = presetRules("standard5");
    const devices = network([0, 1, 2]);
    const plan = tokenDeal(rules);
    // 자리 0·3·4는 0번 기기(방장과 컴퓨터), 1·2는 각자
    const deviceOf = (seat: number) => (seat === 1 || seat === 2 ? seat : 0);
    const owners = new Map<number, number>();
    plan.owners.forEach((seat, slot) => {
      if (seat >= 0) owners.set(slot, deviceOf(seat));
    });
    for (const d of devices) {
      d.start(1, [0, 1, 2], deckFor(rules));
      d.assign(1, owners);
    }
    await settle(devices);
    expect(devices[0]?.myCards(1).size).toBe(30);
    expect(devices[1]?.myCards(1).size).toBe(10);
    expect(devices[2]?.myCards(1).size).toBe(10);
    const all = devices.flatMap((d) => [...d.myCards(1).values()]);
    expect(new Set(all).size).toBe(50);
    expect(devices[2]?.open(1, 10)).toBeNull();

    devices[1]?.reveal(1, [10, 11], "dealMiss");
    await settle(devices);
    expect(devices[0]?.open(1, 10)).toBe(devices[1]?.myCards(1).get(10));
    expect(devices[2]?.open(1, 11)).toBe(devices[1]?.myCards(1).get(11));
    devices[0]?.reveal(1, [0], "dealMiss");
    await settle(devices);
    expect(devices[0]?.open(1, 0)).toBe(devices[0]?.myCards(1).get(0));

    for (const d of devices) d.revealAll(1);
    await settle(devices);
    const cards = devices[2]?.openAll(1);
    expect(cards?.size).toBe(53);
  }, 60_000);

  describe("열쇠 증명: 카드가 열리지 않으면 누가 틀린 열쇠를 냈는지 짚는다", () => {
    async function dealt(cheater: number, reason: RevealReason) {
      const rules = presetRules("standard5");
      const devices = network([0, 1, 2]);
      const problems: { by: number; device: number | null; reason: string }[] =
        [];
      for (const d of devices)
        d.on("problem", (_deal, reason, device) =>
          problems.push({ by: d.id, device, reason }),
        );
      // 속이는 기기: 그 까닭으로 공개하는 열쇠를 다른 값으로 바꾼다(잠글 때는 진짜 열쇠를 썼다).
      const party = (
        devices[cheater] as unknown as {
          deals: Map<number, { party: Party }>;
        }
      ).deals;
      const plan = tokenDeal(rules);
      const deviceOf = (seat: number) => (seat === 1 || seat === 2 ? seat : 0);
      const owners = new Map<number, number>();
      plan.owners.forEach((seat, slot) => {
        if (seat >= 0) owners.set(slot, deviceOf(seat));
      });
      for (const d of devices) d.start(1, [0, 1, 2], deckFor(rules));
      const p = party.get(1)?.party as Party;
      const real = p.revealKey.bind(p);
      p.revealKey = (slot, why) =>
        why === reason ? real(slot, why) + 1n : real(slot, why);
      for (const d of devices) d.assign(1, owners);
      await settle(devices);
      return { devices, problems };
    }

    it("나눠 줄 때 남의 자리에 틀린 열쇠를 내면 받은 기기가 그 기기를 짚는다", async () => {
      const { problems } = await dealt(2, "deal");
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((p) => p.device === 2 && p.by !== 2)).toBe(true);
      expect(problems[0]?.reason).toMatch(/열쇠 증명 실패/);
    }, 60_000);

    it("카드를 낼 때 틀린 열쇠를 내면 모두가 그 기기를 짚는다", async () => {
      const { devices, problems } = await dealt(1, "play");
      expect(problems).toEqual([]);
      const slot = [...(devices[1]?.myCards(1).keys() ?? [])][0] as number;
      devices[1]?.reveal(1, [slot], "play");
      await settle(devices);
      // 속인 기기 자신의 알림은 보지 않는다(실제로 속이는 프로그램은 알리지 않는다).
      expect(
        problems.filter((p) => p.by !== 1).map((p) => [p.by, p.device]),
      ).toEqual([
        [0, 1],
        [2, 1],
      ]);
    }, 60_000);

    it("정직하게 두면 아무도 짚지 않고 판 끝에 모든 자리가 열린다", async () => {
      const { devices, problems } = await dealt(1, "proof");
      for (const d of devices) d.revealAll(1);
      await settle(devices);
      expect(problems).toEqual([]);
      expect(devices[0]?.openAll(1)?.size).toBe(53);
    }, 60_000);
  });
});
