// @vitest-environment node
import { heuristicBot } from "@mighty/ai";
import { type PlayerView, presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";
import {
  hostBidsTop,
  hostOptions,
  playRounds,
  setup,
  until,
} from "./fair-room-fixture";
import type { AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import { memoryHostStore } from "./host-store";

describe("멘탈 포커 온라인 대전: 방장 새로고침", () => {
  /** 행동 기록이 `count`개가 될 때까지 모두 봇처럼 둔다(방장은 공약을 가장 높게 걸어 다시 나누기가 없게) */
  async function advance(host: HostRoom, guests: GuestRoom[], count: number) {
    const match = host.match;
    for (let i = 0; i < 2000 && (match?.actionLog().length ?? 0) < count; i++) {
      for (const [key, view, submit] of [
        ["host", match?.current(), (a: never) => match?.submit(a)],
        ...guests.map((g, k) => [
          `g${k}`,
          g.match?.current(),
          (a: never) => g.match?.submit(a),
        ]),
      ] as [string, PlayerView | undefined, (a: never) => void][])
        if (view?.decision)
          submit(
            (hostBidsTop(view, key) ??
              heuristicBot.decide(view, { seed: 5 })) as never,
          );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  // 새로고침 뒤 다음 판(새로 섞기)까지 이어 가는지는 5마로 보고, 6마(죽이기·다시 나누기)는 그 판만 본다
  it.each([
    ["5마(두 판)", "standard5", 2, [8, 30], 2],
    ["6마(한 판)", "standard6", 3, [14, 40], 1],
  ] as const)(
    "%s: 방장이 판 중간에 새로고침해도 남긴 방으로 이어 가고, 모두의 검증을 통과한다",
    async (_name, preset, guestCount, points, rounds) => {
      const rules = presetRules(preset);
      const store = memoryHostStore();
      const { net, host, guests, incidents, clock } = await setup(
        rules,
        guestCount,
        store,
      );
      const audits: AuditResult[] = [];
      for (const g of guests) g.on("audit", (r) => audits.push(r));
      const verified: number[] = [];
      for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      let current = host;
      for (const [k, point] of points.entries()) {
        await advance(current, guests, point);
        const before = current.match?.actionLog().length ?? 0;
        // 새로고침: 방장 기기 메모리는 사라지고, 남긴 것으로 새 연결에서 방을 다시 연다.
        net.disconnect(k === 0 ? "host" : `host${k}`);
        // 메모리 네트워크는 끊김 알림을 마이크로태스크로 보내므로, 다음 차례 하나만 양보하면 모두에게 닿는다
        await new Promise((resolve) => setTimeout(resolve, 0));
        const restore = store.load();
        expect(restore?.saved.match).not.toBeNull();
        current = new HostRoom({
          transport: net.join(`host${k + 1}`),
          ...hostOptions(rules, clock, store),
          ...(restore ? { restore } : {}),
        });
        current.onIncident((n) => incidents.push(n));
        expect(current.match?.actionLog().length).toBe(before);
        await until(() => current.lobby().seats.every((s) => s.connected));
        // 섞기 사슬이 다시 모이면 "섞는 중"이 꺼진다(방장 화면이 판 끝 결과를 가리지 않게).
        let busy: unknown = "모름";
        current.fair?.coordinator.onBusy((b) => {
          busy = b;
        });
        // CI는 여러 시험이 함께 돌아 다시 섞기가 느리다(20초로는 모자란 적이 있다). 다른 대기와 같이 기본값을 쓴다.
        await until(() => busy === null).catch(() => {
          throw new Error(`섞는 중이 꺼지지 않는다: ${String(busy)}`);
        });
      }
      const scored = await playRounds(
        current,
        guests,
        rounds,
        incidents,
        hostBidsTop,
      );
      expect(
        incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`),
      ).toEqual([]);
      expect(scored).toBe(rounds);
      current.finish();
      await until(() => audits.length === guestCount);
      expect(audits.filter((a) => !a.ok)).toEqual([]);
      // 판마다 검증은 판 끝 기록을 받은 뒤 비동기로 끝난다.
      await until(() => verified.length >= rounds * guestCount);
    },
  );
});
