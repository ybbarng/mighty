// @vitest-environment node
import { gostopBeginnerBot, gostopIntermediateBot } from "@mighty/gostop-ai";
import {
  GOSTOP3_RULES,
  type GostopRules,
  type GostopState,
  MATGO_RULES,
} from "@mighty/gostop-engine";
import { isHiddenId } from "@mighty/hwatu";
import { describe, expect, it, vi } from "vitest";

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
  // 판이 바뀌어도 이어 가는지(두 판)는 맞고로 보고, 3명은 한 판으로 본다
  it.each([
    ["맞고(두 판)", { ...MATGO_RULES, rounds: 2 }],
    ["3명(컴퓨터 하나, 한 판)", { ...GOSTOP3_RULES, rounds: 1 }],
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
      await until(() => verified.length === rules.rounds, "판마다 검증");
      expect(verified).toEqual(
        Array.from({ length: rules.rounds }, (_, i) => i + 1),
      );
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
  );

  // 난수 바이트를 모두 같은 값으로 채우면 기기들이 난수를 부르는 차례와 상관없이 섞은 결과가 하나로 정해진다.
  // 143은 3명 첫 판에서 누군가 총통을 받는 값이다(값을 바꾸면 이 시험의 앞 확인이 짚는다).
  it("3명 한 판이 첫 판 총통으로 시작하자마자 끝나도 판 끝 기록을 공개해 검증한다", async () => {
    const spy = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
        if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(143);
        return a;
      });
    try {
      const { host, incidents, audits, verified } = await setup(
        { ...GOSTOP3_RULES, rounds: 1 },
        1,
      );
      await host.start();
      const state = host.match?.rawState() as GostopState;
      expect(state.phase).toBe("gameOver");
      expect(state.result?.kind).toBe("chongtong");
      // 뒤따르는 화면이 없으니 시작할 때 판 끝 기록을 보내야 한다(예전에는 보내지 않아 참가자가 끝없이 기다렸다).
      await until(() => audits.length === 1, "판 끝 검증");
      expect(audits).toEqual([{ ok: true }]);
      await until(() => verified.length === 1, "판마다 검증");
      expect(incidents).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
