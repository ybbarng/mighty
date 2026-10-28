/** 화투 멘탈 포커 온라인 방 시험이 같이 쓰는 도우미(민화투·고스톱·나이롱뽕) */

import { ManualClock, prepareGroup } from "@mighty/fair-play";
import { isHiddenId } from "@mighty/hwatu";
import { expect } from "vitest";
import type { GameKit, KitBot } from "@/game/kit";
import type { AuditResult, GuestRoom } from "@/net/guest-room";
import type { HostRoom, IncidentNotice } from "@/net/host-room";
import { memoryHostStore } from "@/net/host-store";
import { MemoryNetwork } from "@/net/transport";

await prepareGroup("r255");

export async function until(
  condition: () => boolean,
  what = "조건",
  ms = 60_000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error(`${what}을 기다리다 시간이 지났다`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
type AnyKit = GameKit<any, any, any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
export type AnyHost = HostRoom<any, any, any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
export type AnyGuest = GuestRoom<any, any, any, any, any, any>;

/** 방장 하나와 참가자 여럿, 빈자리는 컴퓨터. 암호화방(r255) */
export async function setupHwatu(options: {
  kit: AnyKit;
  rules: unknown;
  guests: number;
  // biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
  bot: KitBot<any, any>;
  botLevel: number;
  HostRoom: new (o: never) => AnyHost;
  GuestRoom: new (o: never) => AnyGuest;
  hostStore?: boolean;
}) {
  const net = new MemoryNetwork();
  const clock = new ManualClock();
  const store = options.hostStore ? memoryHostStore() : undefined;
  const host = new options.HostRoom({
    kit: options.kit,
    transport: net.join("host"),
    hostName: "방장",
    rules: options.rules,
    bot: options.bot,
    botLevel: options.botLevel,
    revealTimeoutMs: 500,
    fair: { group: "r255" },
    clock,
    ...(store ? { store } : {}),
  } as never);
  const guests: AnyGuest[] = [];
  for (let i = 0; i < options.guests; i++) {
    const guest = new options.GuestRoom({
      kit: options.kit,
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      clock,
    } as never);
    await until(() => guest.seat !== null, "자리");
    guests.push(guest);
  }
  const count = options.kit.playerCount(options.rules);
  await until(
    () => guests.every((g) => g.lobby?.seats.length === count),
    "대기실",
  );
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests)
    g.on("incident", (n) => incidents.push(n as IncidentNotice));
  const audits: AuditResult[] = [];
  for (const g of guests) g.on("audit", (r) => audits.push(r));
  const verified: number[] = [];
  for (const g of guests) g.on("roundVerified", (r) => verified.push(r));
  return { net, clock, host, guests, incidents, audits, verified, store };
}

/** 방장 엔진 상태에 이 자리들의 진짜 카드가 없는지(자리 표뿐인지) */
export function expectHidden(cards: readonly string[]): void {
  for (const id of cards) expect(isHiddenId(id), `숨은 카드 ${id}`).toBe(true);
}

/**
 * 사람 자리(방장·참가자)도 컴퓨터처럼 둔다. 같은 화면이면 다시 내지 않는다.
 * `check`는 걸음마다 부른다(방장이 남의 패를 모르는지 등)
 */
export async function playHwatu(options: {
  host: AnyHost;
  guests: AnyGuest[];
  // biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
  bot: KitBot<any, any>;
  done: () => boolean;
  incidents: IncidentNotice[];
  check?: () => void;
  /** 걸음마다 시계를 옮긴다(응답 창 같은 제한 시간) */
  tick?: () => void;
  ms?: number;
}): Promise<void> {
  const match = options.host.match;
  if (!match) throw new Error("시작하지 않았다");
  const stamps = new Map<string, string>();
  for (const [i, g] of options.guests.entries())
    g.on("rejected", () => stamps.delete(`g${i}`));
  options.host.onOwnError(() => stamps.delete("host"));
  const start = Date.now();
  let seed = 1;
  while (!options.done() && options.incidents.length === 0) {
    if (Date.now() - start > (options.ms ?? 120_000))
      throw new Error(
        `끝나지 않는다: 방장 ${JSON.stringify(match.current()).slice(0, 400)}`,
      );
    options.check?.();
    const act = (
      key: string,
      view: { decision: unknown } | undefined,
      submit: (a: unknown) => void,
    ) => {
      if (!view?.decision) return;
      const stamp = JSON.stringify(view);
      if (stamps.get(key) === stamp) return;
      stamps.set(key, stamp);
      submit(options.bot.decide(view, { seed: seed++ }));
    };
    act("host", match.current(), (a) => match.submit(a));
    for (const [i, g] of options.guests.entries())
      act(`g${i}`, g.match?.current(), (a) => g.match?.submit(a));
    options.tick?.();
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
