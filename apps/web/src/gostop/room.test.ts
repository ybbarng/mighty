// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import { gostopBeginnerBot, gostopIntermediateBot } from "@mighty/gostop-ai";
import { GOSTOP3_RULES, MATGO_RULES } from "@mighty/gostop-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { gostopKit } from "./kit";

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

describe("고스톱 온라인 방", () => {
  it.each([
    ["맞고", { ...MATGO_RULES, rounds: 2 }],
    ["3명(빈자리는 컴퓨터)", { ...GOSTOP3_RULES, rounds: 2 }],
  ] as const)(
    "%s: 방장과 참가자가 끝까지 치고, 참가자는 남의 패를 못 보며 판 끝 검증을 통과한다",
    async (_name, rules) => {
      const net = new MemoryNetwork();
      const host = new HostRoom({
        kit: gostopKit,
        transport: net.join("host"),
        clock,
        hostName: "방장",
        rules,
        bot: gostopIntermediateBot,
        botLevel: 1,
      });
      const guest = new GuestRoom({
        kit: gostopKit,
        transport: net.join("a"),
        clock,
        name: "철수",
        token: null,
      });
      await until(() => guest.seat !== null && guest.lobby !== null);
      expect(guest.lobby?.game).toBe("gostop");
      expect(guest.lobby?.seats).toHaveLength(rules.players);
      const audits: AuditResult[] = [];
      guest.on("audit", (r) => audits.push(r));

      await host.start();
      await until(() => guest.match !== null);
      const match = host.match;
      if (!match) throw new Error("시작하지 않았다");
      const state = match.rawState();
      const gv0 = guest.match?.current();
      // 참가자 화면에는 자기 손패만 있고 남의 손패·더미 순서·시드는 없다.
      expect(gv0?.hand).toEqual(state.hands[guest.seat ?? -1]);
      expect(gv0).not.toHaveProperty("hands");
      expect(gv0).not.toHaveProperty("deck");
      expect(gv0).not.toHaveProperty("seed");

      for (let i = 0; i < 5000; i++) {
        if (match.current().phase === "gameOver") break;
        const hv = match.current();
        if (hv.decision)
          match.submit(gostopBeginnerBot.decide(hv, { seed: i }));
        const gv = guest.match?.current();
        if (gv?.decision)
          guest.match?.submit(gostopBeginnerBot.decide(gv, { seed: i + 7 }));
        await flush();
      }
      expect(match.current().phase).toBe("gameOver");
      host.finish();
      await until(() => audits.length === 1);
      expect(audits).toEqual([{ ok: true }]);
    },
  );
});
