import { heuristicBot } from "@mighty/ai";
import { type Action, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import type { HostMessage } from "./protocol";
import { MemoryNetwork } from "./transport";

/**
 * 모의 침투 보고서(2026-10-21)의 공격을 실제로 해 본다.
 * 공격자 한 명만 프로그램을 고치고 나머지는 정상 프로그램이다.
 */
const rules = presetRules("standard5");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(condition: () => boolean, tries = 3000): Promise<void> {
  for (let i = 0; i < tries && !condition(); i++) await flush();
  if (!condition()) throw new Error("조건을 기다리다 시간이 지났다");
}

async function room() {
  const net = new MemoryNetwork();
  const host = new HostRoom({
    transport: net.join("host"),
    hostName: "방장",
    rules,
    revealTimeoutMs: 300,
  });
  const fingerprint = await host.fingerprint();
  const a = new GuestRoom({
    transport: net.join("a"),
    name: "철수",
    token: null,
    hostFingerprint: fingerprint,
  });
  await until(() => a.seat !== null && a.lobby !== null);
  return { net, host, a, fingerprint };
}

async function playRounds(host: HostRoom, guest: GuestRoom, rounds: number) {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  for (let i = 0; i < 4000 && match.current().roundNumber <= rounds; i++) {
    const hv = match.current();
    if (hv.decision) match.submit(heuristicBot.decide(hv, { seed: i }));
    const gv = guest.match?.current();
    if (gv?.decision) guest.match?.submit(heuristicBot.decide(gv, { seed: i }));
    await flush();
    if (hv.phase === "gameOver") break;
  }
}

describe("방장이 고친 경우", () => {
  it("A1: 참가자 약속을 빼고 자기 값만으로 시드를 정하면 잡힌다", async () => {
    const { host, a } = await room();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    // 참가자에게 알리는 약속 목록에서 참가자 것을 빼고, 참가자 값도 쓰지 않는다.
    const send = host.transport.send.bind(host.transport);
    host.transport.send = (message, to) => {
      const m = message as HostMessage;
      if (m.t === "started")
        send(
          { ...m, commitments: m.commitments.filter((c) => c.seat === 0) },
          to,
        );
      else send(message, to);
    };
    const internals = host as unknown as {
      waitForReveals(): Promise<void>;
      guests: Map<number, { secret: string | null }>;
    };
    internals.waitForReveals = async () => {
      for (const g of internals.guests.values()) g.secret = null;
    };
    await host.start();
    await until(() => a.match !== null);
    await playRounds(host, a, 1);
    host.finish();
    await until(() => audits.length === 1);
    expect(audits[0]?.ok).toBe(false);
  });

  it("A3: 참가자가 낸 카드를 다른 카드로 바꿔 넣으면 잡힌다", async () => {
    const { host, a } = await room();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => a.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    let swapped = false;
    const original = match.submitAs.bind(match);
    match.submitAs = (seat: number, action: Action) => {
      if (!swapped && seat === a.seat && action.type === "play") {
        const view = match.viewFor(seat);
        const other =
          view.decision?.kind === "play"
            ? view.decision.cards.find((c) => c !== action.card)
            : undefined;
        if (other) {
          swapped = true;
          return original(seat, { type: "play", card: other });
        }
      }
      return original(seat, action);
    };
    // 카드를 낼 때까지(모두 포기해 다시 나누는 판이 있을 수 있다) 바꿔치기가 생길 때까지 둔다.
    for (let rounds = 3; rounds < 15 && !swapped; rounds += 3)
      await playRounds(host, a, rounds);
    host.finish();
    await until(() => audits.length === 1);
    expect(swapped).toBe(true);
    expect(audits[0]?.ok).toBe(false);
  });

  it("A2: 판 끝 기록을 공개하지 않고 나가면 검증 못 함으로 알린다", async () => {
    const { host, a } = await room();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => a.match !== null);
    host.close(); // finish() 없이 닫는다
    await until(() => audits.length === 1);
    expect(audits[0]?.ok).toBe(false);
  });
});

