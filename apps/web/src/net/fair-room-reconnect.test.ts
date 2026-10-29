// @vitest-environment node
import { heuristicBot } from "@mighty/ai";
import { type MatchState, type PlayerView, presetRules } from "@mighty/engine";
import { isToken } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";
import { mightyKit } from "@/game/mighty-kit";
import type { GameArchive } from "@/review/archive";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";
import {
  hostBidsTop,
  type memoryStore,
  playRounds,
  setup,
  until,
} from "./fair-room-fixture";
import { GuestRoom } from "./guest-room";

/** 멘탈 포커 온라인 방: 새로고침·끊김 투표·복기·방장 재접속(fair-room.test에서 나눠 동시에 돈다) */
describe("멘탈 포커 온라인 대전: 끊김과 기록", () => {
  // 새로고침·복기·방장 재접속은 참가자 한 명으로 같은 길을 본다(나머지 자리는 방장 기기의 컴퓨터)
  it("판 중간에 참가자가 새로고침해도 남겨 둔 열쇠로 같은 자리에서 이어 가고, 검증도 통과한다", async () => {
    const { net, host, guests, incidents, clock } = await setup(
      presetRules("standard5"),
      1,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    // 판을 조금 진행한다.
    const match = host.match;
    for (let i = 0; i < 400 && (match?.actionLog().length ?? 0) < 12; i++) {
      const views: [string, PlayerView | undefined, (a: never) => void][] = [
        ["h", match?.current(), (a) => match?.submit(a)],
        ...guests.map(
          (g, k) =>
            [`g${k}`, g.match?.current(), (a: never) => g.match?.submit(a)] as [
              string,
              PlayerView | undefined,
              (a: never) => void,
            ],
        ),
      ];
      for (const [, view, submit] of views)
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 3 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const old = guests[0] as GuestRoom;
    const store = (
      old as unknown as { fairStore: ReturnType<typeof memoryStore> }
    ).fairStore;
    const token = old.token;
    const secret = old.secret;
    // 새로고침: 연결이 끊기고(메모리 상태는 사라진다) 같은 토큰·저장소로 새로 들어온다.
    net.disconnect("g0");
    old.leave();
    const fresh = new GuestRoom({
      transport: net.join("g0-reloaded"),
      name: "손님0",
      token,
      secret,
      fairStore: store,
      clock,
    });
    fresh.on("incident", (n) => incidents.push(n));
    await until(
      () => fresh.match !== null && fresh.match.current().hand.length > 0,
    );
    guests[0] = fresh;
    const verified: number[] = [];
    fresh.on("roundVerified", (d) => verified.push(d));
    const scored = await playRounds(host, guests, 1, incidents, hostBidsTop);
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    expect(scored).toBe(1);
    await until(() => verified.length > 0);
  });

  it("끊긴 사람을 기다리다 투표가 열리고, 남은 사람의 과반이 끝내기를 고르면 모두의 게임이 끝난다", async () => {
    const { net, host, guests, clock } = await setup(
      presetRules("standard5"),
      3,
      undefined,
      50,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const [g0, g1, g2] = guests as [GuestRoom, GuestRoom, GuestRoom];
    const seat0 = g0.seat ?? -1;
    /** 방장이 0번 손님의 끊김을 안 뒤, 기다리는 시간(50ms)이 지나 투표가 열린다 */
    const voteOpens = async () => {
      await until(() => host.lobby().seats[seat0]?.connected === false);
      clock.advance(49);
      expect(g1.lobby?.endVote).toBeUndefined();
      clock.advance(1);
      await until(() => g1.lobby?.endVote !== undefined);
    };
    // 돌아오면 투표를 닫는다.
    net.disconnect("g0");
    await voteOpens();
    net.reconnect("g0");
    (guests[0] as GuestRoom).leave();
    const back = new GuestRoom({
      transport: net.join("g0-back"),
      name: "손님0",
      token: (guests[0] as GuestRoom).token,
      secret: (guests[0] as GuestRoom).secret,
      fairStore: (
        guests[0] as unknown as { fairStore: ReturnType<typeof memoryStore> }
      ).fairStore,
      clock,
    });
    await until(() => back.seat !== null && g1.lobby?.endVote === undefined);
    // 다시 끊기면 기다렸다 다시 연다. 한 사람(3명 중 1명)의 끝내기로는 끝나지 않는다.
    net.disconnect("g0-back");
    await voteOpens();
    g1.vote(true);
    host.vote(false);
    await until(() => g2.lobby?.endVote?.votes.length === 2);
    expect(host.match?.current().phase).not.toBe("gameOver");
    g2.vote(true);
    await until(() => host.match?.current().phase === "gameOver");
    await until(() =>
      [g1, g2].every((g) => g.match?.current().phase === "gameOver"),
    );
    expect(g1.lobby?.endVote).toBeUndefined();
  });

  it("복기: 방장과 참가자가 남기는 기록(판별 실제 패 포함)을 다시 돌리면 실제 카드로 같은 판이 나온다", async () => {
    const { host, guests, incidents } = await setup(
      presetRules("standard5"),
      1,
    );
    const guestSources: ArchiveSource[] = [];
    (guests[0] as GuestRoom).on("archive", (s) => guestSources.push(s));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const scored = await playRounds(host, guests, 1, incidents, hostBidsTop);
    expect(scored).toBe(1);
    await until(() => guestSources.length > 0);
    const archive = (source: ArchiveSource, seat: number): GameArchive => ({
      id: "online:test",
      game: "mighty",
      mode: "online",
      startedAt: 0,
      updatedAt: 0,
      ...source,
      seat,
      seatNames: null,
      rounds: 1,
      over: false,
    });
    const fromHost = host.archiveSource() as ArchiveSource;
    for (const [source, seat] of [
      [fromHost, 0],
      [guestSources.at(-1) as ArchiveSource, guests[0]?.seat as number],
    ] as const) {
      const replayed = replayArchive(mightyKit, archive(source, seat));
      console.log(
        "DBG",
        seat,
        replayed.states.length,
        JSON.stringify(
          replayed.events
            .map((e) => e.map((x) => x.type).join("+"))
            .filter(Boolean),
        ).slice(0, 1500),
        (replayed.states.at(-1) as MatchState).roundNumber,
        (replayed.states.at(-1) as MatchState).round.phase,
        host.match?.rawState().roundNumber,
        host.match?.rawState().round.phase,
      );
      expect(replayed.error).toBeNull();
      const states = replayed.states as MatchState[];
      // 자리 표가 아니라 실제 카드로 돌았다.
      expect(
        states
          .flatMap((st) => st.round.tricks.flatMap((t) => t.plays))
          .every((p) => !isToken(p.card)),
      ).toBe(true);
      expect(states.some((st) => st.round.tricks.length > 0)).toBe(true);
      if (seat === 0) {
        // 방장 기록은 점수를 매긴 걸음까지 있다(참가자는 판 검증 때라 마지막 턴 직전까지).
        const scoredAt = replayed.events.findIndex((e) =>
          e.some((x) => x.type === "roundScored"),
        );
        expect(scoredAt).toBeGreaterThan(0);
      }
    }
  });

  it("방장이 잠깐 끊겼다 돌아오면 참가자는 기다렸다 같은 판을 이어 간다", async () => {
    const { net, host, guests, incidents } = await setup(
      presetRules("standard5"),
      1,
    );
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const states: string[] = [];
    for (const g of guests) g.on("connection", (s) => states.push(s));
    const match = host.match;
    for (let i = 0; i < 400 && (match?.actionLog().length ?? 0) < 10; i++) {
      for (const [view, submit] of [
        [match?.current(), (a: never) => match?.submit(a)],
        ...guests.map((g) => [
          g.match?.current(),
          (a: never) => g.match?.submit(a),
        ]),
      ] as [PlayerView | undefined, (a: never) => void][])
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 5 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    net.disconnect("host");
    await until(() => states.filter((s) => s === "reconnecting").length === 1);
    net.reconnect("host");
    await until(() => states.filter((s) => s === "connected").length === 1);
    const scored = await playRounds(host, guests, 1, incidents, hostBidsTop);
    expect(incidents.map((i) => i.reason)).toEqual([]);
    expect(scored).toBe(1);
  });
});
