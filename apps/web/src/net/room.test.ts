import { heuristicBot } from "@mighty/ai";
import { encodeRuleString, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import { memoryHostStore } from "./host-store";
import type { AuditReport, HostMessage } from "./protocol";
import { MemoryNetwork } from "./transport";

const rules = presetRules("standard5");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(condition: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries && !condition(); i++) await flush();
  if (!condition()) throw new Error("조건을 기다리다 시간이 지났다");
}

async function setup() {
  const net = new MemoryNetwork();
  const host = new HostRoom({
    transport: net.join("host"),
    hostName: "방장",
    rules,
    revealTimeoutMs: 500,
    standInDelayMs: 10,
  });
  const a = new GuestRoom({
    transport: net.join("a"),
    name: "철수",
    token: null,
  });
  // 두 사람이 동시에 들어오면 앉는 순서가 그때그때 달라진다. 앞사람이 앉은 뒤에 들어온다.
  await until(() => a.seat !== null);
  const b = new GuestRoom({
    transport: net.join("b"),
    name: "영희",
    token: null,
  });
  await until(() => a.seat !== null && b.seat !== null);
  return { net, host, a, b };
}

/** 사람 자리(방장과 참가자)도 봇처럼 두게 해서 판을 진행한다 */
async function playRounds(
  host: HostRoom,
  guests: GuestRoom[],
  rounds: number,
): Promise<void> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  for (let i = 0; i < 5000 && match.current().roundNumber <= rounds; i++) {
    const hostView = match.current();
    if (hostView.decision)
      match.submit(heuristicBot.decide(hostView, { seed: i }));
    for (const g of guests) {
      const view = g.match?.current();
      if (view?.decision)
        g.match?.submit(heuristicBot.decide(view, { seed: i }));
    }
    await flush();
    if (hostView.phase === "gameOver") break;
  }
}

