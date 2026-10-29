// @vitest-environment node
import { ManualClock, Party, prepareGroup } from "@mighty/fair-play";
import { heartsIntermediateBot, heartsNormalBot } from "@mighty/hearts-ai";
import { WINDOWS_RULES } from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom, type IncidentNotice } from "@/net/host-room";
import { type HostStore, memoryHostStore } from "@/net/host-store";

await prepareGroup("r255");

import { MemoryNetwork } from "@/net/transport";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { heartsKit } from "./kit";

async function until(condition: () => boolean, ms = 25_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * 끝 점수 기본 10점(규칙 문자열이 받는 가장 작은 값): 한 판에 26점이 나뉘어 대개 한 판, 드물게 두 판에 끝난다
 * (새로고침·끊김·부정·복기는 한 판이면 된다). 판이 바뀌어도 이어 가는지는 첫 시험이 27점으로 본다
 * (한 판에 나눠지는 점수가 26점이라 적어도 두 판)
 */
function hostOptions(clock: ManualClock, store?: HostStore, endScore = 10) {
  return {
    kit: heartsKit,
    hostName: "방장",
    rules: { ...WINDOWS_RULES, endScore },
    bot: heartsIntermediateBot,
    botLevel: 1,
    revealTimeoutMs: 500,
    fair: { group: "r255" as const },
    clock,
    ...(store ? { store } : {}),
  };
}

async function setup(
  guestCount: number,
  store?: HostStore,
  voteDelayMs?: number,
  endScore?: number,
) {
  const net = new MemoryNetwork();
  // 제한 시간(투표 열기 등)은 시험이 이 시계를 옮길 때만 지난다.
  const clock = new ManualClock();
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(clock, store, endScore),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom<
    typeof WINDOWS_RULES,
    never,
    never,
    never,
    never,
    never
  >[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      kit: heartsKit,
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      clock,
    });
    await until(() => guest.seat !== null);
    guests.push(guest as never);
  }
  await until(() => guests.every((g) => g.lobby?.seats.length === 4));
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests) g.on("incident", (n) => incidents.push(n));
  return { net, host, guests, incidents, clock };
}

/** 사람 자리도 중수 컴퓨터처럼 둔다. 같은 화면이면 다시 내지 않는다 */
async function playUntil(
  host: HostRoom<never, never, never, never, never, never>,
  guests: GuestRoom<never, never, never, never, never, never>[],
  done: () => boolean,
  incidents: IncidentNotice[],
): Promise<void> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const stamps = new Map<string, string>();
  const offs = guests.map((g, i) =>
    g.on("rejected", () => stamps.delete(`g${i}`)),
  );
  const start = Date.now();
  while (!done() && incidents.length === 0) {
    if (Date.now() - start > 25_000) {
      const raw = (
        match as unknown as {
          rawState(): {
            round: {
              phase: string;
              turn: number | null;
              trickIndex: number;
              trick: unknown;
              passes: unknown;
              hands: string[][];
            };
            roundNumber: number;
          };
        }
      ).rawState();
      const hv = match.current() as unknown as {
        decision: unknown;
        hand: string[];
      };
      throw new Error(
        `끝나지 않는다: ${JSON.stringify({ round: raw.roundNumber, phase: raw.round.phase, turn: raw.round.turn, trick: raw.round.trick, passes: raw.round.passes, hands: raw.round.hands.map((h) => h.length), hostDecision: hv.decision, hostHand: hv.hand, guests: guests.map((g) => ({ seat: g.seat, waiting: (g.fair as unknown as { waiting: boolean })?.waiting, decision: (g.match?.current() as unknown as { decision: unknown })?.decision })) })}`,
      );
    }
    const act = (key: string, view: never, submit: (a: never) => void) => {
      const v = view as {
        decision: unknown;
        roundNumber: number;
        phase: string;
        trickIndex: number;
        handCounts: number[];
        trick: { plays: unknown[] } | null;
      };
      if (!v?.decision) return;
      const stamp = JSON.stringify([
        v.roundNumber,
        v.phase,
        v.trickIndex,
        v.trick?.plays.length,
        v.handCounts,
      ]);
      if (stamps.get(key) === stamp) return;
      stamps.set(key, stamp);
      submit(heartsNormalBot.decide(view, { seed: 9 }) as never);
    };
    act("host", match.current(), (a) => match.submit(a));
    for (const [i, g] of guests.entries())
      if (g.match) act(`g${i}`, g.match.current(), (a) => g.match?.submit(a));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  for (const off of offs) off();
}

describe("하트 멘탈 포커 온라인 대전", () => {
  it("방장도 남의 패를 모른 채 카드를 넘기고 게임을 끝까지 두며(적어도 두 판), 판마다 모두가 다시 계산해 확인한다", async () => {
    const { host, guests, incidents } = await setup(
      2,
      undefined,
      undefined,
      27,
    );
    const verified: number[] = [];
    for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    const seen: string[] = [];
    guests[0]?.transport.onMessage((m) => seen.push(JSON.stringify(m)));

    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const match = host.match as unknown as {
      rawState(): { round: { hands: string[][] } };
      current(): { phase: string; roundNumber: number };
    };
    // 방장 엔진에는 참가자 카드가 자리 표로만 있다.
    for (const g of guests)
      expect(
        match
          .rawState()
          .round.hands[g.seat as number]?.every((c) => c.startsWith("?_")),
      ).toBe(true);

    await playUntil(
      host as never,
      guests as never,
      () => match.current().phase === "gameOver",
      incidents,
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    const rounds = match.current().roundNumber;
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    // 판마다 검증은 판 끝 기록을 받은 뒤 비동기로 끝난다.
    await until(() => verified.length >= rounds * guests.length);
    // 참가자가 받은 메시지에 손패 전체가 없다. 넘긴 카드 열쇠는 받는 사람에게만 갔다.
    expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    expect(
      seen
        .filter((m) => m.includes('"handover"'))
        .every((m) => m.includes(`"to":${guests[0]?.seat}`)),
    ).toBe(true);
  });

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
      await new Promise((resolve) => setTimeout(resolve, 20));
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

  it("복기: 방장이 남기는 기록(판별 실제 패 포함)을 다시 돌리면 실제 카드로 같은 판이 나온다", async () => {
    const { host, guests, incidents } = await setup(2);
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const match = host.match as unknown as {
      current(): { phase: string };
    };
    // 끝 점수 10점이라 대개 한 판, 드물게 두 판에 끝난다
    await playUntil(
      host as never,
      guests as never,
      () => match.current().phase === "gameOver",
      incidents,
    );
    const source = (
      host as unknown as { archiveSource(): ArchiveSource }
    ).archiveSource();
    const replayed = replayArchive(heartsKit, {
      id: "online:test",
      game: "hearts",
      mode: "online",
      startedAt: 0,
      updatedAt: 0,
      ...source,
      seat: 0,
      seatNames: null,
      rounds: 1,
      over: false,
    });
    expect(replayed.error).toBeNull();
    const scoredAt = replayed.events.findIndex((e) =>
      (e as { type: string }[]).some((x) => x.type === "roundScored"),
    );
    expect(scoredAt).toBeGreaterThan(0);
    const state = replayed.states[scoredAt] as {
      round: { tricks: { plays: { card: string }[] }[] };
    };
    expect(
      state.round.tricks
        .flatMap((t) => t.plays)
        .every((p) => !p.card.startsWith("?_")),
    ).toBe(true);
  });
});
