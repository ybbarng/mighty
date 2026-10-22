import { deckFor, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

declare function setTimeout(callback: () => void, ms: number): unknown;

import { tokenDeal } from "./blind";
import { FairDevice, type FairWire } from "./device";
import { type Party, Party as PartyClass, type RevealReason } from "./protocol";

/** 기기 셋을 메모리로 잇는다(메시지는 비동기로, 보낸 기기 번호와 함께) */
function network(ids: number[], proofTimeoutMs?: number) {
  const devices: FairDevice[] = [];
  for (const id of ids)
    devices.push(
      new FairDevice({
        id,
        group: "1024",
        ...(proofTimeoutMs ? { proofTimeoutMs } : {}),
        send: (m: FairWire) => {
          for (const d of devices)
            if (d.id !== id) setTimeout(() => d.receive(m, id), 0);
        },
      }),
    );
  return devices;
}

async function settle(devices: FairDevice[]) {
  for (let i = 0; i < 50; i++) {
    await new Promise<void>((r) => setTimeout(() => r(), 5));
    await Promise.all(devices.map((d) => d.idle()));
  }
}

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
    const proofsDone = (devices: FairDevice[]) =>
      devices.every((d) => (stateOf(d)?.checked.size ?? 0) === 2);

    async function run(cheater: number | null) {
      const rules = presetRules("standard5");
      const devices = network([0, 1, 2], 8000);
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
        await settle(devices);
        // 섞기 증명은 판 진행 줄 밖에서 계산한다. 확인이 다 끝날 때까지 기다린다.
        for (
          let i = 0;
          i < 400 && !proofsDone(devices) && problems.length < 2;
          i++
        )
          await new Promise<void>((r) => setTimeout(() => r(), 25));
        await settle(devices);
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
    }, 120_000);

    it("복제 카드를 넣고 섞으면 다른 두 기기가 섞기 증명으로 그 기기를 짚는다", async () => {
      const { problems } = await run(1);
      // 속인 덱으로는 응답을 만들 수 없다(정직한 응답 코드가 멈춘다). 응답하지 않아도 짚는다.
      const shuffle = problems.filter(
        (p) => p.by !== 1 && p.device !== null && /섞기 증명/.test(p.reason),
      );
      expect(shuffle.map((p) => [p.by, p.device]).sort()).toEqual([
        [0, 1],
        [2, 1],
      ]);
    }, 120_000);
  });
});
