import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { ManualClock } from "@mighty/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  drandRoundForClose,
  drandTime,
  generateSigner,
  roundTimes,
  type SoftPasskey,
  softPasskeySigner,
  type Ticket,
  toHex,
} from "@mighty/stardraw-core";
import { beforeEach, describe, expect, it } from "vitest";

import { defaultSchedule } from "./config";
import { EntryError } from "./engine";
import {
  DEFAULT_ROOM_LIMITS,
  type RoomEvent,
  RoomHub,
  roomModMessage,
  roomPassMessage,
} from "./room";

/** 스트림을 받는 가짜 응답: 쓴 줄을 이벤트로 모은다 */
class FakeRes extends EventEmitter {
  events: RoomEvent[] = [];
  ended = false;
  status = 0;
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  write(chunk: string) {
    for (const line of chunk.split("\n"))
      if (line.startsWith("data: "))
        this.events.push(JSON.parse(line.slice(6)));
    return true;
  }
  end() {
    this.ended = true;
    this.emit("close");
    return this;
  }
  of<T extends RoomEvent["type"]>(type: T) {
    return this.events.filter((e) => e.type === type) as Extract<
      RoomEvent,
      { type: T }
    >[];
  }
}
const asRes = (r: FakeRes) => r as unknown as ServerResponse;

const EPOCH = 1_800_000_000;
const schedule = defaultSchedule(EPOCH, 600);
const ROUND = 1;
const times = roundTimes(schedule, ROUND);
const DRAW_AT = drandTime(drandRoundForClose(times.closesAt));

let clock: ManualClock;
let hub: RoomHub;
let alice: SoftPasskey;
let bob: SoftPasskey;
let director: SoftPasskey;
let stranger: SoftPasskey;
let registered: Set<string>;
let tickets: Ticket[];
let sealed: boolean;
let drawn: boolean;

beforeEach(async () => {
  clock = new ManualClock();
  clock.advance((times.opensAt + 10) * 1000);
  alice = softPasskeySigner(await generateSigner());
  bob = softPasskeySigner(await generateSigner());
  director = softPasskeySigner(await generateSigner());
  stranger = softPasskeySigner(await generateSigner());
  registered = new Set([toHex(alice.publicKey), toHex(bob.publicKey)]);
  tickets = [];
  sealed = false;
  drawn = false;
  hub = new RoomHub({
    clock,
    policy: DEFAULT_WEBAUTHN_POLICY,
    schedule: () => schedule,
    isRegistered: (p) => registered.has(toHex(p)),
    isDirector: (p) => toHex(p) === toHex(director.publicKey),
    sealed: () => sealed,
    tickets: () => tickets,
    drawn: () => drawn,
  });
});

async function passFor(who: SoftPasskey) {
  const { nonce } = hub.challenge(ROUND);
  const signature = await who.sign(
    roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
  );
  return hub.issuePass(ROUND, { pub: who.publicKey, signature, nonce });
}

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof EntryError) return err.status;
    throw err;
  }
  return 200;
};

describe("대화 표(신분증 제시 한 번)", () => {
  it("등록한 우주인은 받고, 등록하지 않은 열쇠는 거절", async () => {
    const p = await passFor(alice);
    expect(p.pass).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(passFor(stranger)).rejects.toMatchObject({ status: 403 });
  });

  it("한 번 쓰는 값은 두 번 쓸 수 없고, 다른 회차·다른 용도 서명은 안 된다", async () => {
    const { nonce } = hub.challenge(ROUND);
    const n = Buffer.from(nonce, "base64url");
    const signature = await alice.sign(roomPassMessage(ROUND, n));
    await hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce });
    await expect(
      hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce }),
    ).rejects.toMatchObject({ status: 403 });
    const other = hub.challenge(ROUND).nonce;
    const wrong = await alice.sign(
      roomPassMessage(2, Buffer.from(other, "base64url")),
    );
    await expect(
      hub.issuePass(ROUND, {
        pub: alice.publicKey,
        signature: wrong,
        nonce: other,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("국장 패스키는 등록이 없어도 표를 받고 국장으로 표시된다", async () => {
    const p = await passFor(director);
    const res = new FakeRes();
    hub.connect(ROUND, asRes(res), p.pass);
    expect(res.of("hello")[0]?.people[0]).toMatchObject({ director: true });
  });
});

describe("스트림과 말", () => {
  it("들어오면 얼굴, 말은 연결된 사람에게만 건네고 남기지 않는다", async () => {
    const a = await passFor(alice);
    const b = await passFor(bob);
    const ra = new FakeRes();
    const watcher = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.connect(ROUND, asRes(watcher), undefined);
    expect(ra.of("watchers").at(-1)?.count).toBe(1);
    const rb = new FakeRes();
    hub.connect(ROUND, asRes(rb), b.pass);
    expect(ra.of("join").map((e) => e.person.id)).toEqual([b.id]);
    hub.say(ROUND, b.pass, "  오늘은   시리우스!  ");
    expect(ra.of("say")[0]).toMatchObject({
      from: b.id,
      text: "오늘은 시리우스!",
    });
    expect(watcher.of("say")).toHaveLength(1);
    // 늦게 온 사람은 앞 말을 받지 않는다
    const late = new FakeRes();
    hub.connect(ROUND, asRes(late), undefined);
    expect(late.of("say")).toHaveLength(0);
    expect(JSON.stringify(late.of("hello")[0])).not.toContain("시리우스");
  });

  it("40자를 넘으면 거절, 표 없이 말하면 거절", async () => {
    const a = await passFor(alice);
    expect(status(() => hub.say(ROUND, a.pass, "가".repeat(40)))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "가".repeat(41)))).toBe(413);
    expect(status(() => hub.say(ROUND, "남의표", "안녕"))).toBe(401);
  });

  it("말 빠르기: 몰아서 3번, 그 뒤 2.5초마다 한 번", async () => {
    const a = await passFor(alice);
    for (let i = 0; i < 3; i++)
      expect(status(() => hub.say(ROUND, a.pass, `${i}`))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "넷"))).toBe(429);
    clock.advance(DEFAULT_ROOM_LIMITS.sayIntervalMs);
    expect(status(() => hub.say(ROUND, a.pass, "넷"))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "다섯"))).toBe(429);
  });

  it("응원은 0.8초에 한 번, 대상이 방에 없으면 하늘로", async () => {
    const a = await passFor(alice);
    const ra = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.cheer(ROUND, a.pass, "twinkle", "없는사람");
    expect(ra.of("cheer")[0]).toMatchObject({ kind: "twinkle", to: null });
    expect(status(() => hub.cheer(ROUND, a.pass, "meteor", null))).toBe(429);
    clock.advance(DEFAULT_ROOM_LIMITS.cheerIntervalMs);
    expect(status(() => hub.cheer(ROUND, a.pass, "meteor", null))).toBe(200);
  });
});