describe("컴퓨터 자리", () => {
  async function botRoom() {
    const net = new MemoryNetwork();
    const host = new HostRoom({
      transport: net.join("host"),
      hostName: "방장",
      rules,
      revealTimeoutMs: 300,
      bot: heuristicBot,
      botLevel: 1,
    });
    // 연결 알림을 놓치지 않게 지문을 먼저 받아 두고 들어간다.
    const hostFingerprint = await host.fingerprint();
    const a = new GuestRoom({
      transport: net.join("a"),
      name: "철수",
      token: null,
      hostFingerprint,
    });
    await until(() => a.seat !== null && a.lobby?.botLevel === 1);
    return { host, a };
  }

  it("정직한 방장이면 컴퓨터 수를 다시 계산해도 기록과 같다", async () => {
    const { host, a } = await botRoom();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => a.match !== null);
    await playRounds(host, a, 2);
    host.finish();
    await until(() => audits.length === 1, 20_000);
    expect(audits[0]).toEqual({ ok: true });
  }, 30_000);

  it("A4: 방장이 컴퓨터 자리를 다른 수로 조종하면 잡힌다", async () => {
    const { host, a } = await botRoom();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => a.match !== null);
    // 알린 실력(중수)과 다르게 두는 컴퓨터로 바꿔 둔다(모든 패를 보고 두는 것과 같은 효과).
    // 고를 수 있는 카드가 둘 이상이면 중수가 고른 것과 늘 다른 카드를 낸다.
    let rigs = 0;
    const rigged = {
      name: "rigged",
      decide(
        view: Parameters<typeof heuristicBot.decide>[0],
        rng: { seed: number },
      ) {
        const action = heuristicBot.decide(view, rng);
        const d = view.decision;
        if (action.type === "play" && d?.kind === "play") {
          const other = d.cards.find((c) => c !== action.card && c !== "JK");
          if (other) {
            rigs++;
            return { type: "play" as const, card: other };
          }
        }
        return action;
      },
    };
    (host.match as unknown as { bot: unknown }).bot = rigged;
    // 모두 포기해 카드를 한 장도 안 내는 판만 이어지면 조종할 일이 없다. 조종이 생길 때까지 둔다.
    for (let rounds = 2; rounds < 12 && rigs === 0; rounds += 2)
      await playRounds(host, a, rounds);
    expect(rigs).toBeGreaterThan(0);
    host.finish();
    await until(() => audits.length === 1, 20_000);
    expect(audits[0]?.ok).toBe(false);
  }, 30_000);
});

describe("참가자가 고친 경우", () => {
  it("B1: 새로고침한 사람의 토큰을 엿들어 자리를 빼앗지 못한다", async () => {
    const { net, host, a, fingerprint } = await room();
    // 게임 중에만 토큰으로 같은 자리에 돌아온다.
    await host.start();
    await until(() => a.match !== null);
    const seat = a.seat;
    const token = a.token as string;
    // 공격자: 방에 들어와 있다가 남의 입장 요청을 그대로 방장에게 다시 보낸다.
    const evil = net.join("evil");
    const stolen: unknown[] = [];
    evil.onMessage((m) => {
      if ((m as { t?: string }).t === "join") stolen.push(m);
    });
    await flush();
    // 철수가 새로고침: 같은 토큰으로 새 연결
    a.transport.leave();
    const a2 = new GuestRoom({
      transport: net.join("a2"),
      name: "철수",
      token,
      secret: a.secret,
      hostFingerprint: fingerprint,
    });
    await until(() => a2.seat !== null);
    await until(() => stolen.length > 0);
    // 엿들은 입장 요청을 방장에게 다시 보낸다.
    const welcomes: unknown[] = [];
    evil.onMessage((m) => {
      if ((m as { t?: string }).t === "welcome") welcomes.push(m);
    });
    for (const m of stolen) evil.send(m, "host");
    for (let i = 0; i < 200; i++) await flush();
    expect(welcomes.some((w) => (w as { seat: number }).seat === seat)).toBe(
      false,
    );
    expect(a2.seat).toBe(seat);
    host.close();
  });

  it("B2: 한 연결이 이름만 바꿔 여러 번 들어와도 자리는 하나다", async () => {
    const { net, host } = await room();
    const evil = net.join("evil");
    for (const name of ["가", "나", "다"])
      evil.send(
        { t: "join", name, token: null, commit: "x", nonce: name },
        "host",
      );
    for (let i = 0; i < 200; i++) await flush();
    const seats = host.lobby().seats.filter((s) => s.kind === "guest");
    expect(seats).toHaveLength(2); // 철수와 공격자 하나
    host.close();
  });

  it("B6: 참가자는 게임을 강제로 끝내지 못한다", async () => {
    const { host, a } = await room();
    await host.start();
    await until(() => a.match !== null);
    a.transport.send({ t: "action", action: { type: "retire" } }, "host");
    for (let i = 0; i < 100; i++) await flush();
    expect(host.match?.current().phase).not.toBe("gameOver");
    host.close();
  });

  it("B8: 약속과 다른 비밀 값을 내도 시작이 막히지 않는다", async () => {
    const { host, a } = await room();
    // 철수가 약속과 다른 값을 공개한다.
    (a as unknown as { secret: string }).secret = "약속과 다른 값";
    await host.start();
    expect(host.match).not.toBeNull();
    host.close();
  });
});
