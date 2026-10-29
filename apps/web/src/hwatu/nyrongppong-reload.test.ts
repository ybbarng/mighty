// @vitest-environment node
/**
 * 나이롱뽕 암호화방 새로고침 시험: 참가자·방장이 판 중간에 새로고침해도 이어 치고 모두의 검증을 통과한다.
 * 나이롱뽕은 가져온 카드를 그 사람만 알아 새로고침 뒤 되살리는 것이 많다. 다른 시험과 떨어져 혼자 돌게
 * 따로 둔다(같은 파일의 앞 시험이 남긴 계산과 겹치면 느려진다)
 */
import {
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "@mighty/nyrongppong-ai";
import { STANDARD_RULES as NYRONGPPONG_RULES } from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { nyrongppongKit } from "@/nyrongppong/kit";
import { ONLINE_CALL_SECONDS, onlineRules } from "@/nyrongppong/settings";

import {
  type AnyGuest,
  type AnyHost,
  hwatuHostOptions,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

describe("화투 암호화방: 나이롱뽕(가져온 카드는 그 사람만) 새로고침", () => {
  it("참가자와 방장이 한 번씩 새로고침해도 이어 치고, 모두의 검증을 통과한다", async () => {
    // 나눠 받은 패에 따라 판이 새로고침할 지점(참가자 4수, 방장 8수)보다 일찍 끝날 수 있다. 패는 기기마다 섞어
    // 정해지므로 미리 고를 수 없어, 그런 판이면 새 방으로 다시 한다(시간을 기다리는 것이 아니라 조건을 갖추는 것)
    for (let attempt = 0; attempt < 10; attempt++)
      if (await nyrongppongReloadScenario()) return;
    throw new Error("새로고침할 지점까지 가는 판을 만들지 못했다");
  });
});

/**
 * 참가자 새로고침 → 방장 새로고침(참가자 행동이 끊긴 사이에 나감) → 판 끝·게임 끝 검증.
 * 판이 새로고침할 지점보다 일찍 끝나면 false
 */
async function nyrongppongReloadScenario(): Promise<boolean> {
  // 새로고침·재연결 진행 논리만 본다: 가장 가벼운 설정(두 사람, 한 판, 군 r255)에서 참가자·방장 새로고침과
  // 그 뒤 판 끝·게임 끝 검증까지. 나누고 섞는 일이 사람 수·판 수만큼 늘어 무거운 설정은 같은 논리를 느리게 되풀이할 뿐이다
  const rules = onlineRules({
    ...NYRONGPPONG_RULES,
    players: 2,
    rounds: 1,
  });
  const options = {
    kit: nyrongppongKit,
    rules,
    bot: nyrongppongIntermediateBot,
    botLevel: 1,
  };
  const { net, clock, host, guests, incidents, audits, store } =
    await setupHwatu({
      ...options,
      guests: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
      hostStore: true,
    });
  let current = host;
  const tick = () => {
    const raw = current.match?.rawState() as { phase?: string } | undefined;
    if (raw?.phase !== "call") return;
    const devices = [
      current.fair?.device,
      ...guests.map((g) => g.fair?.device),
    ];
    if (devices.some((d) => d?.busy())) return;
    const views = [
      current.match?.current(),
      ...guests.map((g) => g.match?.current()),
    ];
    if (views.some((v) => (v as { decision?: unknown })?.decision)) return;
    clock.advance(ONLINE_CALL_SECONDS * 1000 + 1);
  };
  await host.start();
  const play = (done: () => boolean) =>
    playHwatu({
      host: current,
      guests,
      bot: nyrongppongBeginnerBot,
      incidents,
      tick,
      done,
    });
  const over = () =>
    (current.match?.current() as { phase?: string } | undefined)?.phase ===
    "gameOver";
  // 참가자 새로고침
  await play(() => (current.match?.actionLog().length ?? 0) >= 4 || over());
  expect(incidents).toEqual([]);
  if (over()) return false;
  const old = guests[0] as AnyGuest;
  net.disconnect("g0");
  old.leave();
  const fresh = new GuestRoom({
    kit: nyrongppongKit,
    transport: net.join("g0-reloaded"),
    name: "손님0",
    token: old.token,
    secret: old.secret,
    fairStore: (old as unknown as { fairStore: never }).fairStore,
    clock,
  });
  fresh.on("incident", (n) => incidents.push(n as never));
  // 새로고침 전 참가자 객체의 알림(방장이 기록 없이 나갔다)은 보지 않는다.
  const freshAudits: typeof audits = [];
  fresh.on("audit", (r) => freshAudits.push(r));
  guests[0] = fresh as never;
  await until(
    () => (fresh.match?.current().hand.length ?? 0) > 0,
    "새로고침한 참가자 화면",
  );
  // 방장 새로고침: 참가자 차례가 온 때 끊고, 방장 연결이 없는 사이에 참가자가 행동을 낸다.
  // 그 행동은 어디에도 가지 않았다. 새로고침한 참가자의 보낸 행동 목록은 새로고침 뒤 것뿐이라
  // 기록 수(`mine`)로는 잃은 것을 알 수 없어, "못 보냈다" 표시로 다시 보내야 한다(예전에 30번에 1번 멈춤).
  const guestView = () =>
    fresh.match?.current() as { decision?: unknown } | undefined;
  await play(
    () =>
      ((current.match?.actionLog().length ?? 0) >= 8 &&
        !!guestView()?.decision) ||
      over(),
  );
  expect(incidents).toEqual([]);
  if (over()) return false;
  const states: string[] = [];
  fresh.on("connection", (s) => states.push(s as string));
  net.disconnect("host");
  await until(() => states.includes("reconnecting"), "방장 끊김");
  // 끊기기 직전 오가던 메시지로 차례가 이미 넘어갔으면 이 판에서는 "끊긴 사이 낸 행동"을 만들 수 없다.
  // 그때는 그 확인만 건너뛰고 새로고침 확인은 그대로 한다.
  const pendingView = guestView();
  const offline = !!pendingView?.decision;
  if (offline)
    expect(
      fresh.match?.submit(
        nyrongppongBeginnerBot.decide(pendingView as never, { seed: 99 }),
      ),
    ).toEqual({ ok: true });
  const mineBefore = (current.match?.actionLog() ?? []).filter(
    (e) => e.seat === fresh.seat,
  ).length;
  const restore = store?.load();
  current = new HostRoom({
    transport: net.join("host1"),
    ...hwatuHostOptions({ ...options, clock, ...(store ? { store } : {}) }),
    ...(restore ? { restore } : {}),
  } as never) as AnyHost;
  current.onIncident((n) => incidents.push(n));
  await until(
    () => current.lobby().seats.every((s) => s.connected),
    "참가자 다시 연결",
  );
  // 다시 이어지면 참가자 기기가 못 보낸 행동을 다시 보낸다. 방장이 이어 가기를 마치기 전에 닿아 거절되면
  // 화면에 다시 내 차례가 보이니 사람처럼 한 번 더 낸다. 그동안 방장과 컴퓨터도 평소처럼 둔다(판 끝 "계속"은
  // 모두가 눌러야 다음 판으로 넘어가므로, 참가자 것만 기다리면 방장 차례에서 멈춘다).
  if (offline)
    await play(
      () =>
        (current.match?.actionLog() ?? []).filter((e) => e.seat === fresh.seat)
          .length > mineBefore,
    );
  await play(over);
  expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
    [],
  );
  current.finish();
  await until(() => freshAudits.length >= 1, "판 끝 검증");
  expect(freshAudits).toEqual([{ ok: true }]);
  return true;
}