describe("봉인·추첨·닫기", () => {
  it("봉인 전에는 고른 별을 보내지 않고, 봉인 뒤 별마다 수와 방 안 사람의 6개", async () => {
    const a = await passFor(alice);
    tickets = [
      {
        pub: alice.publicKey,
        numbers: [1, 2, 3, 4, 5, 6],
      } as unknown as Ticket,
      {
        pub: stranger.publicKey,
        numbers: [1, 7, 8, 9, 10, 11],
      } as unknown as Ticket,
    ];
    const ra = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    const hello = ra.of("hello")[0];
    expect(hello?.picks).toBeNull();
    expect(hello?.people[0]?.entered).toBe(true);
    sealed = true;
    clock.advance(1000);
    const picks = ra.of("sealed")[0]?.picks;
    expect(picks?.counts[1]).toBe(2);
    expect(picks?.byPerson[a.id]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(picks?.byPerson ?? {})).toHaveLength(1);
  });

  it("추첨 뒤에는 새로 들어오지 못하고, 추첨 전 표는 다시 들어온다. 7분 뒤 닫힌다", async () => {
    const a = await passFor(alice);
    clock.advance((DRAW_AT - (times.opensAt + 10)) * 1000);
    expect(status(() => hub.challenge(ROUND))).toBe(409);
    expect(
      status(() => hub.connect(ROUND, asRes(new FakeRes()), undefined)),
    ).toBe(409);
    const back = new FakeRes();
    hub.connect(ROUND, asRes(back), a.pass);
    expect(back.status).toBe(200);
    drawn = true;
    clock.advance(1000);
    expect(back.of("drawn")).toHaveLength(1);
    clock.advance(DEFAULT_ROOM_LIMITS.closeAfterMs);
    expect(back.of("closed")).toHaveLength(1);
    expect(back.ended).toBe(true);
    expect(status(() => hub.say(ROUND, a.pass, "끝"))).toBe(410);
  });
});

describe("국장 조치", () => {
  async function modded(
    action: "hide" | "kick",
    target: string,
    who = director,
  ) {
    const { nonce } = hub.challenge(ROUND);
    const signature = await who.sign(
      roomModMessage(ROUND, action, target, Buffer.from(nonce, "base64url")),
    );
    return hub.moderate(ROUND, {
      pub: who.publicKey,
      signature,
      nonce,
      action,
      target,
    });
  }

  it("국장은 말을 가리고 사람을 내보낸다. 국장이 아니면 거절", async () => {
    const a = await passFor(alice);
    const ra = new FakeRes();
    const watcher = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.connect(ROUND, asRes(watcher), undefined);
    const { id } = hub.say(ROUND, a.pass, "광고입니다");
    await modded("hide", id);
    expect(watcher.of("hide")[0]?.id).toBe(id);
    await expect(modded("kick", a.id, alice)).rejects.toMatchObject({
      status: 403,
    });
    await modded("kick", a.id);
    expect(ra.ended).toBe(true);
    expect(watcher.of("kicked")[0]?.id).toBe(a.id);
    expect(status(() => hub.say(ROUND, a.pass, "다시"))).toBe(401);
  });
});
