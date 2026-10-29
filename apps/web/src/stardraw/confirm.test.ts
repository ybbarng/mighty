import { ManualClock } from "@mighty/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  encodeClaim,
  generateSigner,
  makeChallengeClaim,
  makeTicket,
  powTargetForTries,
  type Signer,
  type Ticket,
  ticketId,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { checkAnswer, checkClaim, myTicketFor, signAnswer } from "./confirm";
import {
  CONFIRM_TTL_MS,
  type ConfirmOutcome,
  LocalConfirmRelay,
  type RelayStore,
} from "./confirm-relay";
import { PRACTICE_POW } from "./local-ledger";

/** 두 탭이 같은 localStorage를 보는 것처럼: 한쪽이 쓰면 다른 쪽에 알린다 */
function sharedStore() {
  const data = new Map<string, string>();
  const subscribers = new Set<(key: string) => void>();
  const tab = (): RelayStore => ({
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      data.set(k, v);
      for (const s of subscribers) s(k);
    },
    keys: () => [...data.keys()],
    subscribe: (l) => {
      subscribers.add(l);
      return () => subscribers.delete(l);
    },
  });
  return { tab };
}

async function ticketOf(signer: Signer, round: number): Promise<Ticket> {
  const t = await makeTicket(
    signer,
    round,
    [1, 7, 14, 22, 33, 45],
    new Uint8Array(32),
    powTargetForTries(1),
    { params: PRACTICE_POW },
  );
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

function setup() {
  const clock = new ManualClock();
  const shared = sharedStore();
  // 확인하는 분의 탭과 당첨자의 탭
  const checker = new LocalConfirmRelay(clock, shared.tab());
  const winner = new LocalConfirmRelay(clock, shared.tab());
  return { clock, checker, winner };
}

const policy = DEFAULT_WEBAUTHN_POLICY;

describe("당첨자 확인: 전달", () => {
  it("당첨자 기기는 내 응모권에 온 요청만 찾는다", async () => {
    const { checker, winner } = setup();
    const me = await generateSigner();
    const mine = await ticketOf(me, 12);
    const other = await ticketOf(await generateSigner(), 12);
    await checker.create(12, ticketId(other), "Brice");
    const opened = await checker.create(12, ticketId(mine), "Brice");
    const found = await winner.openFor([ticketId(mine)]);
    expect(found.map((r) => r.id)).toEqual([opened.id]);
    expect(found[0]?.request.requester).toBe("Brice");
  });

  it("요청은 한 번만, 10분 동안만 답할 수 있다", async () => {
    const { clock, checker, winner } = setup();
    const me = await generateSigner();
    const ticket = await ticketOf(me, 1);
    const once = await checker.create(1, ticketId(ticket), "Brice");
    await winner.answer(once.id, { declined: true });
    await expect(winner.answer(once.id, { declined: true })).rejects.toThrow(
      "이미 답한",
    );
    expect(await winner.openFor([ticketId(ticket)])).toEqual([]);

    const late = await checker.create(1, ticketId(ticket), "Brice");
    clock.advance(CONFIRM_TTL_MS);
    expect(await winner.openFor([ticketId(ticket)])).toEqual([]);
    await expect(winner.answer(late.id, { declined: true })).rejects.toThrow(
      "시간이 지났습니다",
    );
  });
});

describe("당첨자 확인: 검사", () => {
  it("서명하면 확인하는 분은 초록불, 당첨자는 그 결과를 본다", async () => {
    const { checker, winner } = setup();
    const me = await generateSigner();
    const ticket = await ticketOf(me, 12);
    const opened = await checker.create(12, ticketId(ticket), "Brice");

    const seen: ConfirmOutcome[] = [];
    checker.onAnswer(opened.id, async (answer) => {
      await checker.report(
        opened.id,
        await checkAnswer(answer, opened.request, ticket, policy),
      );
    });

    const [found] = await winner.openFor([ticketId(ticket)]);
    if (!found) throw new Error("요청을 찾지 못했다");
    winner.onOutcome(found.id, (o) => seen.push(o));
    const mine = myTicketFor(found.request, [ticket]);
    if (!mine) throw new Error("내 응모권을 찾지 못했다");
    await winner.answer(found.id, {
      claim: await signAnswer(me, mine, found.request),
    });
    await expect.poll(() => seen).toEqual([{ ok: true }]);
  });

  it("거절하면 확인하는 분에게 거절로 알린다", async () => {
    const { checker, winner } = setup();
    const ticket = await ticketOf(await generateSigner(), 4);
    const opened = await checker.create(4, ticketId(ticket), "Brice");
    const answers: unknown[] = [];
    checker.onAnswer(opened.id, (a) => answers.push(a));
    await winner.answer(opened.id, { declined: true });
    expect(
      await checkAnswer({ declined: true }, opened.request, ticket, policy),
    ).toEqual({ declined: true });
    expect(answers).toEqual([{ declined: true }]);
  });

  it("남의 당첨 응모권에 내 열쇠로 서명하면 빨간불과 이유", async () => {
    const { checker } = setup();
    const owner = await generateSigner();
    const other = await generateSigner();
    const ticket = await ticketOf(owner, 3);
    const opened = await checker.create(3, ticketId(ticket), "Brice");
    const claim = encodeClaim(
      await makeChallengeClaim(
        other,
        ticket,
        opened.request.challenge,
        opened.request.requester,
      ),
    );
    expect(await checkClaim(claim, opened.request, ticket, policy)).toEqual({
      ok: false,
      reasons: expect.arrayContaining([
        "그 응모권을 낸 열쇠의 서명이 아닙니다",
      ]),
    });
  });

  it("다른 요청이나 다른 응모권에 대한 서명이면 그렇다고 알려 준다", async () => {
    const { checker } = setup();
    const me = await generateSigner();
    const a = await ticketOf(me, 5);
    const b = await ticketOf(me, 6);
    const forA = await checker.create(5, ticketId(a), "Brice");
    const forB = await checker.create(6, ticketId(b), "Brice");
    const claimB = await signAnswer(me, b, forB.request);
    expect(await checkClaim(claimB, forA.request, a, policy)).toEqual({
      ok: false,
      reasons: expect.arrayContaining([
        "다른 응모권의 서명입니다",
        "이 확인 요청에 대한 서명이 아닙니다",
      ]),
    });
    expect(await checkClaim("엉뚱한 글", forA.request, a, policy)).toEqual({
      ok: false,
      reasons: ["서명을 읽을 수 없습니다"],
    });
  });

  it("이 기기에 없는 응모권 요청이면 내 응모권을 찾지 못한다", async () => {
    const { checker } = setup();
    const ticket = await ticketOf(await generateSigner(), 2);
    const opened = await checker.create(2, ticketId(ticket), "Brice");
    expect(myTicketFor(opened.request, [])).toBeNull();
  });
});
