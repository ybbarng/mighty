import { ManualClock } from "@mighty/fair-play";
import {
  CHECK_LINK_REQUESTER,
  DEFAULT_WEBAUTHN_POLICY,
  type EntrantSigner,
  encodeClaim,
  encodeInvite,
  generateSigner,
  makeChallengeClaim,
  makeTicket,
  newInviteToken,
  powTargetForTries,
  sasChallenge,
  signInvite,
  softPasskeySigner,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { Checker, type CheckSession, memoryCheckStore } from "./checks";
import { myTicketFor, prepareAnswer } from "./confirm";
import {
  CONFIRM_ANSWER_TTL_MS,
  type ConfirmOutcome,
  INVITE_TTL_MS,
  LocalConfirmRelay,
  OPEN_INVITES_PER_TICKET,
  type RelayStore,
  USED_LINK,
} from "./confirm-relay";
import { PRACTICE_POW } from "./local-ledger";

/** 흉내 패스키(UP·UV 켬). 장부는 패스키 모양 서명만 받는다 */
const passkey = async () => softPasskeySigner(await generateSigner());

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
  signer: EntrantSigner,
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
  // 확인하는 사람의 탭과 당첨자의 탭
  const checkerRelay = new LocalConfirmRelay(clock, shared.tab());
  const winnerRelay = new LocalConfirmRelay(clock, shared.tab());
  const store = memoryCheckStore();
  const checker = new Checker(checkerRelay, store, clock, policy);
  const ticketOfLedger = (_round: number, idHex: string) =>
    ledgerTickets.find((t) => toHex(ticketId(t)) === idHex);
  return { clock, checker, winnerRelay, ticketOfLedger };
}

/** 당첨자 기기: 응모권 열쇠로 서명해 확인 링크를 만든다 */
async function makeLink(
  s: ReturnType<typeof setup>,
  signer: EntrantSigner,
  ticket: Ticket,
) {
  const token = newInviteToken();
  await s.winnerRelay.invite(
    encodeInvite(await signInvite(signer, ticket, token)),
  );
  return token;
}

/** 확인하는 사람: 링크로 확인을 시작하고 응답을 지켜본다 */
async function startAndWatch(s: ReturnType<typeof setup>, token: string) {
  const session = await s.checker.start(token, 1);
  const updates: CheckSession[] = [];
  s.checker.watch(session, s.ticketOfLedger, (b) => updates.push(b));
  return { session, updates };
}

/** 당첨자 기기: 내 응모권에 온 요청을 찾아 서명하고, 별 세 개를 얻는다 */
async function winnerAnswers(
  s: ReturnType<typeof setup>,
  signer: EntrantSigner,
  ticket: Ticket,
) {
  const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
  if (!open) throw new Error("요청을 찾지 못했다");
  expect(open.request.requester).toBe(CHECK_LINK_REQUESTER);
  const mine = myTicketFor(open.request, [ticket]);
  if (!mine) throw new Error("내 응모권을 찾지 못했다");
  const outcomes: ConfirmOutcome[] = [];
  s.winnerRelay.onOutcome(open.id, (o) => outcomes.push(o));
  const { answer, stars } = await prepareAnswer(signer, mine, open);
  await s.winnerRelay.answer(open.id, answer);
  return { stars, outcomes };
}

describe("확인 링크", () => {
  it("열어 보면 회차·응모권이 보이고, 「확인 시작」하면 쓰여 닫힌다", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 12);
    const s = setup([ticket]);
    const token = await makeLink(s, me, ticket);
    expect(await s.checker.byLink(token)).toBeNull();
    const peek = await s.winnerRelay.peek(token);
    expect(peek).toMatchObject({ state: "open", round: 12 });
    const { session } = await startAndWatch(s, token);
    expect(await s.winnerRelay.peek(token)).toEqual({ state: "used" });
    // 같은 기기에서 다시 열면 이어서 확인한다
    expect((await s.checker.byLink(token))?.key).toBe(session.key);
    expect((await s.checker.start(token, 1)).key).toBe(session.key);
    // 다른 기기에서 열면 이미 사용된 링크
    const other = new Checker(
      s.winnerRelay,
      memoryCheckStore(),
      s.clock,
      policy,
    );
    await expect(other.start(token, 1)).rejects.toThrow(USED_LINK);
  });

  it("없는 링크·7일 지난 링크는 missing, 열린 링크는 응모권마다 상한", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 13);
    const s = setup([ticket]);
    expect(await s.winnerRelay.peek(newInviteToken())).toEqual({
      state: "missing",
    });
    const token = await makeLink(s, me, ticket);
    for (let i = 1; i < OPEN_INVITES_PER_TICKET; i++)
      await makeLink(s, me, ticket);
    await expect(makeLink(s, me, ticket)).rejects.toThrow("먼저 보내");
    s.clock.advance(INVITE_TTL_MS);
    expect(await s.winnerRelay.peek(token)).toEqual({ state: "missing" });
    await makeLink(s, me, ticket);
  });
});

