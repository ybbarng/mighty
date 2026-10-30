import { describe, expect, it } from "vitest";
import {
  decodeInvite,
  encodeInvite,
  inviteTokenHash,
  isInviteToken,
  newInviteToken,
  signInvite,
  verifyInvite,
} from "./invite";
import { genesisHash } from "./record";
import type { SoftPasskey } from "./signature";
import { fakePasskey, HOURLY, signers, ticketFor } from "./testing";

async function winnerAndTicket() {
  const [winner, other] = (await signers(2)) as [SoftPasskey, SoftPasskey];
  const ticket = await ticketFor(
    winner,
    1,
    [3, 11, 19, 27, 38, 44],
    genesisHash(HOURLY),
  );
  return { winner, other, ticket };
}

describe("당첨자 확인 링크 초대", () => {
  it("토큰은 144비트 base64url이고 매번 다르다", () => {
    const a = newInviteToken();
    expect(a).toHaveLength(24);
    expect(isInviteToken(a)).toBe(true);
    expect(newInviteToken()).not.toBe(a);
    expect(isInviteToken("짧다")).toBe(false);
    expect(isInviteToken(`${a}A`)).toBe(false);
  });

  it("응모권 주인이 서명한 초대는 통과하고, 문자열로 바꿨다 되돌려도 같다", async () => {
    const { winner, ticket } = await winnerAndTicket();
    const token = newInviteToken();
    const invite = await signInvite(winner, ticket, token);
    expect(invite.tokenHash).toEqual(inviteTokenHash(token));
    const back = decodeInvite(encodeInvite(invite));
    expect(back).toEqual(invite);
    expect(await verifyInvite(back, ticket)).toEqual([]);
  });

  it("남의 열쇠로 서명하거나 다른 응모권·토큰으로 바꾸면 걸린다", async () => {
    const { other, ticket } = await winnerAndTicket();
    const forged = await signInvite(other, ticket, newInviteToken());
    expect(await verifyInvite(forged, ticket)).toEqual([
      "응모권 주인의 서명이 아니다",
    ]);
    const { winner, ticket: mine } = await winnerAndTicket();
    const real = await signInvite(winner, mine, newInviteToken());
    const swapped = { ...real, tokenHash: inviteTokenHash(newInviteToken()) };
    expect(await verifyInvite(swapped, mine)).toEqual([
      "응모권 주인의 서명이 아니다",
    ]);
    expect(await verifyInvite(real, ticket)).toContain("다른 응모권의 초대다");
  });

  it("패스키로 낸 응모권도 패스키 서명으로 초대를 만든다", async () => {
    const passkey = await fakePasskey();
    const ticket = await ticketFor(
      passkey.signer,
      1,
      [1, 2, 3, 4, 5, 6],
      genesisHash(HOURLY),
    );
    const invite = await signInvite(passkey.signer, ticket, newInviteToken());
    expect(
      await verifyInvite(decodeInvite(encodeInvite(invite)), ticket, {
        rpId: "game.byb.kr",
        origins: ["https://game.byb.kr"],
      }),
    ).toEqual([]);
  });
});
