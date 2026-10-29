// @vitest-environment node
import { presetRules } from "@mighty/engine";
import { Party, PROOF_DEFER_MS } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";
import { playRounds, settleDevices, setup, until } from "./fair-room-fixture";
import type { GuestRoom } from "./guest-room";

/** 기기가 기다리는 시간(증명 미루기 10초, 응답 30초의 두 배)을 넉넉히 넘긴다 */
const PROOF_WAIT_MS = 120_000;

/** 섞기 조작은 실제 53장 섞기 증명을 계산해 무거워, 다른 부정 시험(fair-room-cheat.test)과 나눠 동시에 돈다 */
describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 참가자(나머지는 정상)", () => {
    it("섞기 조작: 섞을 때 카드 한 장을 복제하면 섞기 증명으로 모두가 그 자리를 짚는다", async () => {
      const { host, guests, incidents, clock } = await setup(
        presetRules("standard5"),
        2,
      );
      const cheater = (guests[0] as GuestRoom).seat as number;
      // 0번 참가자 프로그램: 섞은 덱에서 한 장을 다른 카드의 복제로 바꾼다(그 카드를 엿보려고).
      // 속인 덱은 섞기 증명 응답을 만들 수 없어 보내지 않는다.
      const real = Party.prototype.lockAndShuffle;
      Party.prototype.lockAndShuffle = async function (
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
        await host.start();
        await until(() => guests.every((g) => g.match !== null));
        await playRounds(host, guests, 1, incidents);
        // 속인 기기 자신의 알림은 빼고 본다(실제로 속이는 프로그램은 알리지 않는다).
        const honest = () =>
          incidents.filter((i) => i.own && i.reporter !== cheater);
        // 같은 카드가 두 번 열리면 바로 판을 멈추고 "확인하는 중"을 알린다.
        await until(() => honest().some((i) => i.pending));
        // 정직한 기기들이 서로의 증명을 다 확인한 뒤 응답을 기다리는 시간이 지나게 한다.
        // 그러면 응답하지 않은 기기는 속인 기기 하나뿐이라 그 자리로 바꿔 알린다.
        // 시계는 두 번에 나눠 옮긴다. 내 카드가 안 열린 기기는 증명을 미루는데(PROOF_DEFER_MS),
        // 한 번에 다 옮기면 범인 찾기가 "시간이 다 됐다"고 보고 정직한 기기의 미룬 증명이 오기 전에 판단한다.
        // 먼저 미룬 증명이 시작되게 해 다 주고받은 뒤, 기다리는 시간을 지나게 한다.
        await settleDevices(host, guests);
        clock.advance(PROOF_DEFER_MS + 1);
        await settleDevices(host, guests);
        clock.advance(PROOF_WAIT_MS);
        await until(() => honest().filter((i) => !i.pending).length >= 2);
      } finally {
        Party.prototype.lockAndShuffle = real;
      }
      const own = incidents.filter(
        (i) => i.own && i.reporter !== cheater && !i.pending,
      );
      expect(own.every((i) => i.seat === cheater)).toBe(true);
      expect(own[0]?.reason).toMatch(/섞기 증명/);
    });
  });
});
