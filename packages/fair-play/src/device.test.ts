import { deckFor, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

declare function setTimeout(callback: () => void, ms: number): unknown;

import { tokenDeal } from "./blind";
import { FairDevice, type FairWire } from "./device";

/** 기기 셋을 메모리로 잇는다(메시지는 비동기로, 보낸 기기 번호와 함께) */
function network(ids: number[]) {
  const devices: FairDevice[] = [];
  for (const id of ids)
    devices.push(
      new FairDevice({
        id,
        group: "1024",
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
});
