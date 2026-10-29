// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { playUntil, setup, until } from "./fair-room-fixture";
import { heartsKit } from "./kit";

/** 끝까지 두기와 복기. 새로고침·끊김·부정은 fair-room-reload.test.ts가 본다 */
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
