// @vitest-environment node
import { Party } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { memoryHostStore } from "@/net/host-store";

import { hostOptions, playUntil, setup, until } from "./fair-room-fixture";

/** 새로고침·끊김·부정. 끝까지 두기와 복기는 fair-room.test.ts가 본다 */
describe("하트 멘탈 포커 온라인 대전: 새로고침·끊김·부정", () => {
  it("방장이 카드 넘기기와 첫 판 중간에 새로고침해도 이어 가고, 모두의 검증을 통과한다", async () => {
    const store = memoryHostStore();
    const { net, host, guests, incidents, clock } = await setup(2, store);
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    let current = host as unknown as HostRoom<
      never,
      never,
      never,
      never,
      never,
      never
    >;
    // 넘기기 도중, 그리고 카드 내기 도중에 한 번씩 새로고침한다.
    for (const [k, point] of [2, 20].entries()) {
      await playUntil(
        current,
        guests as never,
        () => (current.match?.actionLog().length ?? 0) >= point,
        incidents,
      );
      net.disconnect(k === 0 ? "host" : `host${k}`);
      // 메모리 네트워크는 끊김 알림을 마이크로태스크로 보내므로, 다음 차례 하나만 양보하면 모두에게 닿는다
      await new Promise((resolve) => setTimeout(resolve, 0));
      const restore = store.load();
      current = new HostRoom({
        transport: net.join(`host${k + 1}`),
        ...hostOptions(clock, store),
        ...(restore ? { restore } : {}),
      }) as never;
      current.onIncident((n) => incidents.push(n));
      await until(() => current.lobby().seats.every((s) => s.connected));
    }
    await playUntil(
      current,
      guests as never,
      () =>
        (current.match?.current() as { phase: string } | undefined)?.phase ===
        "gameOver",
      incidents,
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
  });

  it("카드를 넘기는 중에 끊긴 사람을 기다리다 방장이 끝내기를 고르면 모두의 게임이 끝난다", async () => {
    const { net, host, guests, clock } = await setup(3, undefined, 50);
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const seat0 = guests[0]?.seat ?? -1;
    net.disconnect("g0");
    // 방장이 끊김을 안 뒤 기다리는 시간(50ms)이 지나면 투표가 열린다.
    await until(() => host.lobby().seats[seat0]?.connected === false);
    expect(host.lobby().endVote).toBeUndefined();
    clock.advance(50);
    await until(() => host.lobby().endVote !== undefined);
    host.vote(true);
    const phase = (m: { current(): unknown } | null | undefined) =>
      (m?.current() as { phase?: string } | undefined)?.phase;
    await until(() => phase(host.match) === "gameOver");
    await until(() =>
      guests.slice(1).every((g) => phase(g.match) === "gameOver"),
    );
  });

  it("넘기는 카드에 잠글 때와 다른 열쇠를 주면 받은 사람이 열쇠 증명으로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(3);
    const cheater = guests[0]?.seat as number;
    // 0번 참가자 프로그램: 카드를 넘길 때 주는 자기 열쇠를 바꾼다(넘기기 열쇠는 "audit"으로 꺼낸다).
    const real = Party.prototype.revealKey;
    let passing = true;
    Party.prototype.revealKey = function (this: Party, slot, why) {
      const key = real.call(this, slot, why);
      return passing && this.id === cheater && why === "audit" ? key + 1n : key;
    };
    try {
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      await playUntil(
        host as never,
        guests as never,
        () => incidents.some((i) => i.own),
        incidents,
      );
    } finally {
      passing = false;
      Party.prototype.revealKey = real;
    }
    const own = incidents.filter((i) => i.own);
    expect(own[0]?.seat).toBe(cheater);
    expect(own[0]?.reason).toMatch(/열쇠 증명 실패/);
  });
});