describe("당첨자 확인: 별 세 개", () => {
  it("서명이 맞고 상대가 보낸 별 세 개가 맞으면 초록불, 당첨자도 결과를 본다", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 12);
    const s = setup([ticket]);
    const { session } = await startAndWatch(s, await makeLink(s, me, ticket));
    const { stars, outcomes } = await winnerAnswers(s, me, ticket);
    await expect.poll(() => session.status).toBe("signed");
    // 확인하는 사람은 별을 모른 채, 상대가 보낸 별을 누른다
    expect(await s.checker.enterStars(session, stars)).toEqual({
      kind: "confirmed",
    });
    await expect.poll(() => outcomes).toEqual([{ ok: true }]);
    const done = (await s.checker.confirmed()).get(toHex(ticketId(ticket)));
    expect(done?.confirmedAt).toBe(s.clock.now());
  });

  it("별 세 개를 세 번 틀리면 닫고 당첨자에게 알린다", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 3);
    const s = setup([ticket]);
    const { session } = await startAndWatch(s, await makeLink(s, me, ticket));
    const { stars, outcomes } = await winnerAnswers(s, me, ticket);
    await expect.poll(() => session.status).toBe("signed");
    const wrong = [...stars].reverse();
    expect(await s.checker.enterStars(session, wrong)).toEqual({
      kind: "wrong",
      left: 2,
    });
    await s.checker.enterStars(session, wrong);
    expect(await s.checker.enterStars(session, wrong)).toEqual({
      kind: "closed",
    });
    expect(await s.checker.enterStars(session, stars)).toEqual({
      kind: "closed",
    });
    expect(session.status).toBe("failed");
    await expect.poll(() => outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ ok: false });
  });

  it("남의 당첨 응모권에 내 열쇠로 서명하면 빨간불과 이유", async () => {
    const owner = await passkey();
    const other = await passkey();
    const ticket = await ticketOf(owner, 4);
    const s = setup([ticket]);
    const { session } = await startAndWatch(
      s,
      await makeLink(s, owner, ticket),
    );
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    const winnerKey = (await passkey()).publicKey;
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
    await expect.poll(() => session.status).toBe("failed");
    expect(session.reasons).toContain("그 응모권을 낸 열쇠의 서명이 아닙니다");
  });

  it("거절하면 거절로 남는다", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 5);
    const s = setup([ticket]);
    const { session } = await startAndWatch(s, await makeLink(s, me, ticket));
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    await s.winnerRelay.answer(open.id, { declined: true });
    await expect.poll(() => session.status).toBe("declined");
  });

  it("당첨자는 24시간 안에 답해야 하고, 요청은 한 번만 답할 수 있다", async () => {
    const me = await passkey();
    const ticket = await ticketOf(me, 6);
    const s = setup([ticket]);
    await startAndWatch(s, await makeLink(s, me, ticket));
    const [open] = await s.winnerRelay.openFor([ticketId(ticket)]);
    if (!open) throw new Error("요청을 찾지 못했다");
    await s.winnerRelay.answer(open.id, { declined: true });
    await expect(
      s.winnerRelay.answer(open.id, { declined: true }),
    ).rejects.toThrow("이미 답한");
    await startAndWatch(s, await makeLink(s, me, ticket));
    s.clock.advance(CONFIRM_ANSWER_TTL_MS);
    expect(await s.winnerRelay.openFor([ticketId(ticket)])).toEqual([]);
  });
});
