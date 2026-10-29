// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@mighty/minhwatu-ai";
import { STANDARD_RULES } from "@mighty/minhwatu-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { minhwatuKit } from "./kit";

/** 시험마다 새 시계. 제한 시간은 시험이 옮길 때만 지난다 */
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

describe("민화투 온라인 방", () => {
  it("방장·참가자·컴퓨터 셋이 끝까지 치고, 참가자는 남의 패를 못 보며 판 끝 검증을 통과한다", async () => {
    const net = new MemoryNetwork();
    const host = new HostRoom({
      kit: minhwatuKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules: { ...STANDARD_RULES, rounds: 2 },
      bot: minhwatuIntermediateBot,
      botLevel: 1,
    });
    const guest = new GuestRoom({
      kit: minhwatuKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    expect(guest.lobby?.game).toBe("minhwatu");
    expect(guest.lobby?.seats).toHaveLength(3);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));

    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    for (let i = 0; i < 3000; i++) {
      if (match.current().phase === "gameOver") break;
      const hv = match.current();
      if (hv.decision)
        match.submit(minhwatuBeginnerBot.decide(hv, { seed: i }));
      const gv = guest.match?.current();
      if (gv) {
        // 참가자 화면에는 남의 손패가 없다(장수만)
        const mine = new Set(gv.hand);
        const raw = match.rawState();
        for (const [seat, hand] of raw.hands.entries())
          if (seat !== gv.seat)
            for (const id of hand) expect(mine.has(id)).toBe(false);
        if (raw.deck.length > 1)
          expect(JSON.stringify(gv)).not.toContain(JSON.stringify(raw.deck));
        if (gv.decision)
          guest.match?.submit(minhwatuBeginnerBot.decide(gv, { seed: i }));
      }
      await flush();
    }
    expect(match.current().phase).toBe("gameOver");
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });
});