describe("온라인 방", () => {
  it("참가자는 차례대로 빈자리에 앉고, 나머지는 컴퓨터다", async () => {
    const { host, a, b } = await setup();
    expect([a.seat, b.seat]).toEqual([1, 2]);
    await until(() => a.lobby?.seats.length === 5);
    expect(a.lobby?.seats.map((s) => [s.name, s.kind])).toEqual([
      ["방장", "host"],
      ["철수", "guest"],
      ["영희", "guest"],
      ["지호", "bot"],
      ["하린", "bot"],
    ]);
    expect(host.lobby().started).toBe(false);
  });

  it("두 판을 두고, 끝나면 참가자가 시드와 진행을 직접 다시 계산해 확인한다", async () => {
    const { host, a, b } = await setup();
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    b.on("audit", (r) => audits.push(r));
    const seen: string[] = [];
    a.transport.onMessage((m) => seen.push(JSON.stringify(m)));

    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await playRounds(host, [a, b], 2);
    await until(
      () =>
        a.match?.current().roundNumber === host.match?.current().roundNumber,
    );
    host.finish();
    await until(() => audits.length === 2);

    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    // 참가자가 받은 메시지에는 남의 손패나 게임 상태 전체가 없다.
    expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    // 게임 중에는 비밀 값이 오가지 않는다(감사 때 처음 공개된다).
    const beforeAudit = seen.filter((m) => !m.includes('"t":"audit"'));
    expect(beforeAudit.some((m) => m.includes(a.secret))).toBe(false);
  });

  it("방장이 게임 중에 새로고침해도 남긴 방으로 이어 가고, 판 끝 검증을 통과한다", async () => {
    const net = new MemoryNetwork();
    const store = memoryHostStore();
    const options = {
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
      bot: heuristicBot,
      botLevel: 1,
      store,
    };
    const host = new HostRoom({ transport: net.join("host"), ...options });
    const a = new GuestRoom({
      transport: net.join("a"),
      name: "철수",
      token: null,
    });
    await until(() => a.seat !== null);
    const audits: AuditResult[] = [];
    a.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => a.match !== null);
    const match = host.match;
    for (let i = 0; i < 2000 && (match?.actionLog().length ?? 0) < 20; i++) {
      const hv = match?.current();
      if (hv?.decision) match?.submit(heuristicBot.decide(hv, { seed: i }));
      const gv = a.match?.current();
      if (gv?.decision) a.match?.submit(heuristicBot.decide(gv, { seed: i }));
      await flush();
    }
    const before = match?.serialize();
    net.disconnect("host");
    await flush();
    const restore = store.load();
    const fresh = new HostRoom({
      transport: net.join("host-reloaded"),
      ...options,
      ...(restore ? { restore } : {}),
    });
    // 같은 서명 열쇠라 초대 링크의 지문이 그대로 맞는다.
    expect(await fresh.fingerprint()).toBe(await host.fingerprint());
    expect(fresh.match?.serialize()).toBe(before);
    await until(() => fresh.lobby().seats.every((s) => s.connected), 2000);
    await playRounds(fresh, [a], 2);
    await until(
      () =>
        a.match?.current().roundNumber === fresh.match?.current().roundNumber,
      2000,
    );
    fresh.finish();
    await until(() => audits.length === 1, 5000);
    expect(audits).toEqual([{ ok: true }]);
  });

  it("방장이 대기실에서 고친 규칙과 이름이 참가자에게 간다", async () => {
    const { host, a } = await setup();
    const custom = { ...presetRules("standard5"), noKirudaAdvantage: true };
    host.setRules(custom, "우리 학교 5마");
    await until(() => a.lobby?.ruleName === "우리 학교 5마");
    expect(a.lobby?.ruleCode).toBe(encodeRuleString(custom));

    // 기본 규칙으로 돌아가면 이름을 지운다.
    host.setRules(presetRules("standard5"));
    await until(() => a.lobby?.ruleName === undefined);
    host.close();
  });

  it("방장과 잠깐 끊겨도 다시 연결되면 같은 자리로 이어서 한다", async () => {
    const { net, host, a } = await setup();
    const states: string[] = [];
    let left = false;
    a.on("connection", (s) => states.push(s));
    a.on("hostLeft", () => {
      left = true;
    });
    await host.start();
    await until(() => a.match !== null);
    const seat = a.seat;

    net.disconnect("a");
    await until(() => states.length === 1);
    expect(states).toEqual(["reconnecting"]);

    net.reconnect("a");
    await until(() => states.length === 2);
    expect(states).toEqual(["reconnecting", "connected"]);
    expect(a.seat).toBe(seat);
    expect(left).toBe(false);
    host.close();
  });

  it("다시 연결되지 않으면 정한 시간 뒤 방장이 나간 것으로 본다", async () => {
    const net = new MemoryNetwork();
    const host = new HostRoom({
      transport: net.join("host"),
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
    });
    const a = new GuestRoom({
      transport: net.join("a"),
      name: "철수",
      token: null,
      reconnectTimeoutMs: 20,
    });
    await until(() => a.seat !== null);
    let left = false;
    a.on("hostLeft", () => {
      left = true;
    });
    net.disconnect("a");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(left).toBe(true);
    host.close();
  });

  it("방장이 방을 닫으면 기다리지 않고 바로 끝난다", async () => {
    const { host, a } = await setup();
    let left = false;
    const states: string[] = [];
    a.on("connection", (s) => states.push(s));
    a.on("hostLeft", () => {
      left = true;
    });
    host.close();
    await until(() => left);
    expect(states).toEqual([]);
  });

  it("연결이 끊기면 컴퓨터가 대신 두고, 같은 토큰으로 돌아오면 같은 자리를 받는다", async () => {
    const { net, host, a, b } = await setup();
    await host.start();
    await until(() => a.match !== null);
    const token = a.token;
    const seat = a.seat;
    a.transport.leave();

    // a 없이도 판이 이어진다.
    await playRounds(host, [b], 1);
    expect(host.match?.current().roundNumber).toBeGreaterThan(1);

    const back = new GuestRoom({
      transport: net.join("a2"),
      name: "철수",
      token,
      secret: a.secret,
    });
    await until(() => back.match !== null);
    expect(back.seat).toBe(seat);
    expect(back.match?.current().roundNumber).toBe(
      host.match?.current().roundNumber,
    );
  });

  it("방장이 비밀 값을 바꿔 공개하면 참가자가 잡아낸다", async () => {
    const { host, a, b } = await setup();
    const results: AuditResult[] = [];
    a.on("audit", (r) => results.push(r));
    const heardByB: AuditReport[] = [];
    const heardByHost: AuditReport[] = [];
    b.on("report", (r) => heardByB.push(r));
    host.onReport((r) => heardByHost.push(r));
    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await playRounds(host, [a, b], 1);

    // 방장이 공개하는 값 중 자기 값을 바꿔치기한다.
    const send = host.transport.send.bind(host.transport);
    host.transport.send = (message, to) => {
      const m = message as HostMessage;
      if (m.t === "audit") {
        send(
          {
            ...m,
            reveals: m.reveals.map((r) =>
              r.seat === 0 ? { ...r, secret: "조작" } : r,
            ),
          },
          to,
        );
      } else send(message, to);
    };
    host.finish();
    await until(() => results.length === 1);
    expect(results[0]).toEqual({
      ok: false,
      reason: "0번 자리의 값이 약속과 다르다",
    });
    // 철수의 실패 알림은 방장을 거치지 않고 다른 참가자에게도 간다.
    await until(() => heardByB.some((r) => r.name === "철수"));
    expect(heardByB.find((r) => r.name === "철수")).toMatchObject({
      ok: false,
      reason: "0번 자리의 값이 약속과 다르다",
    });
    await until(() => heardByHost.some((r) => r.name === "철수"));
  });

  it("방장이 게임 중 보낸 화면 하나라도 조작하면 판 끝에 잡아낸다", async () => {
    const { host, a, b } = await setup();
    const results: AuditResult[] = [];
    a.on("audit", (r) => results.push(r));
    // 방장이 철수에게 보내는 화면 하나를 고쳐 보낸다(예: 남의 점수를 바꿔 보여 주기).
    const send = host.transport.send.bind(host.transport);
    let tampered = false;
    host.transport.send = (message, to) => {
      const m = message as HostMessage;
      if (
        !tampered &&
        m.t === "snapshot" &&
        to === "a" &&
        m.events.length > 0
      ) {
        tampered = true;
        send(
          { ...m, view: { ...m.view, money: m.view.money.map(() => 0) } },
          to,
        );
      } else send(message, to);
    };
    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await playRounds(host, [a, b], 1);
    host.finish();
    await until(() => results.length === 1);
    expect(tampered).toBe(true);
    expect(results[0]?.ok).toBe(false);
    if (results[0]?.ok === false)
      expect(results[0].reason).toMatch(
        /받은 \d+번째 화면이 기록과 맞지 않는다/,
      );
  });

  it("다른 참가자가 남의 자리로 보낸 검증 알림은 무시한다", async () => {
    const { host, a, b } = await setup();
    const heardByA: AuditReport[] = [];
    a.on("report", (r) => heardByA.push(r));
    await until(
      () =>
        a.lobby?.seats.every((s) => s.kind !== "guest" || s.peerId) ?? false,
    );
    // 영희(b)가 철수(a)가 아닌 다른 자리(방장 0번)인 척 "실패"를 알린다.
    b.transport.send({
      t: "auditReport",
      seat: 0,
      name: "방장",
      ok: false,
      reason: "거짓",
    } satisfies AuditReport);
    // 자기 자리로 보낸 것은 받는다.
    b.transport.send({
      t: "auditReport",
      seat: b.seat as number,
      name: "영희",
      ok: true,
    } satisfies AuditReport);
    await until(() => heardByA.length >= 1);
    await flush();
    expect(heardByA.map((r) => r.name)).toEqual(["영희"]);
    host.close();
  });

  it("남의 차례에 보낸 행동은 거절된다", async () => {
    const { host, a } = await setup();
    const errors: string[] = [];
    a.on("rejected", (e) => errors.push(e));
    await host.start();
    await until(() => a.match !== null);
    // 첫 차례는 방장(0번)이다. a가 억지로 보낸다.
    a.transport.send({ t: "action", action: { type: "pass" } });
    await until(() => errors.length === 1);
    expect(errors[0]).toBe("지금은 이 자리의 차례가 아니다");
  });
});

