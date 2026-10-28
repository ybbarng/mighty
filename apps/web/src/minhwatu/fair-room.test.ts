import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@mighty/minhwatu-ai";
import { type MinhwatuState, STANDARD_RULES } from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import {
  expectHidden,
  playHwatu,
  setupHwatu,
  until,
} from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { minhwatuKit } from "./kit";

const setup = (guests: number) =>
  setupHwatu({
    kit: minhwatuKit,
    rules: { ...STANDARD_RULES, rounds: 2 },
    guests,
    bot: minhwatuIntermediateBot,
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
  });

describe("민화투 암호화방(멘탈 포커)", () => {
  it("방장·참가자·컴퓨터 셋이 두 판을 끝까지 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판마다 검증을 통과한다", async () => {
    const { host, guests, incidents, audits, verified } = await setup(1);
    const archives: ArchiveSource[] = [];
    guests[0]?.on("archive", (s) => archives.push(s));
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const guestSeat = guests[0]?.seat as number;
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => match.current().phase === "gameOver",
      check: () => {
        const raw = match.rawState() as MinhwatuState;
        if (raw.phase !== "play" && raw.phase !== "pick") return;
        // 방장 엔진: 아직 내지 않은 손패(방장 자기 패 포함)와 더미는 자리 표뿐이다.
        for (const hand of raw.hands) expectHidden(hand);
        expectHidden(raw.deck);
        // 참가자 화면: 남의 손패가 없고 내 손패는 진짜 카드다.
        const gv = guests[0]?.match?.current();
        if (gv && gv.roundNumber === raw.roundNumber)
          expect(gv.hand.length).toBe(raw.hands[guestSeat]?.length);
      },
    });
    expect(incidents).toEqual([]);
    expect(match.current().phase).toBe("gameOver");
    await until(() => audits.length === 1, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
    await until(() => verified.length === 2, "판마다 검증");
    expect(verified).toEqual([1, 2]);
    // 참가자 복기: 판마다 진짜 패로 끝까지 다시 돌린다.
    const last = archives.at(-1);
    if (!last) throw new Error("복기 기록이 없다");
    const replayed = replayArchive(minhwatuKit, {
      v: 1,
      game: "minhwatu",
      ...last,
    } as never);
    expect(replayed.error).toBeNull();
    expect((replayed.states.at(-1) as MinhwatuState).phase).toBe("gameOver");
  }, 120_000);
});
