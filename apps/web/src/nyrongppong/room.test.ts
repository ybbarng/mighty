import { ManualClock } from "@mighty/fair-play";
import { nyrongppongIntermediateBot } from "@mighty/nyrongppong-ai";
import {
  type NyrongppongView,
  STANDARD_RULES,
} from "@mighty/nyrongppong-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { nyrongppongKit } from "./kit";
import { ONLINE_CALL_SECONDS, onlineRules } from "./settings";

/** 시험마다 새 시계. 뽕 응답 창은 시험이 옮길 때만 지난다 */
let clock = new ManualClock();
beforeEach(() => {
  clock = new ManualClock();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 60_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

describe("나이롱뽕 온라인 방", () => {
  it("방장·참가자·컴퓨터 셋이 끝까지 하고, 참가자가 기록을 다시 계산해 확인한다", async () => {
    const net = new MemoryNetwork();
    const rules = { ...STANDARD_RULES, players: 3, rounds: 2 };
    const host = new HostRoom({
      kit: nyrongppongKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules,
      bot: nyrongppongIntermediateBot,
      botLevel: 1,
    });
    const guest = new GuestRoom({
      kit: nyrongppongKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    expect(guest.lobby?.game).toBe("nyrongppong");
    expect(guest.lobby?.seats).toHaveLength(3);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));

    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const seen: NyrongppongView[] = [];

    for (let i = 0; i < 5000; i++) {
      if (match.current().phase === "gameOver") break;
      const hv = match.current();
      const gv = guest.match?.current();
      if (gv) seen.push(gv);
      // 참가자는 뽕을 묻으면 답하지 않는다: 방장 시계가 응답 시간 끝을 기록한다.
      if (gv?.decision?.kind === "call") {
        clock.advance(STANDARD_RULES.callSeconds * 1000 + 1);
      } else if (hv.decision)
        match.submit(nyrongppongIntermediateBot.decide(hv, { seed: i }));
      else if (gv?.decision)
        guest.match?.submit(nyrongppongIntermediateBot.decide(gv, { seed: i }));
      await flush();
    }
    expect(match.current().phase).toBe("gameOver");
    // 참가자 화면에는 남의 손패가 판이 끝나기 전에는 보이지 않는다.
    for (const v of seen) {
      expect(v.hand).toHaveLength(v.handCounts[v.mySeat] ?? -1);
      expect(JSON.stringify(v)).not.toContain('"deck"');
    }
    host.finish();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });
  it("온라인 규칙(버릴 때마다 창): 참가자·컴퓨터가 쓴 시간을 실어 답해도 판 끝 검증을 통과한다", async () => {
    const net = new MemoryNetwork();
    const rules = onlineRules({ ...STANDARD_RULES, players: 3, rounds: 1 });
    const host = new HostRoom({
      kit: nyrongppongKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      secret: "host-secret-7",
      rules,
      bot: nyrongppongIntermediateBot,
      botLevel: 1,
    });
    const guest = new GuestRoom({
      kit: nyrongppongKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      secret: "guest-secret-7",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");

    let windows = 0;
    let answered = 0;
    for (let i = 0; i < 5000; i++) {
      if (match.current().phase === "gameOver") break;
      const hv = match.current();
      const gv = guest.match?.current();
      if (gv?.decision?.kind === "call") {
        // 참가자는 0.5초 생각하고 답한다. 넘겨도 창은 남은 시간만큼 이어진다.
        clock.advance(500);
        guest.match?.submit(nyrongppongIntermediateBot.decide(gv, { seed: i }));
        answered++;
      } else if (hv.decision)
        match.submit(nyrongppongIntermediateBot.decide(hv, { seed: i }));
      else if (gv?.decision)
        guest.match?.submit(nyrongppongIntermediateBot.decide(gv, { seed: i }));
      else if (hv.phase === "call") {
        // 아무도 정할 것이 없는 창: 방장 시계가 시간 끝을 기록할 때까지 옮긴다.
        windows++;
        clock.advance(ONLINE_CALL_SECONDS * 1000 + 1);
      }
      await flush();
    }
    expect(match.current().phase).toBe("gameOver");
    // 비밀 값을 정해 둔 판이라 늘 같다: 버릴 때마다 창이 열렸고, 참가자가 직접 답한 창도 있었다.
    expect(windows).toBeGreaterThan(5);
    expect(answered).toBeGreaterThan(0);
    host.finish();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });
});
