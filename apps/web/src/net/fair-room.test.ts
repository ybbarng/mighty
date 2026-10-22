import { heuristicBot } from "@mighty/ai";
import {
  type Action,
  type PlayerView,
  presetRules,
  type RuleSet,
  suitOf,
} from "@mighty/engine";
import { isToken, Party } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";

import { type AuditResult, type FairSaved, GuestRoom } from "./guest-room";
import { HostRoom, type IncidentNotice } from "./host-room";
import { type HostStore, memoryHostStore } from "./host-store";
import { MemoryNetwork } from "./transport";

const _flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(condition: () => boolean, ms = 60_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** 참가자 브라우저 저장소(새로고침해도 남는다) */
function memoryStore() {
  let saved: FairSaved | null = null;
  return {
    load: () => saved,
    save: (s: FairSaved) => {
      saved = JSON.parse(JSON.stringify(s));
    },
  };
}

function hostOptions(rules: RuleSet, store?: HostStore) {
  return {
    hostName: "방장",
    rules,
    revealTimeoutMs: 500,
    bot: heuristicBot,
    botLevel: 1,
    fair: { group: "1024" as const },
    ...(store ? { store } : {}),
  };
}

async function setup(
  rules: RuleSet,
  guestCount: number,
  store?: HostStore,
  voteDelayMs?: number,
) {
  const net = new MemoryNetwork();
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(rules, store),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      fairStore: memoryStore(),
    });
    await until(() => guest.seat !== null);
    guests.push(guest);
  }
  await until(() =>
    guests.every((g) => g.lobby?.seats.length === rules.playerCount),
  );
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests) g.on("incident", (n) => incidents.push(n));
  return { net, host, guests, incidents };
}

type Cheat = (view: PlayerView, key: string) => Action | null;

