import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@mighty/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuKit } from "@/minhwatu/kit";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import {
  type AnyGuest,
  type AnyHost,
  hwatuHostOptions,
  type memoryFairStore,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

const RULES = { ...STANDARD_RULES, rounds: 2 };

const setup = (guests: number, hostStore = false) =>
  setupHwatu({
    kit: minhwatuKit,
    rules: RULES,
    guests,
    bot: minhwatuIntermediateBot,
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
    hostStore,
  });

const phase = (host: AnyHost) =>
  (host.match?.current() as MinhwatuView | undefined)?.phase;

describe("화투 암호화방: 새로고침과 끊긴 사람", () => {
  it("참가자가 새로고침해도 같은 자리에서 이어 치고, 판마다 검증을 통과한다", async () => {
    const { net, clock, host, guests, incidents, verified } = await setup(1);
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => match.actionLog().length >= 5,
    });
    const old = guests[0] as AnyGuest;
    const store = (old as unknown as { fairStore: unknown }).fairStore;
    net.disconnect("g0");
    old.leave();
    const fresh = new GuestRoom({
      kit: minhwatuKit,
      transport: net.join("g0-reloaded"),
      name: "손님0",
      token: old.token,
      secret: old.secret,
      fairStore: store as ReturnType<typeof memoryFairStore>,
      clock,
    });
    fresh.on("incident", (n) => incidents.push(n as never));
    fresh.on("roundVerified", (r) => verified.push(r));
    await until(
      () => (fresh.match?.current().hand.length ?? 0) > 0,
      "새로고침한 참가자 화면",
    );
    await playHwatu({
      host,
      guests: [fresh as never],
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(host) === "gameOver",
    });
    expect(incidents).toEqual([]);
    await until(() => verified.length >= 1, "판마다 검증");
  }, 180_000);

  it("방장이 판 중간과 다음 판에서 새로고침해도 이어 치고, 모두의 검증을 통과한다", async () => {
    const { net, clock, host, guests, incidents, audits, store } = await setup(
      1,
      true,
    );
    await host.start();
    let current = host;
    for (const [k, point] of [4, 18].entries()) {
      await playHwatu({
        host: current,
        guests,
        bot: minhwatuBeginnerBot,
        incidents,
        done: () => (current.match?.actionLog().length ?? 0) >= point,
      });
      net.disconnect(k === 0 ? "host" : `host${k}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const restore = store?.load();
      current = new HostRoom({
        transport: net.join(`host${k + 1}`),
        ...hwatuHostOptions({
          kit: minhwatuKit,
          rules: RULES,
          bot: minhwatuIntermediateBot,
          botLevel: 1,
          clock,
          ...(store ? { store } : {}),
        }),
        ...(restore ? { restore } : {}),
      } as never) as AnyHost;
      current.onIncident((n) => incidents.push(n));
      await until(
        () => current.lobby().seats.every((s) => s.connected),
        "참가자 다시 연결",
      );
    }
    await playHwatu({
      host: current,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(current) === "gameOver",
    });
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    current.finish();
    await until(() => audits.length === 1, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
  }, 180_000);

  it("한 판짜리 게임도 마지막 판 카드가 열린 뒤에 게임 끝 검증을 통과한다", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuKit,
      rules: { ...STANDARD_RULES, rounds: 1 },
      guests: 2,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(host) === "gameOver",
    });
    await until(() => audits.length === 2, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  }, 180_000);

  it("끊긴 사람을 기다리다 투표가 열리고, 방장이 끝내기를 고르면 모두의 게임이 끝난다", async () => {
    const { net, clock, host, guests } = await setup(2);
    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    const seat0 = guests[0]?.seat ?? -1;
    net.disconnect("g0");
    await until(
      () => host.lobby().seats[seat0]?.connected === false,
      "끊김 알기",
    );
    expect(host.lobby().endVote).toBeUndefined();
    clock.advance(60_000);
    await until(() => host.lobby().endVote !== undefined, "투표 열림");
    host.vote(true);
    await until(() => phase(host) === "gameOver", "방장 게임 끝");
    await until(
      () =>
        (guests[1]?.match?.current() as MinhwatuView | undefined)?.phase ===
        "gameOver",
      "참가자 게임 끝",
    );
  }, 180_000);
});
