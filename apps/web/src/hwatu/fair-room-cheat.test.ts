// 부정 시험(fair-room-extra.test에서 나눠 동시에 돈다). 머리는 그 파일과 같다
/**
 * 화투 암호화방(멘탈 포커) 공통 진행의 시험: 새로고침·재연결·끊긴 사람, 그리고 고친 프로그램(부정).
 * 세 게임이 같은 진행(fair-play HwatuHostTable)을 쓰므로 가장 단순한 민화투로 본다. 끝까지 치는 시험은
 * 게임마다 따로 있다(minhwatu·gostop·nyrongppong `fair-room.test.ts`)
 */
import { type HwatuGuestSeat, Party } from "@mighty/fair-play";
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@mighty/minhwatu-ai";
import {
  type MinhwatuState,
  type MinhwatuView,
  STANDARD_RULES,
} from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuKit } from "@/minhwatu/kit";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import {
  type AnyGuest,
  type AnyHost,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

const RULES = { ...STANDARD_RULES, rounds: 2 };

const setup = (guests: number, hostStore = false) =>
  setupHwatu({
    kit: minhwatuKit,
    rules: RULES,
    guests,
    bot: minhwatuIntermediateBot,
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
    hostStore,
  });

// biome-ignore lint/suspicious/noExplicitAny: 시험에서 진행 속을 들여다본다
type Seat = HwatuGuestSeat<any, any, MinhwatuView, any, any>;

const phase = (host: AnyHost) =>
  (host.match?.current() as MinhwatuView | undefined)?.phase;
describe("화투 암호화방: 고친 프로그램(부정)", () => {
  it("참가자가 남의 자리 카드를 내려 하면 방장이 바로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.fair !== null, "참가자 진행");
    const guest = guests[0] as AnyGuest;
    const seat = guest.fair as Seat;
    const cheater = guest.seat as number;
    // 참가자 프로그램: 카드를 낼 때 방장 손패 자리를 싣는다(열쇠는 공개하지 않는다).
    seat.outgoing = (action) => {
      const round = (guest.match as { current(): MinhwatuView }).current()
        .roundNumber;
      const layout = seat.coordinator.ctxOf(round)?.layout;
      return action.type === "play"
        ? { ...action, fairSlots: [layout?.hands[0]?.[0] ?? 0] }
        : action;
    };
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => incidents.length > 0,
    });
    expect(incidents[0]?.seat).toBe(cheater);
    expect(incidents[0]?.reason).toMatch(/자기 손에 없는 자리/);
  }, 180_000);

  it("참가자가 낸다고 한 카드와 다른 자리 열쇠를 공개하면 방장이 바로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.fair !== null, "참가자 진행");
    const guest = guests[0] as AnyGuest;
    const seat = guest.fair as Seat;
    const cheater = guest.seat as number;
    const honest = seat.outgoing.bind(seat);
    // 참가자 프로그램: 낼 카드 열쇠는 그대로 공개하고, 낸다고 하는 카드만 손패의 다른 카드로 바꾼다.
    seat.outgoing = (action) => {
      const out = honest(action);
      if (out?.type !== "play") return out;
      const hand = (guest.match as { current(): MinhwatuView }).current().hand;
      const other = hand.find((c) => c !== action.card);
      return other ? { ...out, card: other } : out;
    };
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => incidents.length > 0,
    });
    expect(incidents[0]?.seat).toBe(cheater);
    expect(incidents[0]?.reason).toMatch(/열쇠로 연 카드가 다르다/);
  }, 180_000);

  it("나눠 줄 때 잠글 때와 다른 열쇠를 주면 받은 사람이 열쇠 증명으로 그 자리를 짚는다", async () => {
    const { host, guests, incidents } = await setup(2);
    const cheater = guests[0]?.seat as number;
    const real = Party.prototype.revealKey;
    let lying = true;
    Party.prototype.revealKey = function (this: Party, slot, why) {
      const key = real.call(this, slot, why);
      return lying && this.id === cheater && why === "deal" ? key + 1n : key;
    };
    try {
      void host.start();
      await until(() => incidents.some((i) => i.own && i.seat !== null));
    } finally {
      lying = false;
      Party.prototype.revealKey = real;
    }
    const own = incidents.find((i) => i.own && i.seat !== null);
    expect(own?.seat).toBe(cheater);
    expect(own?.reason).toMatch(/열쇠 증명 실패/);
  }, 180_000);

  it("방장이 더미를 순서와 다르게 열라고 하면 참가자가 방장을 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    await until(() => guests[0]?.match !== null, "첫 화면");
    const seat = guests[0]?.fair as Seat;
    const ctx = seat.coordinator.ctxOf(1);
    if (!ctx) throw new Error("판이 없다");
    // 방장 프로그램: 더미 맨 위가 아니라 다섯째 자리를 모두에게 열라고 한다(미리 보기).
    (host as unknown as { send(m: unknown): void }).send({
      t: "fp",
      k: "deck",
      deal: ctx.dealId,
      slot: ctx.layout.deck[4],
      to: -1,
    });
    await until(() => incidents.some((i) => i.own), "참가자 알림");
    const own = incidents.find((i) => i.own);
    expect(own?.seat).toBe(0);
    expect(own?.reason).toMatch(/더미를 순서와 다르게/);
  }, 180_000);

  it("방장이 자기 차례에 카드를 내기 전에 뒤집을 카드를 열라고 하면 참가자가 방장을 짚는다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const mine = () => {
      const v = match.current() as MinhwatuView;
      return v.phase === "play" && v.turn === 0 && v.decision !== null;
    };
    // 방장 차례가 올 때까지 친다(방장 자리는 두지 않는다).
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: mine,
      skipHost: true,
    });
    const seat = guests[0]?.fair as Seat;
    await until(
      () =>
        (guests[0]?.match?.current() as MinhwatuView | undefined)?.turn === 0,
      "참가자 화면에 방장 차례",
    );
    const round = (match.current() as MinhwatuView).roundNumber;
    const ctx = seat.coordinator.ctxOf(round);
    if (!ctx) throw new Error("판이 없다");
    // 방장 프로그램: 카드를 내기 전에 더미 맨 위를 모두에게 열라고 한다(순서는 맞다).
    (host as unknown as { send(m: unknown): void }).send({
      t: "fp",
      k: "deck",
      deal: ctx.dealId,
      slot: ctx.layout.deck[ctx.deckNext],
      to: -1,
    });
    await until(() => incidents.some((i) => i.own), "참가자 알림");
    const own = incidents.find((i) => i.own);
    expect(own?.seat).toBe(0);
    expect(own?.reason).toMatch(/미리 보기/);
  }, 180_000);

  it("방장 엔진 상태에는 판이 끝나기 전까지 참가자 손패의 진짜 카드가 없다", async () => {
    const { host, guests, incidents } = await setup(1);
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    const seen = new Set<string>();
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(host) !== "play" && phase(host) !== "pick",
      check: () => {
        const gv = guests[0]?.match?.current() as MinhwatuView | undefined;
        const raw = match.rawState() as MinhwatuState;
        if (!gv || gv.roundNumber !== raw.roundNumber) return;
        // 참가자 손에 아직 있는 카드는 방장 엔진 어디에도 없다(바닥·먹은 패·더미·손패).
        const text = JSON.stringify(raw);
        for (const card of gv.hand) {
          seen.add(card);
          expect(text).not.toContain(`"${card}"`);
        }
      },
    });
    expect(seen.size).toBeGreaterThan(0);
  }, 180_000);
});
