// @vitest-environment node
import { baseballBotFor } from "@mighty/baseball-ai";
import {
  type Action,
  allNumbers,
  type BaseballRules,
  type BaseballView,
  commitmentOf,
  STANDARD_RULES,
  score,
} from "@mighty/baseball-engine";
import { createRng } from "@mighty/engine";
import { ManualClock } from "@mighty/fair-play";
import { describe, expect, it } from "vitest";

import type { MatchHost } from "@/game/host";
import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { baseballKit } from "./kit";
import { autoAction, type SecretBook } from "./secret";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 50_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/** 한 사람의 기기: 비밀은 이 안에만 있다. 묻기는 중수 컴퓨터처럼, 답하기·공개는 화면 저장소처럼 자동으로 */
class Device {
  readonly book: SecretBook = {};
  private readonly rng = createRng(7);
  /** 시험이 일부러 다르게 행동하게 할 때. null을 돌려주면 평소대로 한다 */
  lie: ((view: BaseballView) => Action | null) | null = null;
  constructor(
    readonly secret: string,
    readonly salt: string,
    private readonly host: () => MatchHost<
      BaseballView,
      Action,
      unknown
    > | null,
  ) {}
  /** 할 일이 있으면 하나 하고 true */
  act(): boolean {
    const match = this.host();
    const view = match?.current();
    if (!match || !view?.decision) return false;
    const lied = this.lie?.(view) ?? null;
    if (lied) return match.submit(lied).ok;
    let action: Action | null;
    switch (view.decision.kind) {
      case "commit":
        this.book[view.roundNumber] = { secret: this.secret, salt: this.salt };
        action = {
          type: "commit",
          hash: commitmentOf(this.secret, this.salt),
        };
        break;
      case "guess":
        action = baseballBotFor(1).decide(view, this.rng);
        break;
      case "continue":
        action = { type: "continue" };
        break;
      default:
        action = autoAction(view, this.book);
    }
    return action ? match.submit(action).ok : false;
  }
}

const HOST_SALT = "1".repeat(32);
const GUEST_SALT = "9f".repeat(16);

async function setup(rules: BaseballRules = STANDARD_RULES) {
  const clock = new ManualClock();
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: baseballKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules,
    bot: baseballBotFor(1),
    botLevel: 1,
    standInDelayMs: 1_000,
  });
  // 방장 기기가 받은 모든 메시지
  const hostInbox: string[] = [];
  host.transport.onMessage((m) => hostInbox.push(JSON.stringify(m)));
  const guest = new GuestRoom({
    kit: baseballKit,
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
  const hostDevice = new Device("123", HOST_SALT, () => host.match);
  const guestDevice = new Device("456", GUEST_SALT, () => guest.match);
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
  for (let i = 0; i < 2000 && !stopWhen(); i++) {
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

describe("숫자야구 온라인 방", () => {
  it("방장 기기의 엔진 상태·받은 메시지에 참가자 비밀이 공개 전까지 없고, 판 끝 검증을 통과한다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    let checks = 0;
    await play(
      room,
      () => over(room),
      () => {
        const state = room.host.match?.rawState();
        if (!state || state.reveals[seat]) return;
        checks++;
        // 엔진 상태 어디에도 참가자 소금이 없고, 참가자 공개 기록이 없다.
        expect(JSON.stringify(state)).not.toContain(GUEST_SALT);
        // 방장 기기가 받은 메시지에도 참가자 비밀·소금이 없다(약속만 온다).
        expect(room.hostInbox.join("\n")).not.toContain(GUEST_SALT);
        expect(room.hostInbox.join("\n")).not.toContain('"secret":"456"');
      },
    );
    expect(checks).toBeGreaterThan(4);
    const end = room.host.match?.current();
    expect(end?.reveals[seat]).toMatchObject({
      secret: "456",
      matches: true,
      wrongAt: null,
    });
    expect(end?.result?.kind).not.toBe("cheat");
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
  });

  it("방장이 거짓으로 답하면 판 끝 공개에서 드러나 방장이 지고, 참가자 화면도 같다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    // 방장은 약속한 123이 아니라 789인 것처럼 앞뒤가 맞게 거짓으로 답한다.
    // 방장이 먼저 맞혀 끝나지 않게, 방장의 물음은 참가자 수(456)를 피해 차례로 묻는다.
    room.hostDevice.lie = (view) => {
      if (view.decision?.kind === "answer")
        return { type: "answer", ...score("789", view.decision.guess) };
      if (view.decision?.kind === "guess") {
        const asked = new Set(
          view.guesses.filter((g) => g.seat === 0).map((g) => g.guess),
        );
        const guess = allNumbers(view.rules).find(
          (n) => n !== "456" && !asked.has(n),
        ) as string;
        return { type: "guess", guess };
      }
      return null;
    };
    await play(room, () => over(room));
    const end = room.guest.match?.current();
    expect(end?.reveals[0]?.wrongAt).not.toBeNull();
    expect(end?.result).toEqual({ kind: "cheat", seat, liars: [0] });
    room.host.finish();
    await until(() => room.audits.length === 1);
    // 기록은 정직하게 남았으므로 검증은 통과한다(거짓은 결과에 드러난다).
    expect(room.audits).toEqual([{ ok: true }]);
  });

  it("참가자의 뻔한 거짓 답(앞 답과 맞는 수가 없음)은 방장 엔진이 받지 않는다", async () => {
    const room = await setup();
    // 방장은 참가자에게 처음 물은 수의 숫자를 자리만 바꿔 다시 묻는다.
    room.hostDevice.lie = (view) => {
      if (view.decision?.kind !== "guess") return null;
      const first = view.guesses.find((g) => g.seat === 0);
      if (!first) return null;
      const g = first.guess;
      return { type: "guess", guess: g.slice(1) + g[0] };
    };
    // 참가자는 첫 물음에 아웃(숫자가 하나도 없다)이라 하고, 같은 숫자로 된 다음 물음에 1볼이라 한다.
    let lies = 0;
    room.guestDevice.lie = (view) => {
      if (view.decision?.kind !== "answer") return null;
      lies++;
      return lies === 1
        ? { type: "answer", strikes: 0, balls: 0 }
        : { type: "answer", strikes: 0, balls: 1 };
    };
    await play(room, () => room.rejected.length > 0 || over(room));
    expect(room.rejected).toContain("앞에서 한 답과 맞지 않는다");
  });

  it("참가자가 답하지 않고 끊기면 컴퓨터가 대신 답하지 못해 기다리고, 끝내기로 참가자가 진다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    // 참가자에게 물음이 갈 때까지 진행한다.
    await play(room, () => {
      const v = room.host.match?.current();
      return v?.phase === "answer" && v.guesses.at(-1)?.seat === 0;
    });
    room.net.disconnect("guest");
    await until(() => room.host.lobby().seats[seat]?.connected === false);
    room.clock.advance(1_000);
    await flush();
    // 대신 두는 컴퓨터는 사람이 정한 비밀을 모르니 답하지 않는다.
    expect(room.host.match?.current().phase).toBe("answer");
    room.host.abandon();
    expect(room.host.match?.current().result).toEqual({
      kind: "forfeit",
      seat: 0,
    });
  });
});