describe("대기실 관리", () => {
  it("방장이 내보낸 참가자는 자리를 잃고, 같은 토큰으로 다시 들어올 수 없다", async () => {
    const { net, host, a } = await setup();
    let kicked = false;
    let lobbyAfterKick = 0;
    a.on("kicked", () => {
      kicked = true;
    });
    a.on("lobby", () => {
      if (kicked) lobbyAfterKick++;
    });
    const seat = a.seat as number;
    host.kick(seat);
    await until(() => kicked);
    host.setRules(rules); // 대기실 알림을 한 번 더 보낸다
    await flush();
    expect(host.lobby().seats[seat]?.kind).toBe("bot");
    // 내보낸 뒤의 대기실 알림 때문에 화면이 대기실로 돌아가면 안 된다.
    expect(lobbyAfterKick).toBe(0);

    const again = new GuestRoom({
      transport: net.join("a2"),
      name: "철수",
      token: a.token,
    });
    let kickedAgain = false;
    again.on("kicked", () => {
      kickedAgain = true;
    });
    await until(() => kickedAgain);
    expect(again.seat).toBeNull();
  });

  it("방장이 대기실에서 규칙을 바꾸면 참가자도 새 규칙을 받는다", async () => {
    const { host, a } = await setup();
    const six = presetRules("standard6");
    host.setRules(six);
    await until(() => a.lobby?.seats.length === 6);
    expect(host.lobby().seats).toHaveLength(6);
  });
});

