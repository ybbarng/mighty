import { join } from "node:path";
import {
  CHECK_LINK_REQUESTER,
  decodeConfirmRequest,
  encodeClaim,
  encodeInvite,
  fromBase64Url,
  generateSasKey,
  makeChallengeClaim,
  newInviteToken,
  sasChallenge,
  sasSecret,
  sasStars,
  signInvite,
  type Ticket,
  ticketId,
  toBase64Url,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { EntryError } from "./engine";
import { INVITE_TTL_MS, type RelayLimits } from "./relay";
import { Store } from "./store";
import {
  drawOf,
  EPOCH,
  enter,
  makeRig,
  type Player,
  player,
  type Rig,
} from "./testing";

let rig: Rig;
afterEach(() => rig?.close());

const DAY = 24 * 60 * 60 * 1000;

/** 1회차를 돌려 winner는 1등, loser는 낙첨으로 만든다 */
async function setup(relay?: Partial<RelayLimits>) {
  rig = await makeRig(relay ? { relay } : {});
  const [winner, loser] = await Promise.all([player(), player()]);
  await rig.at(EPOCH + 10);
  const won = await enter(rig, winner, drawOf(1).numbers);
  const lost = await enter(rig, loser, [40, 41, 42, 43, 44, 45]);
  await rig.finish(1);
  return { winner, won: won.ticket, loser, lost: lost.ticket };
}

/** 당첨자 기기: 확인 링크를 만든다(화면 invites.ts와 같다) */
async function invite(p: Player, ticket: Ticket, ip?: string) {
  const token = newInviteToken();
  const signed = await signInvite(p.signer, ticket, token);
  await rig.relay.createInvite({
    invite: encodeInvite(signed),
    ...(ip ? { ip } : {}),
  });
  return token;
}

/** 확인하는 사람 기기: 링크를 열어 「확인 시작」 */
async function start(token: string, ip?: string) {
  const checker = await generateSasKey();
  const created = await rig.relay.start({
    token,
    checkerKey: toBase64Url(checker.publicKey),
    ...(ip ? { ip } : {}),
  });
  return { checker, created };
}

/** 당첨자 기기: 요청에 서명하고 임시 공개 열쇠를 낸다(화면 confirm.ts의 prepareAnswer와 같다) */
async function answerAs(
  p: Player,
  ticket: Ticket,
  open: { id: string; request: string; checkerKey: string },
) {
  const request = decodeConfirmRequest(open.request);
  const mine = await generateSasKey();
  const claim = await makeChallengeClaim(
    p.signer,
    ticket,
    sasChallenge(
      request.challenge,
      fromBase64Url(open.checkerKey),
      mine.publicKey,
    ),
    request.requester,
  );
  const stars = sasStars(
    await sasSecret(mine.privateKey, fromBase64Url(open.checkerKey)),
    open.id,
  );
  return {
    answer: {
      claim: encodeClaim(claim),
      winnerKey: toBase64Url(mine.publicKey),
    },
    stars,
  };
}

const rejects = async (fn: () => unknown, status: number) => {
  let err: unknown = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(EntryError);
  expect((err as EntryError).status).toBe(status);
};

describe("확인 링크 초대", () => {
  it("응모권 주인만 링크를 만든다: 낙첨 응모권·남의 서명은 거절", async () => {
    const { winner, won, loser, lost } = await setup();
    await rejects(() => invite(loser, lost), 404);
    // 낙첨자가 남의 당첨 응모권으로 링크를 만들려 한다
    await rejects(() => invite(loser, won), 403);
    const token = await invite(winner, won);
    expect(rig.relay.peek(token)).toEqual({
      state: "open",
      round: 1,
      ticketId: toBase64Url(ticketId(won)),
      expiresAt: rig.clock.now() + INVITE_TTL_MS,
    });
  });

  it("같은 서명을 다시 올리면 거절(409), 열린 링크는 응모권마다 상한", async () => {
    const { winner, won } = await setup({ openInvitesPerTicket: 2 });
    const signed = encodeInvite(
      await signInvite(winner.signer, won, newInviteToken()),
    );
    await rig.relay.createInvite({ invite: signed });
    await rejects(() => rig.relay.createInvite({ invite: signed }), 409);
    const second = await invite(winner, won);
    await rejects(() => invite(winner, won), 429);
    // 하나가 쓰이면 다시 만들 수 있다
    await start(second);
    await invite(winner, won);
  });

  it("링크는 7일 뒤 닫힌다", async () => {
    const { winner, won } = await setup();
    const token = await invite(winner, won);
    rig.clock.advance(INVITE_TTL_MS);
    await rejects(() => rig.relay.peek(token), 404);
    await rejects(() => start(token), 404);
  });
});

describe("링크로 하는 당첨자 확인", () => {
  it("링크 열기 → 확인 시작 → 당첨자 기기가 찾음 → 서명 응답 → 결과. 별 세 개는 양쪽이 같고 서버는 모른다", async () => {
    const { winner, won } = await setup();
    const token = await invite(winner, won);
    const { checker, created } = await start(token);
    expect(decodeConfirmRequest(created.request).requester).toBe(
      CHECK_LINK_REQUESTER,
    );
    const open = rig.relay.openFor([toBase64Url(ticketId(won))]);
    expect(open.map((o) => o.id)).toEqual([created.id]);
    expect(open[0]?.invitedAt).toBe(created.invitedAt);

    const { answer, stars } = await answerAs(winner, won, created);
    await rig.relay.answer(created.id, answer);
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toEqual([]);

    const got = rig.relay.get(created.id);
    expect(got.answer).toEqual(answer);
    const checkerStars = sasStars(
      await sasSecret(checker.privateKey, fromBase64Url(answer.winnerKey)),
      created.id,
    );
    expect(checkerStars).toEqual(stars);

    await rejects(
      () => rig.relay.report(created.id, "남의 열쇠", { ok: true }),
      403,
    );
    rig.relay.report(created.id, created.reportKey, { ok: true });
    expect(rig.relay.get(created.id).outcome).toEqual({ ok: true });
  });

  it("링크는 한 번만: 두 번째로 열면 '이미 사용된 링크'(409)", async () => {
    const { winner, won } = await setup();
    const token = await invite(winner, won);
    await start(token);
    expect(rig.relay.peek(token)).toEqual({ state: "used" });
    await rejects(() => start(token), 409);
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toHaveLength(1);
  });

  it("남의 열쇠 서명이나 엉터리 응답은 받지 않고, 진짜 당첨자는 여전히 답할 수 있다", async () => {
    const { winner, won, loser } = await setup();
    const { created } = await start(await invite(winner, won));
    // 낙첨자(가짜 당첨자)가 자기 열쇠로 서명해 먼저 답하려 한다
    const fake = await answerAs(
      loser,
      { ...won, pub: loser.signer.publicKey },
      created,
    );
    await rejects(() => rig.relay.answer(created.id, fake.answer), 403);
    await rejects(
      () => rig.relay.answer(created.id, { claim: "엉터리", winnerKey: "AA" }),
      403,
    );
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toHaveLength(1);
    const { answer } = await answerAs(winner, won, created);
    await rig.relay.answer(created.id, answer);
  });

  it("24시간 안에 답하지 않으면 요청이 닫히고, 7일 뒤에는 지워진다", async () => {
    const { winner, won } = await setup();
    const { created } = await start(await invite(winner, won));
    rig.clock.advance(DAY);
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toEqual([]);
    const { answer } = await answerAs(winner, won, created);
    await rejects(() => rig.relay.answer(created.id, answer), 410);
    rig.clock.advance(6 * DAY);
    await rejects(() => rig.relay.get(created.id), 404);
  });
});

describe("장난 막기", () => {
  it("IP 앞부분마다 하루 링크 만들기 상한: 같은 /24는 함께 세고, 다른 곳·다음 날은 따로", async () => {
    const { winner, won } = await setup({
      invitesPerPrefixPerDay: 2,
      openInvitesPerTicket: 99,
    });
    await invite(winner, won, "203.0.113.5");
    await invite(winner, won, "203.0.113.77");
    await rejects(() => invite(winner, won, "203.0.113.9"), 429);
    await invite(winner, won, "198.51.100.1");
    rig.clock.advance(DAY);
    await invite(winner, won, "203.0.113.5");
  });

  it("없는 링크를 여러 번 열면 그 곳은 하루 동안 막힌다(토큰 맞히기)", async () => {
    const { winner, won } = await setup({ badLinksPerPrefixPerDay: 2 });
    const real = await invite(winner, won);
    await rejects(() => rig.relay.peek(newInviteToken(), "203.0.113.5"), 404);
    await rejects(() => rig.relay.peek("엉터리", "203.0.113.6"), 404);
    await rejects(() => rig.relay.peek(real, "203.0.113.7"), 429);
    expect(rig.relay.peek(real, "198.51.100.1").state).toBe("open");
  });
});

describe("저장소 옮기기", () => {
  it("확인 링크로 바꾸기 전의 요청 행은 처음 한 번 버리고, 그 뒤 요청은 남긴다", async () => {
    rig = await makeRig();
    const path = join(rig.dir, "stardraw.sqlite");
    const row = {
      id: "0".repeat(24),
      ticketHex: "ab".repeat(32),
      payload: "{}",
      answerBy: 1,
      keepUntil: Number.MAX_SAFE_INTEGER,
    };
    // 옮기기 전 데이터베이스 흉내: 표시를 지우고 옛 행을 넣는다
    rig.store.db.exec("DELETE FROM meta WHERE k = 'relay-invites'");
    rig.store.relayPut(row);
    const moved = new Store(path);
    expect(moved.relayGet(row.id)).toBeNull();
    moved.relayPut(row);
    moved.close();
    const again = new Store(path);
    expect(again.relayGet(row.id)).not.toBeNull();
    again.close();
  });
});

describe("허락 없이 확인을 막지 못한다(2026-10-31 보안 검토 B2)", () => {
  it("당첨 응모권 id만 아는 사람이 서명 없는 거절·가짜 응답을 올려도 진짜 승인이 통과한다", async () => {
    rig = await makeRig({});
    const winner = await player();
    await rig.at(EPOCH + 10);
    const won = (await enter(rig, winner, drawOf(1).numbers)).ticket;
    await rig.finish(1);
    const token = newInviteToken();
    await rig.relay.createInvite({
      invite: encodeInvite(await signInvite(winner.signer, won, token)),
    });
    const checker = await generateSasKey();
    await rig.relay.start({
      token,
      checkerKey: toBase64Url(checker.publicKey),
    });
    const open = rig.relay.openFor([toBase64Url(ticketId(won))]);
    const id = open[0]?.id as string;
    // 서명 없는 거절(예전 형식)과 아무 값이나 넣은 응답은 거절된다
    await expect(
      rig.relay.answer(id, { declined: true } as never),
    ).rejects.toBeInstanceOf(EntryError);
    await expect(
      rig.relay.answer(id, { claim: "AAAA", winnerKey: "AAAA" }),
    ).rejects.toBeInstanceOf(EntryError);
    // 진짜 당첨자의 승인은 그대로 받는다
    const req = decodeConfirmRequest(open[0]?.request as string);
    const mine = await generateSasKey();
    const claim = await makeChallengeClaim(
      winner.signer,
      won,
      sasChallenge(
        req.challenge,
        fromBase64Url(open[0]?.checkerKey as string),
        mine.publicKey,
      ),
      req.requester,
    );
    await rig.relay.answer(id, {
      claim: encodeClaim(claim),
      winnerKey: toBase64Url(mine.publicKey),
    });
    expect(rig.relay.get(id).answer).toMatchObject({
      winnerKey: toBase64Url(mine.publicKey),
    });
  });
});
