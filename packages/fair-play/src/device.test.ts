import { describe, expect, it } from "vitest";

import {
  TEST_DECK as DECK,
  network,
  TEST_OWNERS as OWNERS,
} from "./device-fixture";
import type { Party, RevealReason } from "./protocol";

describe("메시지로 하는 멘탈 포커", () => {
  it("셋이 섞고 나누면 각자 자기 자리만 열고, 공개한 자리는 모두가 연다", async () => {
    const { devices, settle } = network([0, 1, 2]);
    // 연결 진단: 판 시작과 무거운 계산마다 걸린 시간을 알린다.
    const timings: string[] = [];
    devices[1]?.on("timing", (deal, what, ms, stage) => {
      if (deal === 1 && ms >= 0)
        timings.push(stage ? `${what}:${stage}` : what);
    });
    for (const d of devices) {
      d.start(1, [0, 1, 2], DECK);
      d.assign(1, OWNERS);
    }
    await settle();
    expect(devices[0]?.myCards(1).size).toBe(4);
    expect(devices[1]?.myCards(1).size).toBe(2);
    expect(devices[2]?.myCards(1).size).toBe(2);
    const all = devices.flatMap((d) => [...d.myCards(1).values()]);
    expect(new Set(all).size).toBe(8);
    expect(devices[2]?.open(1, 4)).toBeNull();

    devices[1]?.reveal(1, [4, 5], "dealMiss");
    await settle();
    expect(devices[0]?.open(1, 4)).toBe(devices[1]?.myCards(1).get(4));
    expect(devices[2]?.open(1, 5)).toBe(devices[1]?.myCards(1).get(5));
    devices[0]?.reveal(1, [0], "dealMiss");
    await settle();
    expect(devices[0]?.open(1, 0)).toBe(devices[0]?.myCards(1).get(0));

    for (const d of devices) d.revealAll(1);
    await settle();
    const cards = devices[2]?.openAll(1);
    expect(cards?.size).toBe(8);
    // 섞기 증명은 카드를 연 뒤 따로 이어서 계산한다.
    await settle();
    expect(timings).toEqual(
      expect.arrayContaining(["begin", "compute:shuffle", "proof:shuffle"]),
    );
  });

  describe("열쇠 증명: 카드가 열리지 않으면 누가 틀린 열쇠를 냈는지 짚는다", () => {
    async function dealt(cheater: number, reason: RevealReason) {
      const { devices, settle } = network([0, 1, 2]);
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
      for (const d of devices) d.start(1, [0, 1, 2], DECK);
      const p = party.get(1)?.party as Party;
      const real = p.revealKey.bind(p);
      p.revealKey = (slot, why) =>
        why === reason ? real(slot, why) + 1n : real(slot, why);
      for (const d of devices) d.assign(1, OWNERS);
      await settle();
      return { devices, problems, settle };
    }

    it("나눠 줄 때 남의 자리에 틀린 열쇠를 내면 받은 기기가 그 기기를 짚는다", async () => {
      const { problems } = await dealt(2, "deal");
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((p) => p.device === 2 && p.by !== 2)).toBe(true);
      expect(problems[0]?.reason).toMatch(/열쇠 증명 실패/);
    });

    it("카드를 낼 때 틀린 열쇠를 내면 모두가 그 기기를 짚는다", async () => {
      const { devices, problems, settle } = await dealt(1, "play");
      expect(problems).toEqual([]);
      const slot = [...(devices[1]?.myCards(1).keys() ?? [])][0] as number;
      devices[1]?.reveal(1, [slot], "play");
      await settle();
      // 속인 기기 자신의 알림은 보지 않는다(실제로 속이는 프로그램은 알리지 않는다).
      expect(
        problems.filter((p) => p.by !== 1).map((p) => [p.by, p.device]),
      ).toEqual([
        [0, 1],
        [2, 1],
      ]);
    });

    it("정직하게 두면 아무도 짚지 않고 판 끝에 모든 자리가 열린다", async () => {
      const { devices, problems, settle } = await dealt(1, "proof");
      for (const d of devices) d.revealAll(1);
      await settle();
      expect(problems).toEqual([]);
      expect(devices[0]?.openAll(1)?.size).toBe(8);
    });
  });
});
