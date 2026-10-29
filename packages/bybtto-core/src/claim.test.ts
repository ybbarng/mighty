import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "./bytes";
import {
  CLAIM_PREFIX,
  decodeClaim,
  encodeClaim,
  makeChallengeClaim,
  makeDirectClaim,
  newChallengeText,
  verifyClaim,
} from "./claim";
import type { Signer } from "./keys";
import {
  decodeReceipt,
  encodeReceipt,
  receiptInTime,
  signReceipt,
  verifyReceipt,
} from "./receipt";
import { genesisHash } from "./record";
import { roundTimes } from "./schedule";
import { HOURLY, signers, ticketFor } from "./testing";
import { ticketId } from "./ticket";

async function winnerAndTicket() {
  const [winner, other] = (await signers(2)) as [Signer, Signer];
  const ticket = await ticketFor(
    winner,
    1,
    [3, 11, 19, 27, 38, 44],
    genesisHash(HOURLY),
  );
  return { winner, other, ticket };
}

describe("바로 보내는 당첨 증명", () => {
  it("받는 사람이 맞으면 통과하고, 붙여 넣는 문자열로 바꿨다 되돌려도 같다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const claim = await makeDirectClaim(
      winner,
      ticket,
      "ybbarng",
      "카톡 철수",
      1234567,
    );
    const text = encodeClaim(claim);
    expect(text.startsWith(CLAIM_PREFIX)).toBe(true);
    const back = decodeClaim(text);
    expect(back).toEqual(claim);
    expect(await verifyClaim(back, { ticket, to: "ybbarng" })).toEqual([]);
  });

  it("다른 사람에게 보낸 증명은 받는 사람이 달라 쓸 수 없다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const claim = await makeDirectClaim(winner, ticket, "영희", "철수", 1);
    expect(await verifyClaim(claim, { ticket, to: "ybbarng" })).toEqual([
      '받는 사람이 다르다(증명에는 "영희")',
    ]);
  });

  it("보내는 사람 이름을 고치면 서명이 맞지 않는다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const claim = await makeDirectClaim(winner, ticket, "ybbarng", "철수", 1);
    expect(claim.kind).toBe("direct");
    const forged = { ...claim, from: "가로챈 사람" } as typeof claim;
    expect(await verifyClaim(forged, { ticket, to: "ybbarng" })).toEqual([
      "서명이 맞지 않는다",
    ]);
  });

  it("남의 열쇠로 만든 증명은 응모권 주인의 열쇠가 아니다", async () => {
    const { other, ticket } = await winnerAndTicket();
    const claim = await makeDirectClaim(other, ticket, "ybbarng", "철수", 1);
    expect(await verifyClaim(claim, { ticket, to: "ybbarng" })).toContain(
      "응모권 주인의 열쇠가 아니다",
    );
  });

  it("다른 응모권의 증명은 거절한다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const another = await ticketFor(
      winner,
      2,
      [1, 2, 3, 4, 5, 6],
      genesisHash(HOURLY),
    );
    const claim = await makeDirectClaim(winner, another, "ybbarng", "철수", 1);
    expect(await verifyClaim(claim, { ticket, to: "ybbarng" })).toContain(
      "다른 응모권의 증명이다",
    );
  });

  it("이름은 앞뒤 공백 없이 1~200자", async () => {
    const { winner, ticket } = await winnerAndTicket();
    await expect(
      makeDirectClaim(winner, ticket, " ybbarng", "철수", 1),
    ).rejects.toThrow();
    await expect(
      makeDirectClaim(winner, ticket, "ybbarng", "", 1),
    ).rejects.toThrow();
  });
});

describe("확인 문구 증명", () => {
  it("내가 준 문구에 서명했으면 통과, 다른 문구면 거절", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const challenge = newChallengeText();
    expect(challenge).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    const claim = decodeClaim(
      encodeClaim(await makeChallengeClaim(winner, ticket, challenge)),
    );
    expect(await verifyClaim(claim, { ticket, challenge })).toEqual([]);
    expect(
      await verifyClaim(claim, { ticket, challenge: "ANOTHERONE" }),
    ).toEqual(["확인 문구가 다르다"]);
  });

  it("확인 문구를 요청했는데 바로 보내는 증명을 내면 거절", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const claim = await makeDirectClaim(winner, ticket, "ybbarng", "철수", 1);
    expect(
      await verifyClaim(claim, { ticket, challenge: newChallengeText() }),
    ).toContain("확인 문구 증명을 요청했는데 바로 보내는 증명이다");
  });

  it("빕또 증명이 아닌 문자열, 잘린 문자열은 읽지 않는다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const text = encodeClaim(
      await makeChallengeClaim(winner, ticket, "ABCDEFGHJK"),
    );
    expect(() => decodeClaim("hello")).toThrow("빕또 당첨 증명이 아니다");
    const body = fromBase64Url(text.slice(CLAIM_PREFIX.length));
    expect(() =>
      decodeClaim(CLAIM_PREFIX + toBase64Url(body.slice(0, body.length - 1))),
    ).toThrow();
  });
});

describe("응모 영수증", () => {
  it("서버 서명을 확인하고, 받은 시각이 응모 기간 안인지 본다", async () => {
    const { ticket } = await winnerAndTicket();
    const [server] = (await signers(1)) as [Signer];
    const { opensAt, closesAt } = roundTimes(HOURLY, 1);
    const receipt = await signReceipt(server, {
      round: 1,
      ticketId: ticketId(ticket),
      receivedAt: closesAt - 1,
    });
    const back = decodeReceipt(encodeReceipt(receipt));
    expect(back).toEqual(receipt);
    expect(await verifyReceipt(server.publicKey, back)).toBe(true);
    expect(receiptInTime(HOURLY, back)).toBe(true);
    expect(receiptInTime(HOURLY, { ...back, receivedAt: closesAt })).toBe(
      false,
    );
    expect(receiptInTime(HOURLY, { ...back, receivedAt: opensAt - 1 })).toBe(
      false,
    );
    // 받은 시각을 고치면 서명이 맞지 않는다
    expect(
      await verifyReceipt(server.publicKey, {
        ...back,
        receivedAt: closesAt - 2,
      }),
    ).toBe(false);
  });
});
