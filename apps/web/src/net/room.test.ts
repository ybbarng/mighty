import { heuristicBot } from "@mighty/ai";
import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
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
      ["컴퓨터 3", "bot"],
      ["컴퓨터 4", "bot"],
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