describe("채팅", () => {
  it("참가자의 말은 방장이 이름을 붙여 모두에게 보낸다", async () => {
    const { host, a, b } = await setup();
    const heardByHost: string[] = [];
    const heardByB: string[] = [];
    host.onChat((m) => heardByHost.push(`${m.name}:${m.text}`));
    b.on("chat", (m) => heardByB.push(`${m.name}:${m.text}`));
    a.chat("  안녕하세요  ");
    await until(() => heardByB.length === 1);
    expect(heardByHost).toEqual(["철수:안녕하세요"]);
    expect(heardByB).toEqual(["철수:안녕하세요"]);

    host.chat("시작할게요");
    await until(() => heardByB.length === 2);
    expect(heardByB[1]).toBe("방장:시작할게요");
  });

  it("빈 말과 너무 잦은 말은 버리고, 긴 말은 자른다", async () => {
    const { host, a } = await setup();
    const heard: string[] = [];
    host.onChat((m) => heard.push(m.text));
    a.chat("   ");
    a.chat("x".repeat(200));
    a.chat("곧바로 또");
    await until(() => heard.length >= 1);
    await flush();
    expect(heard).toEqual(["x".repeat(80)]);
  });
});

describe("방장 확인(서명)", () => {
  async function hostWithLink(net: MemoryNetwork) {
    const host = new HostRoom({
      transport: net.join("host"),
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
    });
    return { host, fingerprint: await host.fingerprint() };
  }

  it("링크를 아는 사람이 먼저 방장인 척 답해도 서명이 없으면 무시한다", async () => {
    const net = new MemoryNetwork();
    const { host, fingerprint } = await hostWithLink(net);
    // 가짜 방장: 들어오는 사람에게 서명 없이 바로 "어서 와"
    const evil = net.join("evil");
    evil.onMessage((m, from) => {
      if ((m as { t?: string }).t === "join")
        evil.send({ t: "welcome", seat: 1, token: "가짜" }, from);
    });
    const a = new GuestRoom({
      transport: net.join("a"),
      name: "철수",
      token: null,
      hostFingerprint: fingerprint,
    });
    await until(() => a.seat !== null && a.lobby !== null, 3000);
    expect(a.token).not.toBe("가짜");
    expect(a.impostors).toBeGreaterThanOrEqual(1);
    expect(a.lobby?.seats.map((s) => s.name)).toContain("철수");
    host.close();
  });

  it("다른 열쇠로 서명한 가짜 방장도 지문이 달라 무시한다", async () => {
    const net = new MemoryNetwork();
    const { host, fingerprint } = await hostWithLink(net);
    // 가짜 방장도 HostRoom을 그대로 돌린다(자기 열쇠로 서명한다).
    const fake = new HostRoom({
      transport: net.join("fake"),
      hostName: "가짜 방장",
      rules,
    });
    const a = new GuestRoom({
      transport: net.join("a"),
      name: "철수",
      token: null,
      hostFingerprint: fingerprint,
    });
    // 가짜 방장의 서명 확인은 비동기라 진짜 방장을 정한 뒤에 끝날 수 있다.
    await until(
      () => a.seat !== null && a.lobby !== null && a.impostors >= 1,
      3000,
    );
    expect(a.lobby?.seats[0]?.name).toBe("방장");
    expect(a.impostors).toBeGreaterThanOrEqual(1);
    host.close();
    fake.close();
  });
});
