import {
  decodeConfirmRequest,
  encodeClaim,
  fromBase64Url,
  generateSasKey,
  makeChallengeClaim,
  sasChallenge,
  sasSecret,
  sasStars,
  type Ticket,
  ticketId,
  toBase64Url,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { EntryError } from "./engine";
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

/** 1회차를 돌려 winner는 1등, loser는 낙첨으로 만든다 */
async function setup() {
  rig = await makeRig();
  const [winner, loser] = await Promise.all([player(), player()]);
  await rig.at(EPOCH + 10);
  const won = await enter(rig, winner, drawOf(1).numbers);
  const lost = await enter(rig, loser, [40, 41, 42, 43, 44, 45]);
  await rig.finish(1);
  return { winner, won: won.ticket, loser, lost: lost.ticket };
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

describe("당첨자 확인 전달", () => {
  it("요청 → 당첨자 기기가 찾음 → 서명 응답 → 확인하는 분이 결과를 올림. 별 세 개는 양쪽이 같고 서버는 모른다", async () => {
    const { winner, won } = await setup();
    const checker = await generateSasKey();
    const created = rig.relay.create({
      round: 1,
      ticketId: toBase64Url(ticketId(won)),
      requester: "Brice",
      checkerKey: toBase64Url(checker.publicKey),
    });
    const open = rig.relay.openFor([toBase64Url(ticketId(won))]);
    expect(open.map((o) => o.id)).toEqual([created.id]);
    expect(decodeConfirmRequest(open[0]?.request as string).requester).toBe(
      "Brice",
    );

    const { answer, stars } = await answerAs(winner, won, created);
    await rig.relay.answer(created.id, answer);
    // 답한 요청은 더 이상 열린 요청이 아니다
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toEqual([]);

    const got = rig.relay.get(created.id);
    expect(got.answer).toEqual(answer);
    const checkerStars = sasStars(
      await sasSecret(checker.privateKey, fromBase64Url(answer.winnerKey)),
      created.id,
    );
    expect(checkerStars).toEqual(stars);

    await rejects(
      () => rig.relay.report(created.id, "남의 표", { ok: true }),
      403,
    );
    rig.relay.report(created.id, created.token, { ok: true });
    expect(rig.relay.get(created.id).outcome).toEqual({ ok: true });
  });

  it("낙첨 응모권에는 요청을 만들 수 없고, 남의 열쇠 서명이나 엉터리 응답은 받지 않는다", async () => {
    const { won, loser, lost } = await setup();
    const checker = await generateSasKey();
    await rejects(
      () =>
        rig.relay.create({
          round: 1,
          ticketId: toBase64Url(ticketId(lost)),
          requester: "Brice",
          checkerKey: toBase64Url(checker.publicKey),
        }),
      404,
    );
    const created = rig.relay.create({
      round: 1,
      ticketId: toBase64Url(ticketId(won)),
      requester: "Brice",
      checkerKey: toBase64Url(checker.publicKey),
    });
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
    // 진짜 당첨자는 여전히 답할 수 있다
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toHaveLength(1);
  });

  it("24시간 안에 답하지 않으면 요청이 닫히고, 7일 뒤에는 지워진다", async () => {
    const { winner, won } = await setup();
    const checker = await generateSasKey();
    const created = rig.relay.create({
      round: 1,
      ticketId: toBase64Url(ticketId(won)),
      requester: "Brice",
      checkerKey: toBase64Url(checker.publicKey),
    });
    rig.clock.advance(24 * 60 * 60 * 1000);
    expect(rig.relay.openFor([toBase64Url(ticketId(won))])).toEqual([]);
    const { answer } = await answerAs(winner, won, created);
    await rejects(() => rig.relay.answer(created.id, answer), 410);
    rig.clock.advance(6 * 24 * 60 * 60 * 1000);
    await rejects(() => rig.relay.get(created.id), 404);
  });
});
