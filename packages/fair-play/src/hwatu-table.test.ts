import { fullDeck } from "@mighty/engine";
import { describe, expect, it } from "vitest";
import { groupOf } from "./device";
import { network } from "./device-fixture";
import {
  HWATU_CARDS,
  hwatuDealId,
  hwatuLayout,
  realHwatuAction,
  swapTokens,
} from "./hwatu-table";
import { CARD_CODES, decode, encodedDeck } from "./protocol";

describe("카드 번호표", () => {
  it("마이티 53장 번호는 그대로이고 화투 48장은 뒤에 붙는다", () => {
    expect(CARD_CODES.slice(0, 53)).toEqual(fullDeck());
    expect(CARD_CODES.slice(53)).toEqual(HWATU_CARDS);
    expect(new Set(CARD_CODES).size).toBe(101);
  });

  it("화투 카드도 잠그기 전 값으로 바꾸고 되돌린다(r255)", () => {
    const g = groupOf("r255");
    const encoded = encodedDeck(g, HWATU_CARDS);
    expect(encoded.map((v) => decode(g, v))).toEqual([...HWATU_CARDS]);
    expect(() => encodedDeck(g, ["xx" as never])).toThrow();
  });
});

describe("화투 자리 배치와 자리 표", () => {
  it("자리 번호 순서로 손패, 그다음 바닥, 남은 것은 더미", () => {
    const layout = hwatuLayout([7, 7, 7], 6);
    expect(layout.hands[1]).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(layout.floor).toEqual([21, 22, 23, 24, 25, 26]);
    expect(layout.deck).toHaveLength(21);
    expect(layout.deck[0]).toBe(27);
    expect(hwatuDealId(2, 1)).toBe(129);
  });

  it("아는 자리 표만 진짜 카드로 바꾸고 모르는 수를 센다", () => {
    const { value, missing } = swapTokens(
      { hand: ["?_3", "?_4", "01g"], drawn: "?_9" },
      new Map([
        [3, "05p"],
        [9, "12d"],
      ]) as never,
    );
    expect(value).toEqual({ hand: ["05p", "?_4", "01g"], drawn: "12d" });
    expect(missing).toBe(1);
  });

  it("기록 속 행동에서 연 자리 칸을 뺀다", () => {
    expect(
      realHwatuAction({ type: "play", card: "01g", fairSlots: [3] }),
    ).toEqual({ type: "play", card: "01g" });
  });
});

describe("화투 48장 섞고 나누기(기기 셋, 메시지)", () => {
  it("손패는 받는 기기만, 바닥은 모두가 연다. 판 끝에 모두 열면 48장이 한 번씩 있다", async () => {
    const net = network([0, 1, 2]);
    const layout = hwatuLayout([7, 7, 7], 6);
    const owners = new Map<number, number>();
    layout.hands.forEach((slots, seat) => {
      for (const s of slots) owners.set(s, seat);
    });
    for (const s of layout.floor) owners.set(s, -1);
    for (const d of net.devices) {
      d.start(1, [0, 1, 2], HWATU_CARDS);
      d.assign(1, owners);
    }
    await net.settle();
    for (const d of net.devices) {
      expect(d.myCards(1).size).toBe(7);
      for (const s of layout.floor) expect(d.open(1, s)).not.toBeNull();
      // 남의 손패는 열 수 없다.
      for (const [seat, slots] of layout.hands.entries())
        if (seat !== d.id)
          for (const s of slots) expect(d.myCards(1).has(s)).toBe(false);
    }
    // 더미 맨 위를 1번 기기에게만(가져오기)
    const top = layout.deck[0] as number;
    for (const d of net.devices) d.assign(1, new Map([[top, 1]]));
    await net.settle();
    expect(net.devices[1]?.myCards(1).has(top)).toBe(true);
    expect(net.devices[0]?.open(1, top)).toBeNull();
    for (const d of net.devices) d.revealAll(1);
    await net.settle();
    const all = net.devices[0]?.openAll(1);
    expect(new Set(all?.values()).size).toBe(48);
  });
});
