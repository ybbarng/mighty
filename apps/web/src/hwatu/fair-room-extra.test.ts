/**
 * 화투 암호화방(멘탈 포커) 공통 진행의 시험: 새로고침·재연결·끊긴 사람, 그리고 고친 프로그램(부정).
 * 세 게임이 같은 진행(fair-play HwatuHostTable)을 쓰므로 가장 단순한 민화투로 본다. 끝까지 치는 시험은
 * 게임마다 따로 있다(minhwatu·gostop·nyrongppong `fair-room.test.ts`)
 */
import { type HwatuGuestSeat, Party } from "@mighty/fair-play";
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@mighty/minhwatu-ai";
import {
  type MinhwatuState,
  type MinhwatuView,
  STANDARD_RULES,
} from "@mighty/minhwatu-engine";
import {
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "@mighty/nyrongppong-ai";
import { STANDARD_RULES as NYRONGPPONG_RULES } from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { minhwatuKit } from "@/minhwatu/kit";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { nyrongppongKit } from "@/nyrongppong/kit";
import { ONLINE_CALL_SECONDS, onlineRules } from "@/nyrongppong/settings";

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

// biome-ignore lint/suspicious/noExplicitAny: 시험에서 진행 속을 들여다본다
type Seat = HwatuGuestSeat<any, any, MinhwatuView, any, any>;

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

describe("화투 암호화방: 고친 프로그램(부정)", () => {
  it("참가자가 남의 자리 카드를 내려 하면 방장이 바로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.fair !== null, "참가자 진행");
    const guest = guests[0] as AnyGuest;
    const seat = guest.fair as Seat;
    const cheater = guest.seat as number;
    // 참가자 프로그램: 카드를 낼 때 방장 손패 자리를 싣는다(열쇠는 공개하지 않는다).
    seat.outgoing = (action) => {
      const round = (guest.match as { current(): MinhwatuView }).current()
        .roundNumber;
      const layout = seat.coordinator.ctxOf(round)?.layout;
      return action.type === "play"
        ? { ...action, fairSlots: [layout?.hands[0]?.[0] ?? 0] }
        : action;
    };
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => incidents.length > 0,
    });
    expect(incidents[0]?.seat).toBe(cheater);
    expect(incidents[0]?.reason).toMatch(/자기 손에 없는 자리/);
  }, 180_000);

  it("참가자가 낸다고 한 카드와 다른 자리 열쇠를 공개하면 방장이 바로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.fair !== null, "참가자 진행");
    const guest = guests[0] as AnyGuest;
    const seat = guest.fair as Seat;
    const cheater = guest.seat as number;
    const honest = seat.outgoing.bind(seat);
    // 참가자 프로그램: 낼 카드 열쇠는 그대로 공개하고, 낸다고 하는 카드만 손패의 다른 카드로 바꾼다.
    seat.outgoing = (action) => {
      const out = honest(action);
      if (out?.type !== "play") return out;
      const hand = (guest.match as { current(): MinhwatuView }).current().hand;
      const other = hand.find((c) => c !== action.card);
      return other ? { ...out, card: other } : out;
    };
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => incidents.length > 0,
    });
    expect(incidents[0]?.seat).toBe(cheater);
    expect(incidents[0]?.reason).toMatch(/열쇠로 연 카드가 다르다/);
  }, 180_000);

  it("나눠 줄 때 잠글 때와 다른 열쇠를 주면 받은 사람이 열쇠 증명으로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(2);
    const cheater = guests[0]?.seat as number;
    const real = Party.prototype.revealKey;
    let lying = true;
    Party.prototype.revealKey = function (this: Party, slot, why) {
      const key = real.call(this, slot, why);
      return lying && this.id === cheater && why === "deal" ? key + 1n : key;
    };
    try {
      void host.start();
      await until(() => incidents.some((i) => i.own && i.seat !== null));
    } finally {
      lying = false;
      Party.prototype.revealKey = real;
    }
    const own = incidents.find((i) => i.own && i.seat !== null);
    expect(own?.seat).toBe(cheater);
    expect(own?.reason).toMatch(/열쇠 증명 실패/);
  }, 180_000);

  it("방장이 더미를 순서와 다르게 열라고 하면 참가자가 방장을 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.match !== null, "첫 화면");
    const seat = guests[0]?.fair as Seat;
    const ctx = seat.coordinator.ctxOf(1);
    if (!ctx) throw new Error("판이 없다");
    // 방장 프로그램: 더미 맨 위가 아니라 다섯째 자리를 모두에게 열라고 한다(미리 보기).
    (host as unknown as { send(m: unknown): void }).send({
      t: "fp",
      k: "deck",
      deal: ctx.dealId,
      slot: ctx.layout.deck[4],
      to: -1,
    });
    await until(() => incidents.some((i) => i.own), "참가자 알림");
    const own = incidents.find((i) => i.own);
    expect(own?.seat).toBe(0);
    expect(own?.reason).toMatch(/더미를 순서와 다르게/);
  }, 180_000);

  it("방장이 자기 차례에 카드를 내기 전에 뒤집을 카드를 열라고 하면 참가자가 방장을 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const mine = () => {
      const v = match.current() as MinhwatuView;
      return v.phase === "play" && v.turn === 0 && v.decision !== null;
    };
    // 방장 차례가 올 때까지 친다(방장 자리는 두지 않는다).
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: mine,
      skipHost: true,
    });
    const seat = guests[0]?.fair as Seat;
    await until(
      () =>
        (guests[0]?.match?.current() as MinhwatuView | undefined)?.turn === 0,
      "참가자 화면에 방장 차례",
    );
    const round = (match.current() as MinhwatuView).roundNumber;
    const ctx = seat.coordinator.ctxOf(round);
    if (!ctx) throw new Error("판이 없다");
    // 방장 프로그램: 카드를 내기 전에 더미 맨 위를 모두에게 열라고 한다(순서는 맞다).
    (host as unknown as { send(m: unknown): void }).send({
      t: "fp",
      k: "deck",
      deal: ctx.dealId,
      slot: ctx.layout.deck[ctx.deckNext],
      to: -1,
    });
    await until(() => incidents.some((i) => i.own), "참가자 알림");
    const own = incidents.find((i) => i.own);
    expect(own?.seat).toBe(0);
    expect(own?.reason).toMatch(/미리 보기/);
  }, 180_000);

  it("방장 엔진 상태에는 판이 끝나기 전까지 참가자 손패의 진짜 카드가 없다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const seen = new Set<string>();
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(host) !== "play" && phase(host) !== "pick",
      check: () => {
        const gv = guests[0]?.match?.current() as MinhwatuView | undefined;
        const raw = match.rawState() as MinhwatuState;
        if (!gv || gv.roundNumber !== raw.roundNumber) return;
        // 참가자 손에 아직 있는 카드는 방장 엔진 어디에도 없다(바닥·먹은 패·더미·손패).
        const text = JSON.stringify(raw);
        for (const card of gv.hand) {
          seen.add(card);
          expect(text).not.toContain(`"${card}"`);
        }
      },
    });
    expect(seen.size).toBeGreaterThan(0);
  }, 180_000);
});