/** 사람 자리(방장과 참가자)도 봇처럼 둔다. `cheat`가 행동을 돌려주면 0번 참가자는 그것을 낸다 */
async function playRounds(
  host: HostRoom,
  guests: GuestRoom[],
  rounds: number,
  incidents: IncidentNotice[],
  cheat?: Cheat,
): Promise<number> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const submitted = new Map<string, string>();
  const start = Date.now();
  let scored = 0;
  match.subscribe((snapshot) => {
    if (snapshot.events.some((e) => e.type === "roundScored")) scored++;
  });
  // 거절되면(예: 낸 직후 새로고침해 열쇠가 가지 못함) 사람처럼 다시 낸다.
  const offs = guests.map((g, i) =>
    g.on("rejected", () => submitted.delete(`g${i}`)),
  );
  match.drain();
  while (scored < rounds) {
    if (Date.now() - start > 120_000) throw new Error("판이 끝나지 않는다");
    if (incidents.length > 0) break;
    const hostView = match.current();
    if (hostView.phase === "gameOver") break;
    const act = (
      key: string,
      view: typeof hostView,
      submit: (a: never) => void,
    ) => {
      if (!view.decision) return;
      const stamp = JSON.stringify([
        view.roundNumber,
        view.phase,
        view.trickIndex,
        view.trick?.plays.length,
        view.election.log.length,
        view.decision.kind,
        view.turn,
        view.dead,
        view.killFailed,
        view.handCounts,
      ]);
      if (submitted.get(key) === stamp) return;
      submitted.set(key, stamp);
      const forced = cheat ? cheat(view, key) : null;
      submit((forced ?? heuristicBot.decide(view, { seed: 7 })) as never);
    };
    act("host", hostView, (a) => match.submit(a));
    for (const [i, g] of guests.entries()) {
      const view = g.match?.current();
      if (view) act(`g${i}`, view, (a) => g.match?.submit(a));
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  for (const off of offs) off();
  return scored;
}

describe("멘탈 포커 온라인 대전", () => {
  it.each([
    ["2마", "standard2", 1],
    ["5마", "standard5", 2],
    ["6마", "standard6", 3],
  ] as const)(
    "%s: 방장도 남의 패를 모른 채 두 판을 끝까지 두고, 판마다 모두가 진짜 카드로 다시 계산해 확인한다",
    async (_name, preset, guestCount) => {
      const rules = presetRules(preset);
      const { host, guests, incidents } = await setup(rules, guestCount);
      const verified: number[] = [];
      for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
      const audits: AuditResult[] = [];
      for (const g of guests) g.on("audit", (r) => audits.push(r));
      const seen: string[] = [];
      guests[0]?.transport.onMessage((m) => seen.push(JSON.stringify(m)));

      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      // 방장 엔진 상태에는 참가자 카드가 자리 표로만 있다.
      const state = host.match?.rawState();
      for (const g of guests)
        expect(
          state?.round.hands[g.seat as number]?.every((c) => isToken(c)),
        ).toBe(true);

      const scored = await playRounds(host, guests, 2, incidents);
      expect(
        incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`),
      ).toEqual([]);
      await until(
        () =>
          guests.every(
            (g) =>
              g.match?.current().roundNumber ===
              host.match?.current().roundNumber,
          ),
        30_000,
      ).catch(() => {
        throw new Error(
          `판 번호: 방장 ${host.match?.current().roundNumber}, 참가자 ${guests.map((g) => `${g.match?.current().roundNumber}(${g.fair?.coordinator.deal}:${g.fair?.device.myCards(g.fair.coordinator.deal).size})`).join(",")} 방장 기기 ${host.fair?.device.myCards(host.fair.coordinator.deal).size} ${host.fair?.device.ledger(host.fair.coordinator.deal)?.deck.length}`,
        );
      });
      await until(() => verified.length >= scored * guestCount);
      host.finish();
      await until(() => audits.length === guestCount);
      expect(audits.filter((a) => !a.ok)).toEqual([]);
      // 끝까지 둔 판마다 각 참가자가 마지막 턴에 판 전체를 진짜 카드로 다시 계산했다.
      expect(verified.length).toBeGreaterThanOrEqual(scored * guestCount);
      expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    },
    180_000,
  );

  it("판 중간에 참가자가 새로고침해도 남겨 둔 열쇠로 같은 자리에서 이어 가고, 검증도 통과한다", async () => {
    const { net, host, guests, incidents } = await setup(
      presetRules("standard5"),
      2,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    // 판을 조금 진행한다.
    const match = host.match;
    for (let i = 0; i < 400 && (match?.actionLog().length ?? 0) < 12; i++) {
      const views: [string, PlayerView | undefined, (a: never) => void][] = [
        ["h", match?.current(), (a) => match?.submit(a)],
        ...guests.map(
          (g, k) =>
            [`g${k}`, g.match?.current(), (a: never) => g.match?.submit(a)] as [
              string,
              PlayerView | undefined,
              (a: never) => void,
            ],
        ),
      ];
      for (const [, view, submit] of views)
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 3 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const old = guests[0] as GuestRoom;
    const store = (
      old as unknown as { fairStore: ReturnType<typeof memoryStore> }
    ).fairStore;
    const token = old.token;
    const secret = old.secret;
    // 새로고침: 연결이 끊기고(메모리 상태는 사라진다) 같은 토큰·저장소로 새로 들어온다.
    net.disconnect("g0");
    old.leave();
    const fresh = new GuestRoom({
      transport: net.join("g0-reloaded"),
      name: "손님0",
      token,
      secret,
      fairStore: store,
    });
    fresh.on("incident", (n) => incidents.push(n));
    await until(
      () => fresh.match !== null && fresh.match.current().hand.length > 0,
    );
    guests[0] = fresh;
    const verified: number[] = [];
    fresh.on("roundVerified", (d) => verified.push(d));
    const scored = await playRounds(host, guests, 1, incidents);
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    expect(scored).toBe(1);
    await until(() => verified.length > 0);
  }, 180_000);

  it("끊긴 사람을 기다리다 투표가 열리고, 남은 사람의 과반이 끝내기를 고르면 모두의 게임이 끝난다", async () => {
    const { net, host, guests } = await setup(
      presetRules("standard5"),
      3,
      undefined,
      50,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const [, g1, g2] = guests as [GuestRoom, GuestRoom, GuestRoom];
    // 돌아오면 투표를 닫는다.
    net.disconnect("g0");
    await until(() => g1.lobby?.endVote !== undefined);
    net.reconnect("g0");
    (guests[0] as GuestRoom).leave();
    const back = new GuestRoom({
      transport: net.join("g0-back"),
      name: "손님0",
      token: (guests[0] as GuestRoom).token,
      secret: (guests[0] as GuestRoom).secret,
      fairStore: (
        guests[0] as unknown as { fairStore: ReturnType<typeof memoryStore> }
      ).fairStore,
    });
    await until(() => back.seat !== null && g1.lobby?.endVote === undefined);
    // 다시 끊기면 기다렸다 다시 연다. 한 사람(3명 중 1명)의 끝내기로는 끝나지 않는다.
    net.disconnect("g0-back");
    await until(() => g1.lobby?.endVote !== undefined);
    g1.vote(true);
    host.vote(false);
    await until(() => g2.lobby?.endVote?.votes.length === 2);
    expect(host.match?.current().phase).not.toBe("gameOver");
    g2.vote(true);
    await until(() => host.match?.current().phase === "gameOver");
    await until(() =>
      [g1, g2].every((g) => g.match?.current().phase === "gameOver"),
    );
    expect(g1.lobby?.endVote).toBeUndefined();
  }, 120_000);

  it("방장이 잠깐 끊겼다 돌아오면 참가자는 기다렸다 같은 판을 이어 간다", async () => {
    const { net, host, guests, incidents } = await setup(
      presetRules("standard5"),
      2,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const states: string[] = [];
    for (const g of guests) g.on("connection", (s) => states.push(s));
    const match = host.match;
    for (let i = 0; i < 400 && (match?.actionLog().length ?? 0) < 10; i++) {
      for (const [view, submit] of [
        [match?.current(), (a: never) => match?.submit(a)],
        ...guests.map((g) => [
          g.match?.current(),
          (a: never) => g.match?.submit(a),
        ]),
      ] as [PlayerView | undefined, (a: never) => void][])
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 5 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    net.disconnect("host");
    await until(() => states.filter((s) => s === "reconnecting").length === 2);
    net.reconnect("host");
    await until(() => states.filter((s) => s === "connected").length === 2);
    const scored = await playRounds(host, guests, 1, incidents);
    expect(incidents.map((i) => i.reason)).toEqual([]);
    expect(scored).toBe(1);
  }, 180_000);

  /** 행동 기록이 `count`개가 될 때까지 모두 봇처럼 둔다 */
  async function advance(host: HostRoom, guests: GuestRoom[], count: number) {
    const match = host.match;
    for (let i = 0; i < 2000 && (match?.actionLog().length ?? 0) < count; i++) {
      for (const [view, submit] of [
        [match?.current(), (a: never) => match?.submit(a)],
        ...guests.map((g) => [
          g.match?.current(),
          (a: never) => g.match?.submit(a),
        ]),
      ] as [PlayerView | undefined, (a: never) => void][])
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 5 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  it.each([
    ["5마", "standard5", 2, [8, 30]],
    ["6마", "standard6", 3, [14, 40]],
  ] as const)(
    "%s: 방장이 판 중간에 새로고침해도 남긴 방으로 이어 가고, 모두의 검증을 통과한다",
    async (_name, preset, guestCount, points) => {
      const rules = presetRules(preset);
      const store = memoryHostStore();
      const { net, host, guests, incidents } = await setup(
        rules,
        guestCount,
        store,
      );
      const audits: AuditResult[] = [];
      for (const g of guests) g.on("audit", (r) => audits.push(r));
      const verified: number[] = [];
      for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      let current = host;
      for (const [k, point] of points.entries()) {
        await advance(current, guests, point);
        const before = current.match?.actionLog().length ?? 0;
        // 새로고침: 방장 기기 메모리는 사라지고, 남긴 것으로 새 연결에서 방을 다시 연다.
        net.disconnect(k === 0 ? "host" : `host${k}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const restore = store.load();
        expect(restore?.saved.match).not.toBeNull();
        current = new HostRoom({
          transport: net.join(`host${k + 1}`),
          ...hostOptions(rules, store),
          ...(restore ? { restore } : {}),
        });
        current.onIncident((n) => incidents.push(n));
        expect(current.match?.actionLog().length).toBe(before);
        await until(() => current.lobby().seats.every((s) => s.connected));
        // 섞기 사슬이 다시 모이면 "섞는 중"이 꺼진다(방장 화면이 판 끝 결과를 가리지 않게).
        let busy: unknown = "모름";
        current.fair?.coordinator.onBusy((b) => {
          busy = b;
        });
        await until(() => busy === null, 20_000).catch(() => {
          throw new Error(`섞는 중이 꺼지지 않는다: ${String(busy)}`);
        });
      }
      const scored = await playRounds(current, guests, 2, incidents);
      expect(
        incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`),
      ).toEqual([]);
      expect(scored).toBe(2);
      current.finish();
      await until(() => audits.length === guestCount);
      expect(audits.filter((a) => !a.ok)).toEqual([]);
      expect(verified.length).toBeGreaterThanOrEqual(2 * guestCount);
    },
    240_000,
  );

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
      // 사람 주공은 0번 참가자가 가진 카드를 부른다(컴퓨터 주공이면 다음 판을 기다린다).
      const victim = guests[0] as GuestRoom;
      const killer: Cheat = (view, key) => {
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
