import { gostopBeginnerBot, gostopIntermediateBot } from "@mighty/gostop-ai";
import {
  GOSTOP3_RULES,
  type GostopRules,
  type GostopState,
  MATGO_RULES,
} from "@mighty/gostop-engine";
import { isHiddenId } from "@mighty/hwatu";
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

import { gostopKit } from "./kit";

const setup = (rules: GostopRules, guests: number) =>
  setupHwatu({
    kit: gostopKit,
    rules,
    guests,
    bot: gostopIntermediateBot,
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
  });

describe("고스톱 암호화방(멘탈 포커)", () => {
  it.each([
    ["맞고", { ...MATGO_RULES, rounds: 3 }],
    ["3명(컴퓨터 하나)", { ...GOSTOP3_RULES, rounds: 3 }],
  ])(
    "%s: 끝까지 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판마다 검증을 통과한다",
    async (_name, rules) => {
      const { host, guests, incidents, audits, verified } = await setup(
        rules,
        1,
      );
      const archives: ArchiveSource[] = [];
      guests[0]?.on("archive", (s) => archives.push(s));
      await host.start();
      const match = host.match;
      if (!match) throw new Error("시작하지 않았다");
      await playHwatu({
        host,
        guests,
        bot: gostopBeginnerBot,
        incidents,
        done: () => match.current().phase === "gameOver",
        check: () => {
          const raw = match.rawState() as GostopState;
          if (raw.phase !== "play") return;
          // 방장 엔진: 아직 내지 않은 손패와 더미는 자리 표뿐이다(흔들어 보인 카드만 진짜).
          for (const [seat, hand] of raw.hands.entries())
            expectHidden(
              hand.filter((id) => !(raw.revealed[seat] ?? []).includes(id)),
            );
          expectHidden(raw.deck);
          // 바닥·먹은 패는 진짜 카드다.
          for (const id of [...raw.floor, ...raw.captured.flat()])
            expect(isHiddenId(id)).toBe(false);
        },
      });
      expect(incidents).toEqual([]);
      await until(() => audits.length === 1, "판 끝 검증");
      expect(audits).toEqual([{ ok: true }]);
      await until(() => verified.length === 3, "판마다 검증");
      expect(verified).toEqual([1, 2, 3]);
      // 판 끝 검증과 판마다 검증이 차례 없이 끝나므로 진짜 패가 가장 많은 기록을 본다.
      const last = [...archives].sort(
        (a, b) =>
          Object.keys(b.deals ?? {}).length -
            Object.keys(a.deals ?? {}).length || b.log.length - a.log.length,
      )[0];
      if (!last) throw new Error("복기 기록이 없다");
      const replayed = replayArchive(gostopKit, {
        v: 1,
        game: "gostop",
        ...last,
      } as never);
      expect(replayed.error).toBeNull();
      expect((replayed.states.at(-1) as GostopState).phase).toBe("gameOver");
    },
    120_000,
  );
});
