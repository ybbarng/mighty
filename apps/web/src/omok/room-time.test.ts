// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import { omokBotFor } from "@mighty/omok-ai";
import { type OmokRules, pointAt } from "@mighty/omok-engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { omokKit } from "./kit";

const FAST: OmokRules = { variant: "standard", winsToFinish: 1, time: "fast" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 25_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

describe("오목 온라인 방의 개인 시간", () => {
  it("방장 시계가 참가자의 시간패를 기록하고, 참가자의 판 끝 검증을 통과한다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const host = new HostRoom({
      kit: omokKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules: FAST,
      bot: omokBotFor(1),
      botLevel: 1,
    });
    const guest = new GuestRoom({
      kit: omokKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");

    // 먼저 두는 쪽이 한 수씩 둔다(쓴 시간은 방장 시계가 싣는다).
    const points = ["H8", "H9", "G8"];
    for (const name of points) {
      await until(
        () =>
          match.current().decision !== null ||
          guest.match?.current().decision !== null,
      );
      clock.advance(5_000);
      const action = { type: "place" as const, at: pointAt(name) };
      if (match.current().decision) match.submit(action);
      else guest.match?.submit(action);
      await until(
        () => match.current().moves.length >= points.indexOf(name) + 1,
      );
    }
    // 참가자 차례가 올 때까지 두고, 참가자 시간이 다 지나게 한다.
    if (match.current().decision) {
      clock.advance(1_000);
      match.submit({ type: "place", at: pointAt("J10") });
    }
    await until(() => guest.match?.current().decision !== null);
    const seat = guest.seat as number;
    const left = match.current().clocks?.[seat];
    expect(left?.main).toBeLessThan(180_000);
    clock.advance(270_000);
    await until(() => match.current().result !== null);
    expect(match.current().result).toEqual({ kind: "time", seat: 0 });
    await until(() => guest.match?.current().result !== null);

    host.finish();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });
});
