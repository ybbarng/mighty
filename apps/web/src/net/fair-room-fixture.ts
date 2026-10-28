/** 멘탈 포커 온라인 대전 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
import { heuristicBot, intermediateBot } from "@mighty/ai";
import type { Action, PlayerView, RuleSet } from "@mighty/engine";
import { ManualClock, prepareGroup } from "@mighty/fair-play";
import { type FairSaved, GuestRoom } from "./guest-room";

import { HostRoom, type IncidentNotice } from "./host-room";
import type { HostStore } from "./host-store";
import { MemoryNetwork } from "./transport";

// 실제 방과 같은 타원곡선 군(r255). 앱에서는 방에 들어갈 때(openTransport) 준비한다.
await prepareGroup("r255");

/**
 * 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이라 시험 상한(180초) 바로 아래로 둔다.
 * 60초였을 때 다른 시험과 함께 돌아 CPU가 바쁜 기기에서 정상 진행이 상한에 걸린 적이 있다
 */
export async function until(
  condition: () => boolean,
  ms = 170_000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * 방장과 참가자의 멘탈 포커 기기가 모두 할 일을 마칠 때까지 기다린다(섞기 증명 계산까지).
 * 메모리 망은 메시지를 바로(마이크로태스크로) 전하니, 한 바퀴 돌고도 바쁜 기기가 없으면 조용하다.
 * 제한 시간을 지나게 하기 전에 부른다: 정직한 기기의 증명이 이미 와 있어 늦은 것으로 몰리지 않는다.
 */
export async function settleDevices(
  host: HostRoom,
  guests: GuestRoom[],
): Promise<void> {
  const devices = () =>
    [host.fair?.device, ...guests.map((g) => g.fair?.device)].filter(
      (d) => d !== undefined,
    );
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.all(devices().map((d) => d.idle()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (devices().every((d) => !d.busy())) return;
  }
}

/** 참가자 브라우저 저장소(새로고침해도 남는다) */
export function memoryStore() {
  let saved: FairSaved | null = null;
  return {
    load: () => saved,
    save: (s: FairSaved) => {
      saved = JSON.parse(JSON.stringify(s));
    },
  };
}

/** 방장 옵션. 제한 시간은 시험의 시계로 잰다 */
export function hostOptions(
  rules: RuleSet,
  clock: ManualClock,
  store?: HostStore,
) {
  return {
    hostName: "방장",
    rules,
    revealTimeoutMs: 500,
    bot: intermediateBot,
    botLevel: 1,
    fair: { group: "r255" as const },
    clock,
    ...(store ? { store } : {}),
  };
}

export async function setup(
  rules: RuleSet,
  guestCount: number,
  store?: HostStore,
  voteDelayMs?: number,
) {
  const net = new MemoryNetwork();
  // 제한 시간(투표 열기 등)은 시험이 이 시계를 옮길 때만 지난다.
  const clock = new ManualClock();
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(rules, clock, store),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      fairStore: memoryStore(),
      clock,
    });
    await until(() => guest.seat !== null);
    guests.push(guest);
  }
  await until(() =>
    guests.every((g) => g.lobby?.seats.length === rules.playerCount),
  );
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests) g.on("incident", (n) => incidents.push(n));
  return { net, host, guests, incidents, clock };
}

export type Cheat = (view: PlayerView, key: string) => Action | null;

/** 사람 자리(방장과 참가자)도 봇처럼 둔다. `cheat`가 행동을 돌려주면 0번 참가자는 그것을 낸다 */
export async function playRounds(
  host: HostRoom,
  guests: GuestRoom[],
  rounds: number,
  incidents: IncidentNotice[],
  cheat?: Cheat,
): Promise<number> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const submitted = new Map<string, string>();
  const start = Date.now();
  let scored = 0;
  match.subscribe((snapshot) => {
    if (snapshot.events.some((e) => e.type === "roundScored")) scored++;
  });
  // 거절되면(예: 낸 직후 새로고침해 열쇠가 가지 못함) 사람처럼 다시 낸다.
  const offs = guests.map((g, i) =>
    g.on("rejected", () => submitted.delete(`g${i}`)),
  );
  match.drain();
  while (scored < rounds) {
    // 다른 시험과 CPU를 나눠 쓰거나 기기가 바쁘면 몇 배 느려진다. 멈춘 판만 잡도록 넉넉히 둔다.
    if (Date.now() - start > 300_000) throw new Error("판이 끝나지 않는다");
    if (incidents.length > 0) break;
    const hostView = match.current();
    if (hostView.phase === "gameOver") break;
    const act = (
      key: string,
      view: typeof hostView,
      submit: (a: never) => void,
    ) => {
      if (!view.decision) return;
      const stamp = JSON.stringify([
        view.roundNumber,
        view.phase,
        view.trickIndex,
        view.trick?.plays.length,
        view.election.log.length,
        view.decision.kind,
        view.turn,
        view.dead,
        view.killFailed,
        view.handCounts,
      ]);
      if (submitted.get(key) === stamp) return;
      submitted.set(key, stamp);
      const forced = cheat ? cheat(view, key) : null;
      submit((forced ?? heuristicBot.decide(view, { seed: 7 })) as never);
    };
    act("host", hostView, (a) => match.submit(a));
    for (const [i, g] of guests.entries()) {
      const view = g.match?.current();
      if (view) act(`g${i}`, view, (a) => g.match?.submit(a));
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  for (const off of offs) off();
  return scored;
}
