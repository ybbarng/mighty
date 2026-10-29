import { ManualClock, prepareGroup } from "@mighty/fair-play";
import { heartsIntermediateBot, heartsNormalBot } from "@mighty/hearts-ai";
import { WINDOWS_RULES } from "@mighty/hearts-engine";

import { GuestRoom } from "@/net/guest-room";
import { HostRoom, type IncidentNotice } from "@/net/host-room";
import type { HostStore } from "@/net/host-store";
import { MemoryNetwork } from "@/net/transport";

import { heartsKit } from "./kit";

/**
 * 하트 멘탈 포커 방 시험의 공통 준비. 시험을 두 파일(fair-room, fair-room-reload)로 나눠 동시에 돌게 한다
 */

await prepareGroup("r255");

export async function until(
  condition: () => boolean,
  ms = 50_000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * 끝 점수 기본 10점(규칙 문자열이 받는 가장 작은 값): 한 판에 26점이 나뉘어 대개 한 판, 드물게 두 판에 끝난다
 * (새로고침·끊김·부정·복기는 한 판이면 된다). 판이 바뀌어도 이어 가는지는 첫 시험이 27점으로 본다
 * (한 판에 나눠지는 점수가 26점이라 적어도 두 판)
 */
export function hostOptions(
  clock: ManualClock,
  store?: HostStore,
  endScore = 10,
) {
  return {
    kit: heartsKit,
    hostName: "방장",
    rules: { ...WINDOWS_RULES, endScore },
    bot: heartsIntermediateBot,
    botLevel: 1,
    revealTimeoutMs: 500,
    fair: { group: "r255" as const },
    clock,
    ...(store ? { store } : {}),
  };
}

export async function setup(
  guestCount: number,
  store?: HostStore,
  voteDelayMs?: number,
  endScore?: number,
) {
  const net = new MemoryNetwork();
  // 제한 시간(투표 열기 등)은 시험이 이 시계를 옮길 때만 지난다.
  const clock = new ManualClock();
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(clock, store, endScore),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom<
    typeof WINDOWS_RULES,
    never,
    never,
    never,
    never,
    never
  >[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      kit: heartsKit,
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      clock,
    });
    await until(() => guest.seat !== null);
    guests.push(guest as never);
  }
  await until(() => guests.every((g) => g.lobby?.seats.length === 4));
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests) g.on("incident", (n) => incidents.push(n));
  return { net, host, guests, incidents, clock };
}

/** 사람 자리도 중수 컴퓨터처럼 둔다. 같은 화면이면 다시 내지 않는다 */
export async function playUntil(
  host: HostRoom<never, never, never, never, never, never>,
  guests: GuestRoom<never, never, never, never, never, never>[],
  done: () => boolean,
  incidents: IncidentNotice[],
): Promise<void> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const stamps = new Map<string, string>();
  const offs = guests.map((g, i) =>
    g.on("rejected", () => stamps.delete(`g${i}`)),
  );
  const start = Date.now();
  while (!done() && incidents.length === 0) {
    if (Date.now() - start > 50_000) {
      const raw = (
        match as unknown as {
          rawState(): {
            round: {
              phase: string;
              turn: number | null;
              trickIndex: number;
              trick: unknown;
              passes: unknown;
              hands: string[][];
            };
            roundNumber: number;
          };
        }
      ).rawState();
      const hv = match.current() as unknown as {
        decision: unknown;
        hand: string[];
      };
      throw new Error(
        `끝나지 않는다: ${JSON.stringify({ round: raw.roundNumber, phase: raw.round.phase, turn: raw.round.turn, trick: raw.round.trick, passes: raw.round.passes, hands: raw.round.hands.map((h) => h.length), hostDecision: hv.decision, hostHand: hv.hand, guests: guests.map((g) => ({ seat: g.seat, waiting: (g.fair as unknown as { waiting: boolean })?.waiting, decision: (g.match?.current() as unknown as { decision: unknown })?.decision })) })}`,
      );
    }
    const act = (key: string, view: never, submit: (a: never) => void) => {
      const v = view as {
        decision: unknown;
        roundNumber: number;
        phase: string;
        trickIndex: number;
        handCounts: number[];
        trick: { plays: unknown[] } | null;
      };
      if (!v?.decision) return;
      const stamp = JSON.stringify([
        v.roundNumber,
        v.phase,
        v.trickIndex,
        v.trick?.plays.length,
        v.handCounts,
      ]);
      if (stamps.get(key) === stamp) return;
      stamps.set(key, stamp);
      submit(heartsNormalBot.decide(view, { seed: 9 }) as never);
    };
    act("host", match.current(), (a) => match.submit(a));
    for (const [i, g] of guests.entries())
      if (g.match) act(`g${i}`, g.match.current(), (a) => g.match?.submit(a));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  for (const off of offs) off();
}
