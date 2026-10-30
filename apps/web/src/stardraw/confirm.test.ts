import { ManualClock } from "@mighty/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  encodeClaim,
  generateSigner,
  makeChallengeClaim,
  makeTicket,
  powTargetForTries,
  type Signer,
  sasChallenge,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { type CheckBatch, Checker, memoryCheckStore } from "./checks";
import { myTicketFor, prepareAnswer } from "./confirm";
import {
  CONFIRM_ANSWER_TTL_MS,
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
    remove: (k) => {
      data.delete(k);
    },
    keys: () => [...data.keys()],
    subscribe: (l) => {
      subscribers.add(l);
      return () => subscribers.delete(l);
    },
  });
  return { tab };
}

async function ticketOf(
  signer: Signer,
  round: number,
  numbers = [1, 7, 14, 22, 33, 45],
): Promise<Ticket> {
  const t = await makeTicket(
    signer,
    round,
    numbers,
    new Uint8Array(32),
    powTargetForTries(1),
    { params: PRACTICE_POW },
  );
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

const policy = DEFAULT_WEBAUTHN_POLICY;

function setup(ledgerTickets: Ticket[]) {
  const clock = new ManualClock();
  const shared = sharedStore();
  // 확인하는 분의 탭과 당첨자들의 탭
  const checkerRelay = new LocalConfirmRelay(clock, shared.tab());
  const winnerRelay = new LocalConfirmRelay(clock, shared.tab());
  const store = memoryCheckStore();
  const checker = new Checker(checkerRelay, store, clock, policy);
  const ticketOfLedger = (_round: number, idHex: string) =>
    ledgerTickets.find((t) => toHex(ticketId(t)) === idHex);
  return { clock, checker, winnerRelay, ticketOfLedger };
}

/** 확인하는 분: 묶음을 보내고 응답을 지켜본다. 응답이 들어올 때마다 갱신된 묶음을 모은다 */
async function startAndWatch(
  s: ReturnType<typeof setup>,
  round: number,
  tickets: Ticket[],
) {
  const batch = await s.checker.start(round, 1, tickets, "Brice");
  const updates: CheckBatch[] = [];
  s.checker.watch(batch, s.ticketOfLedger, (b) => updates.push(b));
  return { batch, updates };
}

/** 당첨자 기기: 내 응모권에 온 요청을 찾아 서명하고, 별 세 개를 얻는다 */
async function winnerAnswers(
  s: ReturnType<typeof setup>,
  signer: Signer,
  ticket: Ticket,
) {
  const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
  if (!open) throw new Error("요청을 찾지 못했다");
  expect(open.request.requester).toBe("Brice");
  const mine = myTicketFor(open.request, [ticket]);
  if (!mine) throw new Error("내 응모권을 찾지 못했다");
  const outcomes: ConfirmOutcome[] = [];
  s.winnerRelay.onOutcome(open.id, (o) => outcomes.push(o));
  const { answer, stars } = await prepareAnswer(signer, mine, open);
  await s.winnerRelay.answer(open.id, answer);
  return { stars, outcomes };
}

describe("당첨자 확인: 별 세 개", () => {
  it("서명이 맞고 상대가 보낸 별 세 개가 맞으면 초록불, 당첨자도 결과를 본다", async () => {
    const me = await generateSigner();
    const ticket = await ticketOf(me, 12);
    const s = setup([ticket]);
    const { batch } = await startAndWatch(s, 12, [ticket]);
    const { stars, outcomes } = await winnerAnswers(s, me, ticket);
    await expect.poll(() => batch.tickets[0]?.status).toBe("signed");
    // 확인하는 분은 별을 모른 채, 상대가 보낸 별을 누른다
    expect(await s.checker.enterStars(batch, stars)).toEqual({
      kind: "confirmed",
      ticketId: toHex(ticketId(ticket)),
      of: 1,
    });
    await expect.poll(() => outcomes).toEqual([{ ok: true }]);
    expect(await s.checker.enterStars(batch, stars)).toMatchObject({
      kind: "already",
    });
  });

  it("한 등수에 당첨 응모권이 둘이면 요청은 묶음 하나, 별은 응모권마다 다르다", async () => {
    const a = await generateSigner();
    const b = await generateSigner();
    const ta = await ticketOf(a, 7);
    const tb = await ticketOf(b, 7);
    const s = setup([ta, tb]);
    const { batch } = await startAndWatch(s, 7, [ta, tb]);
    expect(batch.tickets).toHaveLength(2);
    // 이미 열린 묶음이 있으면 「당첨자 확인」은 그 묶음으로 간다
    expect((await s.checker.start(7, 1, [ta, tb], "Brice")).key).toBe(
      batch.key,
    );
    const ra = await winnerAnswers(s, a, ta);
    const rb = await winnerAnswers(s, b, tb);
    expect(ra.stars).not.toEqual(rb.stars);
    await expect
      .poll(() => batch.tickets.map((t) => t.status))
      .toEqual(["signed", "signed"]);
    const hit = await s.checker.enterStars(batch, rb.stars);
    expect(hit).toEqual({
      kind: "confirmed",
      ticketId: toHex(ticketId(tb)),
      of: 2,
    });
    await expect.poll(() => rb.outcomes).toEqual([{ ok: true }]);
    expect(ra.outcomes).toEqual([]);
  });

  it("별 세 개를 세 번 틀리면 묶음을 닫고 당첨자에게 알린다", async () => {
    const me = await generateSigner();
    const ticket = await ticketOf(me, 3);
    const s = setup([ticket]);
    const { batch } = await startAndWatch(s, 3, [ticket]);
    const { stars, outcomes } = await winnerAnswers(s, me, ticket);
    await expect.poll(() => batch.tickets[0]?.status).toBe("signed");
    const wrong = [...stars].reverse();
    expect(await s.checker.enterStars(batch, wrong)).toEqual({
      kind: "wrong",
      left: 2,
    });
    await s.checker.enterStars(batch, wrong);
    expect(await s.checker.enterStars(batch, wrong)).toEqual({
      kind: "closed",
    });
    expect(await s.checker.enterStars(batch, stars)).toEqual({
      kind: "closed",
    });
    await expect.poll(() => outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ ok: false });
  });

  it("남의 당첨 응모권에 내 열쇠로 서명하면 빨간불과 이유", async () => {
    const owner = await generateSigner();
    const other = await generateSigner();
    const ticket = await ticketOf(owner, 4);
    const s = setup([ticket]);
    const { batch } = await startAndWatch(s, 4, [ticket]);
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    const winnerKey = (await generateSigner()).publicKey;
    const claim = await makeChallengeClaim(
      other,
      ticket,
      sasChallenge(open.request.challenge, open.checkerKey, winnerKey),
      open.request.requester,
    );
    await s.winnerRelay.answer(open.id, {
      claim: encodeClaim(claim),
      winnerKey,
    });
    await expect.poll(() => batch.tickets[0]?.status).toBe("failed");
    expect(batch.tickets[0]?.reasons).toContain(
      "그 응모권을 낸 열쇠의 서명이 아닙니다",
    );
  });

  it("거절하면 거절로 남는다", async () => {
    const ticket = await ticketOf(await generateSigner(), 5);
    const s = setup([ticket]);
    const { batch } = await startAndWatch(s, 5, [ticket]);
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    await s.winnerRelay.answer(open.id, { declined: true });
    await expect.poll(() => batch.tickets[0]?.status).toBe("declined");
  });

  it("당첨자는 24시간 안에 답해야 하고, 요청은 한 번만 답할 수 있다", async () => {
    const me = await generateSigner();
    const ticket = await ticketOf(me, 6);
    const s = setup([ticket]);
    await startAndWatch(s, 6, [ticket]);
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    await s.winnerRelay.answer(open.id, { declined: true });
    await expect(
      s.winnerRelay.answer(open.id, { declined: true }),
    ).rejects.toThrow("이미 답한");
    const other = await ticketOf(me, 8);
    const s2 = setup([other]);
    await startAndWatch(s2, 8, [other]);
    s2.clock.advance(CONFIRM_ANSWER_TTL_MS);
    expect(await s2.winnerRelay.openFor([ticketId(other)])).toEqual([]);
  });
});

describe("이미 확인한 응모권", () => {
  it("확인한 날짜와 함께 남고, 그 응모권만 남은 등수에는 새 요청을 보내지 않는다", async () => {
    const me = await generateSigner();
    const ticket = await ticketOf(me, 9);
    const s = setup([ticket]);
    const { batch } = await startAndWatch(s, 9, [ticket]);
    const { stars } = await winnerAnswers(s, me, ticket);
    await expect.poll(() => batch.tickets[0]?.status).toBe("signed");
    await s.checker.enterStars(batch, stars);
    const done = (await s.checker.confirmed()).get(toHex(ticketId(ticket)));
    expect(done).toMatchObject({ status: "confirmed" });
    expect(done?.confirmedAt).toBe(s.clock.now());
    await expect(s.checker.start(9, 1, [ticket], "Brice")).rejects.toThrow(
      "모두 확인",
    );
  });
});
