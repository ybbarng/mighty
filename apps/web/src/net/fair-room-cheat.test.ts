import { presetRules, suitOf } from "@mighty/engine";
import { Party } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";
import { type Cheat, playRounds, setup, until } from "./fair-room-fixture";
import type { GuestRoom } from "./guest-room";

/** 기기가 기다리는 시간(증명 미루기 10초, 응답 30초의 두 배)을 넉넉히 넘긴다 */
const _PROOF_WAIT_MS = 120_000;

describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 참가자(나머지는 정상)", () => {
    it("무늬 안 따르기: 그 무늬 카드가 나중에 드러나는 순간 모두의 화면에 그 자리가 찍힌다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const cheater = guests[0]?.seat as number;
      let done = false;
      // 따라 낼 무늬가 있는데 다른 무늬를 한 번 낸다(정상 화면은 막지만 고친 프로그램은 그냥 보낸다).
      const cheat: Cheat = (view, key) => {
        const d = view.decision;
        const lead = view.trick?.plays[0]?.card;
        if (done || d?.kind !== "play" || !lead || view.trickIndex === 0)
          return null;
        if (key !== "g0") return null;
        const suit = suitOf(lead);
        const kiruda = view.goal?.kiruda;
        if (!suit || !view.hand.some((c) => suitOf(c) === suit)) return null;
        const off = view.hand.find(
          (c) =>
            suitOf(c) !== null &&
            suitOf(c) !== suit &&
            suitOf(c) !== kiruda &&
            !d.cards.includes(c),
        );
        if (!off) return null;
        done = true;
        return { type: "play", card: off };
      };
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      await playRounds(host, guests, 3, incidents, cheat);
      expect(done).toBe(true);
      await until(() => incidents.length > 0);
      const own = incidents.filter((i) => i.own);
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((i) => i.seat === cheater)).toBe(true);
      expect(own[0]?.reason).toMatch(/무늬|조커|규칙에 맞지 않는/);
      // 방장 대국도 멈췄다.
      expect(host.match?.halted).not.toBeNull();
    }, 180_000);

    it("틀린 열쇠: 나눠 줄 때 남의 자리에 잠글 때와 다른 열쇠를 공개하면 받은 사람들이 열쇠 증명으로 그 자리를 짚는다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const cheater = (guests[0] as GuestRoom).seat as number;
      // 0번 참가자 프로그램(기기 번호는 자리 번호): 남에게 주는 자리 열쇠를 바꿔 낸다.
      const real = Party.prototype.revealKey;
      Party.prototype.revealKey = function (this: Party, slot, why) {
        const key = real.call(this, slot, why);
        return this.id === cheater && why === "deal" ? key + 1n : key;
      };
      try {
        await host.start();
        await until(() => incidents.filter((i) => i.own).length >= 2);
      } finally {
        Party.prototype.revealKey = real;
      }
      const own = incidents.filter((i) => i.own);
      expect(own.every((i) => i.seat === cheater)).toBe(true);
      expect(own.map((i) => i.reporter).sort()).toEqual(
        [0, (guests[1] as GuestRoom).seat].sort(),
      );
      expect(own[0]?.reason).toMatch(/열쇠 증명 실패/);
    }, 180_000);

    it("가짜 카드: 다른 자리 열쇠로 다른 카드를 낸다고 하면 방장이 바로 잡는다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const guest = guests[0] as GuestRoom;
      const cheater = guest.seat as number;
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      let sent = false;
      const cheat: Cheat = (view, key) => {
        if (key !== "g0" || sent || view.decision?.kind !== "play") return null;
        const real = view.decision.cards[0];
        const outgoing = guest.fair?.outgoing({
          type: "play",
          card: real as never,
        });
        if (outgoing?.type !== "play") return null;
        // 열쇠는 진짜 카드 자리 것을 공개하고, 카드 이름만 마이티로 바꿔 보낸다.
        sent = true;
        const hostPeer = (guest as unknown as { hostId: string }).hostId;
        guest.transport.send(
          {
            t: "action",
            action: {
              ...outgoing,
              card: view.hand.includes("SA") ? "D2" : "SA",
            },
          },
          hostPeer,
        );
        return null;
      };
      await playRounds(host, guests, 1, incidents, cheat);
      await until(() => incidents.length > 0);
      const own = incidents.find((i) => i.own);
      expect(own?.seat).toBe(cheater);
      expect(own?.reason).toMatch(/열쇠로 연 카드/);
    }, 180_000);

    it("6마 죽이기 거짓말: 불린 카드를 갖고도 없다고 하면 마지막 턴에 그 자리가 찍힌다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard6"),
        3,
      );
      // 0번 참가자 프로그램: 죽이기 물음에 늘 "없다"고 답한다.
      let lied = false;
      const patchLiar = () => {
        const fair = guests[0]?.fair as unknown as {
          onQuery: (id: string, q: { kind: string; card?: string }) => void;
          answer: (id: string, have: boolean) => void;
          mySlotOf: (card: string) => number | null;
        } | null;
        if (!fair || (fair as { patched?: boolean }).patched) return;
        (fair as { patched?: boolean }).patched = true;
        const original = fair.onQuery.bind(fair);
        fair.onQuery = (id, q) => {
          if (q.kind === "kill" && q.card && fair.mySlotOf(q.card) !== null) {
            lied = true;
            fair.answer(id, false);
            return;
          }
          original(id, q);
        };
      };
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      patchLiar();
      // 사람 주공은 0번 참가자가 가진 카드를 부른다. 주공이 사람이도록 방장과 1번 참가자는
      // 공약을 가장 높게 건다(컴퓨터 주공이면 판을 다시 기다려야 해 시간이 운에 달렸다).
      const victim = guests[0] as GuestRoom;
      const killer: Cheat = (view, key) => {
        if (view.decision?.kind === "election" && key !== "g0") {
          const top = view.decision.bids.at(-1);
          return top ? { type: "bid", goal: top } : null;
        }
        if (view.decision?.kind !== "kill" || key === "g0") return null;
        const card = victim.match
          ?.current()
          .hand.find((c) => !view.killFailed.includes(c));
        return card ? { type: "kill", card } : null;
      };
      for (let round = 1; round <= 12 && !lied; round++)
        await playRounds(host, guests, round, incidents, killer);
      expect(lied).toBe(true);
      await playRounds(host, guests, 99, incidents);
      await until(() => incidents.length > 0);
      const own = incidents.filter((i) => i.own);
      expect(own[0]?.seat).toBe(guests[0]?.seat);
      expect(own[0]?.reason).toMatch(/없다고 했다/);
    }, 300_000);
  });
});
