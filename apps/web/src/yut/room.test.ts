import { createRng } from "@mighty/engine";
import { ManualClock } from "@mighty/fair-play";
import { yutBotFor } from "@mighty/yut-ai";
import {
  type Action,
  chainLink,
  STANDARD_RULES,
  type YutRules,
  type YutView,
} from "@mighty/yut-engine";
import { describe, expect, it } from "vitest";

import type { MatchHost } from "@/game/host";
import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { commitAction, mySeed, revealAction, type SeedBook } from "./chain";
import { yutKit } from "./kit";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 60_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/**
 * 한 사람의 기기: 사슬 씨앗은 이 안에만 있다. 약속·공개는 화면 저장소처럼 자동으로,
 * 던지기는 바로, 움직이기는 중수 컴퓨터처럼
 */
class Device {
  readonly book: SeedBook;
  private readonly rng = createRng(7);
  /** 시험이 일부러 다르게 행동하게 할 때. null을 돌려주면 평소대로 한다 */
  lie: ((view: YutView) => Action | null) | null = null;
  /** true를 돌려주면 이번에는 아무것도 하지 않는다(공개를 미루는 기기) */
  hold: ((view: YutView) => boolean) | null = null;
  constructor(
    readonly seed: string,
    private readonly host: () => MatchHost<YutView, Action, unknown> | null,
  ) {
    this.book = { 0: seed };
  }
  act(): boolean {
    const match = this.host();
    const view = match?.current();
    if (!match || !view?.decision) return false;
    if (this.hold?.(view)) return false;
    const lied = this.lie?.(view) ?? null;
    if (lied) return match.submit(lied).ok;
    let action: Action | null;
    switch (view.decision.kind) {
      case "commit":
        action = commitAction(this.seed);
        break;
      case "reveal": {
        const seed = mySeed(view, this.book);
        action = seed ? revealAction(view, seed) : null;
        break;
      }
      default:
        action = yutBotFor(1).decide(view, this.rng);
    }
    return action ? match.submit(action).ok : false;
  }
}

const HOST_SEED = "1a".repeat(32);
const GUEST_SEED = "9f".repeat(32);

/**
 * 방 시험은 약속·공개·판 끝 검증 진행만 보므로 말 두 개로 짧게 둔다(말 수만큼 판이 길어질 뿐 진행 논리는 같다)
 */
const ROOM_RULES: YutRules = { ...STANDARD_RULES, pieces: 2 };

async function setup(rules: YutRules = ROOM_RULES) {
  const clock = new ManualClock();
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: yutKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules,
    bot: yutBotFor(1),
    botLevel: 1,
    standInDelayMs: 1_000,
  });
  // 방장 기기가 받은 모든 메시지
  const hostInbox: string[] = [];
  host.transport.onMessage((m) => hostInbox.push(JSON.stringify(m)));
  const guest = new GuestRoom({
    kit: yutKit,
    transport: net.join("guest"),
    clock,
    name: "철수",
    token: null,
  });
  await until(() => guest.seat !== null && guest.lobby !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  const rejected: string[] = [];
  guest.on("rejected", (e) => rejected.push(e));
  await host.start();
  await until(() => guest.match !== null);
  const hostDevice = new Device(HOST_SEED, () => host.match);
  const guestDevice = new Device(GUEST_SEED, () => guest.match);
  return {
    clock,
    net,
    host,
    guest,
    hostInbox,
    audits,
    rejected,
    hostDevice,
    guestDevice,
  };
}

type Room = Awaited<ReturnType<typeof setup>>;

/** 두 기기가 번갈아 할 일을 한다. `watch`는 걸음마다 부른다 */
async function play(room: Room, stopWhen: () => boolean, watch?: () => void) {
  for (let i = 0; i < 20_000 && !stopWhen(); i++) {
    room.hostDevice.act();
    room.guestDevice.act();
    await flush();
    watch?.();
  }
  if (!stopWhen()) throw new Error("끝나지 않았다");
}

const over = (room: Room) =>
  room.host.match?.current().phase === "gameOver" &&
  room.guest.match?.current().phase === "gameOver";

describe("윷놀이 온라인 방", () => {
  it("방장은 참가자 씨앗과 아직 공개하지 않은 다음 고리를 모르고, 판 끝 검증을 통과한다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    let checks = 0;
    await play(
      room,
      () => over(room),
      () => {
        const state = room.host.match?.rawState();
        if (!state || state.phase === "gameOver") return;
        const used = state.chains[seat]?.used ?? 0;
        const next = chainLink(GUEST_SEED, used + 1);
        const seen = `${JSON.stringify(state)}\n${room.hostInbox.join("\n")}`;
        checks++;
        // 방장 엔진 상태와 받은 메시지 어디에도 참가자 씨앗이 없고,
        // 참가자가 아직 공개하지 않은 다음 고리도 없다(방장이 다음 던지기를 미리 알 수 없다).
        expect(seen).not.toContain(GUEST_SEED);
        if (state.reveals[seat] === null) expect(seen).not.toContain(next);
      },
    );
    expect(checks).toBeGreaterThan(20);
    const end = room.host.match?.current();
    expect(end?.result?.kind).toBe("finish");
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
    // 상한은 멈춘 시험을 잡는 안전장치다(다른 방 시험과 같다). 혼자 0.6초 남짓
  }, 60_000);

  it("약속한 사슬에 없는 고리를 보내면 방장 엔진이 받지 않는다", async () => {
    const room = await setup();
    // 참가자는 결과를 바꿔 보려고 다른 씨앗의 고리를 보낸다.
    room.guestDevice.lie = (view) =>
      view.decision?.kind === "reveal"
        ? { type: "reveal", link: chainLink("ee".repeat(32), 1) }
        : null;
    await play(room, () => room.rejected.length > 0);
    expect(room.rejected).toContain("약속한 사슬의 다음 고리가 아니다");
  });

  it("참가자가 공개하지 않고 끊기면 컴퓨터가 대신 공개하지 못해 기다리고, 끝내기로 참가자 편이 진다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    // 참가자 기기는 첫 공개를 미룬다. 참가자 공개만 남을 때까지 진행한다.
    room.guestDevice.hold = (view) =>
      view.decision?.kind === "reveal" && view.throwCount === 0;
    await play(room, () => {
      const v = room.host.match?.current();
      return (
        v?.phase === "reveal" &&
        v.reveals[0] !== null &&
        v.reveals[seat] === null
      );
    });
    room.net.disconnect("guest");
    await until(() => room.host.lobby().seats[seat]?.connected === false);
    room.clock.advance(1_000);
    await flush();
    // 대신 두는 컴퓨터는 사람이 만든 씨앗을 모르니 공개하지 않는다.
    expect(room.host.match?.current().phase).toBe("reveal");
    room.host.abandon();
    expect(room.host.match?.current().result).toEqual({
      kind: "forfeit",
      seat,
      side: 0,
    });
  });

  it("빈자리를 컴퓨터가 맡은 3인 방도 끝까지 두고 검증을 통과한다", async () => {
    const room = await setup({ ...ROOM_RULES, players: 3 });
    await play(room, () => over(room));
    expect(room.host.match?.current().result?.kind).toBe("finish");
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
    // 상한은 멈춘 시험을 잡는 안전장치다(다른 방 시험과 같다). 혼자 0.9초 남짓
  }, 60_000);
});
