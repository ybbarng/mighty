// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import { heartsIntermediateBot, heartsNormalBot } from "@mighty/hearts-ai";
import { WINDOWS_RULES } from "@mighty/hearts-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { heartsKit } from "./kit";

/** 시험마다 새 시계. 제한 시간은 시험이 옮길 때만 지난다(기기가 느려도 결과가 같다) */
let clock = new ManualClock();
beforeEach(() => {
  clock = new ManualClock();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 50_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

describe("하트 온라인 방", () => {
  it("방장과 참가자가 한 게임을 끝까지 두고, 참가자가 공정성을 확인한다", async () => {
    const net = new MemoryNetwork();
    const host = new HostRoom({
      kit: heartsKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules: { ...WINDOWS_RULES, endScore: 30 },
      bot: heartsIntermediateBot,
      botLevel: 1,
      revealTimeoutMs: 500,
    });
    const guest = new GuestRoom({
      kit: heartsKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    expect(guest.lobby?.game).toBe("hearts");
    expect(guest.lobby?.seats).toHaveLength(4);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));

    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    for (let i = 0; i < 3000; i++) {
      if (match.current().phase === "gameOver") break;
      const hv = match.current();
      if (hv.decision) match.submit(heartsNormalBot.decide(hv, { seed: i }));
      const gv = guest.match?.current();
      if (gv?.decision)
        guest.match?.submit(heartsNormalBot.decide(gv, { seed: i }));
      await flush();
    }
    expect(match.current().phase).toBe("gameOver");
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });

  it("마이티 방에는 하트로 들어가지 않는다", async () => {
    const net = new MemoryNetwork();
    new HostRoom({
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules: (await import("@mighty/engine")).presetRules("standard5"),
    });
    const guest = new GuestRoom({
      kit: heartsKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    const errors: string[] = [];
    guest.on("rejected", (e) => errors.push(e));
    await until(() => errors.length > 0);
    expect(errors).toEqual(["다른 게임의 방입니다"]);
  });
});
