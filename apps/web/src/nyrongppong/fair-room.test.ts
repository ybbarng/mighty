// @vitest-environment node
import {
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "@mighty/nyrongppong-ai";
import {
  type NyrongppongState,
  STANDARD_RULES,
} from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import {
  type AnyGuest,
  type AnyHost,
  expectHidden,
  playHwatu,
  setupHwatu,
  until,
} from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { nyrongppongKit } from "./kit";
import { ONLINE_CALL_SECONDS, onlineRules } from "./settings";

const setup = (players: number, guests: number, rounds: number) =>
  setupHwatu({
    kit: nyrongppongKit,
    rules: onlineRules({ ...STANDARD_RULES, players, rounds }),
    guests,
    bot: nyrongppongIntermediateBot,
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
  });

/** 응답 창: 사람이 정할 것이 없고 기기가 모두 쉬면 방장 시계를 창 끝까지 옮긴다 */
function windowTicker(
  host: AnyHost,
  guests: AnyGuest[],
  clock: { advance(ms: number): void },
) {
  return () => {
    const match = host.match;
    if (!match) return;
    const raw = match.rawState() as NyrongppongState;
    if (raw.phase !== "call") return;
    const devices = [host.fair?.device, ...guests.map((g) => g.fair?.device)];
    if (devices.some((d) => d?.busy())) return;
    const views = [match.current(), ...guests.map((g) => g.match?.current())];
    if (views.some((v) => (v as { decision?: unknown })?.decision)) return;
    clock.advance(ONLINE_CALL_SECONDS * 1000 + 1);
  };
}

describe("나이롱뽕 암호화방(멘탈 포커)", () => {
  // 판이 바뀌어도 이어 가는지(두 판)는 3명으로 보고, 4명(참가자 둘)은 한 판으로 본다
  it.each([
    ["3명(참가자 하나, 컴퓨터 하나), 두 판", 3, 1, 2],
    ["4명(참가자 둘, 컴퓨터 하나), 한 판", 4, 2, 1],
  ])(
    "%s: 끝까지 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판마다 검증을 통과한다",
    async (_name, players, guestCount, rounds) => {
      const { host, guests, incidents, audits, verified, clock } = await setup(
        players,
        guestCount,
        rounds,
      );
      const archives: ArchiveSource[] = [];
      guests[0]?.on("archive", (s) => archives.push(s));
      await host.start();
      const match = host.match;
      if (!match) throw new Error("시작하지 않았다");
      await playHwatu({
        host,
        guests,
        bot: nyrongppongBeginnerBot,
        incidents,
        done: () => match.current().phase === "gameOver",
        tick: windowTicker(host, guests, clock),
        check: () => {
          const raw = match.rawState() as NyrongppongState;
          if (raw.phase === "roundEnd" || raw.phase === "gameOver") return;
          // 방장 엔진: 손패(방장 자기 패 포함)와 더미는 자리 표뿐이다.
          for (const hand of raw.hands) expectHidden(hand);
          expectHidden(raw.deck);
          // 참가자 화면: 내 손패는 진짜 카드, 남의 손패는 장수뿐이다.
          const gv = guests[0]?.match?.current();
          if (
            gv &&
            gv.roundNumber === raw.roundNumber &&
            gv.phase !== "roundEnd"
          )
            expect(gv.hand.some((id: string) => id.startsWith("?_"))).toBe(
              false,
            );
        },
      });
      expect(incidents).toEqual([]);
      expect(match.current().phase).toBe("gameOver");
      await until(() => audits.length === guestCount, "판 끝 검증");
      expect(audits.every((a) => a.ok)).toBe(true);
      await until(() => verified.length === rounds * guestCount, "판마다 검증");
      // 판 끝 검증과 판마다 검증이 차례 없이 끝나므로 진짜 패가 가장 많은 기록을 본다.
      const last = [...archives].sort(
        (a, b) =>
          Object.keys(b.deals ?? {}).length -
            Object.keys(a.deals ?? {}).length || b.log.length - a.log.length,
      )[0];
      if (!last) throw new Error("복기 기록이 없다");
      const replayed = replayArchive(nyrongppongKit, {
        v: 1,
        game: "nyrongppong",
        ...last,
      } as never);
      expect(replayed.error).toBeNull();
      expect((replayed.states.at(-1) as NyrongppongState).phase).toBe(
        "gameOver",
      );
    },
    120_000,
  );
});
