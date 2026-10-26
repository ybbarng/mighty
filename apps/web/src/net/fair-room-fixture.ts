/** 멘탈 포커 온라인 대전 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
import { heuristicBot, intermediateBot } from "@mighty/ai";
import type { Action, PlayerView, RuleSet } from "@mighty/engine";
import { type FairSaved, GuestRoom } from "./guest-room";

import { HostRoom, type IncidentNotice } from "./host-room";
import type { HostStore } from "./host-store";
import { MemoryNetwork } from "./transport";

export async function until(
  condition: () => boolean,
  ms = 60_000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
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

export function hostOptions(rules: RuleSet, store?: HostStore) {
  return {
    hostName: "방장",
    rules,
    revealTimeoutMs: 500,
    bot: intermediateBot,
    botLevel: 1,
    fair: { group: "1024" as const },
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
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(rules, store),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      fairStore: memoryStore(),
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
  return { net, host, guests, incidents };
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
    if (Date.now() - start > 120_000) throw new Error("판이 끝나지 않는다");
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