describe("화투 암호화방: 나이롱뽕(가져온 카드는 그 사람만) 새로고침", () => {
  it("참가자와 방장이 한 번씩 새로고침해도 이어 치고, 모두의 검증을 통과한다", async () => {
    const rules = onlineRules({
      ...NYRONGPPONG_RULES,
      players: 3,
      rounds: 2,
    });
    const options = {
      kit: nyrongppongKit,
      rules,
      bot: nyrongppongIntermediateBot,
      botLevel: 1,
    };
    const { net, clock, host, guests, incidents, audits, store } =
      await setupHwatu({
        ...options,
        guests: 1,
        HostRoom: HostRoom as never,
        GuestRoom: GuestRoom as never,
        hostStore: true,
      });
    let current = host;
    const tick = () => {
      const raw = current.match?.rawState() as { phase?: string } | undefined;
      if (raw?.phase !== "call") return;
      const devices = [
        current.fair?.device,
        ...guests.map((g) => g.fair?.device),
      ];
      if (devices.some((d) => d?.busy())) return;
      const views = [
        current.match?.current(),
        ...guests.map((g) => g.match?.current()),
      ];
      if (views.some((v) => (v as { decision?: unknown })?.decision)) return;
      clock.advance(ONLINE_CALL_SECONDS * 1000 + 1);
    };
    await host.start();
    const play = (done: () => boolean) =>
      playHwatu({
        host: current,
        guests,
        bot: nyrongppongBeginnerBot,
        incidents,
        tick,
        done,
      });
    // 참가자 새로고침
    await play(() => (current.match?.actionLog().length ?? 0) >= 6);
    const old = guests[0] as AnyGuest;
    net.disconnect("g0");
    old.leave();
    const fresh = new GuestRoom({
      kit: nyrongppongKit,
      transport: net.join("g0-reloaded"),
      name: "손님0",
      token: old.token,
      secret: old.secret,
      fairStore: (old as unknown as { fairStore: never }).fairStore,
      clock,
    });
    fresh.on("incident", (n) => incidents.push(n as never));
    // 새로고침 전 참가자 객체의 알림(방장이 기록 없이 나갔다)은 보지 않는다.
    const freshAudits: typeof audits = [];
    fresh.on("audit", (r) => freshAudits.push(r));
    guests[0] = fresh as never;
    await until(
      () => (fresh.match?.current().hand.length ?? 0) > 0,
      "새로고침한 참가자 화면",
    );
    // 방장 새로고침: 참가자 차례가 온 때 끊고, 방장 연결이 없는 사이에 참가자가 행동을 낸다.
    // 그 행동은 어디에도 가지 않았다. 새로고침한 참가자의 보낸 행동 목록은 새로고침 뒤 것뿐이라
    // 기록 수(`mine`)로는 잃은 것을 알 수 없어, "못 보냈다" 표시로 다시 보내야 한다(예전에 30번에 1번 멈춤).
    const guestView = () =>
      fresh.match?.current() as { decision?: unknown } | undefined;
    await play(
      () =>
        (current.match?.actionLog().length ?? 0) >= 16 &&
        !!guestView()?.decision,
    );
    const states: string[] = [];
    fresh.on("connection", (s) => states.push(s as string));
    net.disconnect("host");
    await until(() => states.includes("reconnecting"), "방장 끊김");
    // 끊기기 직전 오가던 메시지로 차례가 이미 넘어갔으면 이 판에서는 "끊긴 사이 낸 행동"을 만들 수 없다.
    // 그때는 그 확인만 건너뛰고 새로고침 확인은 그대로 한다.
    const pendingView = guestView();
    const offline = !!pendingView?.decision;
    if (offline)
      expect(
        fresh.match?.submit(
          nyrongppongBeginnerBot.decide(pendingView as never, { seed: 99 }),
        ),
      ).toEqual({ ok: true });
    const mineBefore = (current.match?.actionLog() ?? []).filter(
      (e) => e.seat === fresh.seat,
    ).length;
    const restore = store?.load();
    current = new HostRoom({
      transport: net.join("host1"),
      ...hwatuHostOptions({ ...options, clock, ...(store ? { store } : {}) }),
      ...(restore ? { restore } : {}),
    } as never) as AnyHost;
    current.onIncident((n) => incidents.push(n));
    await until(
      () => current.lobby().seats.every((s) => s.connected),
      "참가자 다시 연결",
    );
    // 다시 이어지면 참가자 기기가 못 보낸 행동을 다시 보낸다. 방장이 이어 가기를 마치기 전에 닿아 거절되면
    // 화면에 다시 내 차례가 보이니 사람처럼 한 번 더 낸다. 그동안 방장과 컴퓨터도 평소처럼 둔다(판 끝 "계속"은
    // 모두가 눌러야 다음 판으로 넘어가므로, 참가자 것만 기다리면 방장 차례에서 멈춘다).
    if (offline)
      await play(
        () =>
          (current.match?.actionLog() ?? []).filter(
            (e) => e.seat === fresh.seat,
          ).length > mineBefore,
      );
    await play(
      () =>
        (current.match?.current() as { phase?: string } | undefined)?.phase ===
        "gameOver",
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    current.finish();
    await until(() => freshAudits.length >= 1, "판 끝 검증");
    expect(freshAudits).toEqual([{ ok: true }]);
  }, 180_000);
});
