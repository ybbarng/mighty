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

import { checkAnswer, myTicketFor, signAnswer } from "./confirm";
import {
  CONFIRM_TTL_MS,
  type ConfirmOutcome,
  LocalConfirmRelay,
  newConfirmCode,
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

describe("확인 번호", () => {
  it("6자리 숫자, 앞자리 0도 그대로", () => {
    expect(newConfirmCode(() => new Uint8Array([0, 0, 7]))).toBe("000007");
    expect(newConfirmCode()).toMatch(/^\d{6}$/);
  });
});

describe("당첨자 확인: 전달과 검사", () => {
  it("번호로 찾아 서명하면 확인하는 분은 초록불, 당첨자는 그 결과를 본다", async () => {
    const { checker, winner } = setup();
    const me = await generateSigner();
    const ticket = await ticketOf(me, 12);
    const opened = await checker.open(12, ticketId(ticket));

    const outcomes: ConfirmOutcome[] = [];
    const seen: ConfirmOutcome[] = [];
    checker.onAnswer(opened.code, async (claim) => {
      const outcome = await checkAnswer(
        claim,
        opened.request,
        ticket,
        DEFAULT_WEBAUTHN_POLICY,
      );
      outcomes.push(outcome);
      await checker.report(opened.code, outcome);
    });
    winner.onOutcome(opened.code, (o) => seen.push(o));

    const request = await winner.find(opened.code);
    const mine = myTicketFor(request, [ticket]);
    if (!mine) throw new Error("내 응모권을 찾지 못했다");
    await winner.answer(opened.code, await signAnswer(me, mine, request));
    await expect.poll(() => seen).toEqual([{ ok: true }]);
    expect(outcomes).toEqual([{ ok: true }]);
  });

  it("다른 사람의 열쇠로 서명하면 빨간불과 이유", async () => {
    const { checker, winner } = setup();
    const owner = await generateSigner();
    const other = await generateSigner();
    const ticket = await ticketOf(owner, 3);
    const opened = await checker.open(3, ticketId(ticket));
    const request = await winner.find(opened.code);
    // 남의 당첨 응모권을 들고 내 열쇠로 서명해 보아도
    const claim = encodeClaim(
      await makeChallengeClaim(
        other,
        ticket,
        request.challenge,
        request.requester,
      ),
    );
    const outcome = await checkAnswer(
      claim,
      opened.request,
      ticket,
      DEFAULT_WEBAUTHN_POLICY,
    );
    expect(outcome).toEqual({
      ok: false,
      reasons: expect.arrayContaining([
        "그 응모권을 낸 열쇠의 서명이 아닙니다",
      ]),
    });
  });

  it("다른 응모권에 대한 서명이면 그렇다고 알려 준다", async () => {
    const { checker } = setup();
    const me = await generateSigner();
    const a = await ticketOf(me, 5);
    const b = await ticketOf(me, 6);
    const forA = await checker.open(5, ticketId(a));
    const forB = await checker.open(6, ticketId(b));
    const claimB = await signAnswer(me, b, forB.request);
    const outcome = await checkAnswer(
      claimB,
      forA.request,
      a,
      DEFAULT_WEBAUTHN_POLICY,
    );
    expect(outcome).toEqual({
      ok: false,
      reasons: expect.arrayContaining([
        "다른 응모권의 서명입니다",
        "이 확인 번호에 대한 서명이 아닙니다",
      ]),
    });
  });

  it("확인 번호는 한 번만, 10분 동안만 쓸 수 있다", async () => {
    const { clock, checker, winner } = setup();
    const me = await generateSigner();
    const ticket = await ticketOf(me, 1);
    const once = await checker.open(1, ticketId(ticket));
    const request = await winner.find(once.code);
    await winner.answer(once.code, await signAnswer(me, ticket, request));
    await expect(winner.find(once.code)).rejects.toThrow("이미 쓴 확인 번호");

    const late = await checker.open(1, ticketId(ticket));
    clock.advance(CONFIRM_TTL_MS);
    await expect(winner.find(late.code)).rejects.toThrow("시간이 지났습니다");
    await expect(winner.find("999999x")).rejects.toThrow();
  });

  it("이 기기에 없는 응모권이면 찾지 못한다", async () => {
    const { checker, winner } = setup();
    const me = await generateSigner();
    const ticket = await ticketOf(me, 2);
    const opened = await checker.open(2, ticketId(ticket));
    const request = await winner.find(opened.code);
    expect(myTicketFor(request, [])).toBeNull();
  });
});
