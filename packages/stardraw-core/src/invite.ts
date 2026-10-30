import {
  ByteReader,
  ByteWriter,
  concat,
  equalBytes,
  fromBase64Url,
  taggedHash,
  toBase64Url,
  utf8,
} from "./bytes";
import {
  type EntrantSigner,
  readSignature,
  type SignatureData,
  signAsEntrant,
  verifyEntrantSignature,
  type WebAuthnPolicy,
  writeSignature,
} from "./signature";
import { type Ticket, ticketId } from "./ticket";

/**
 * 당첨자 확인 링크(docs/36 11-2, 2026-10-30 다시 설계).
 * 당첨자가 먼저 한 번 쓰는 링크를 만들어 확인할 사람에게 보낸다. 아무나 당첨자에게 요청을 보내는 길은 없다.
 * - 당첨자 기기가 무작위 토큰(18바이트 = 144비트)을 만들고, `토큰 해시 ‖ 회차 ‖ 응모권 id`에 응모권 열쇠로 서명한다.
 *   서버는 그 서명을 장부의 응모권 공개 열쇠로 확인해야 초대를 받는다 → 응모권 주인만 링크를 만들 수 있다
 * - 서버는 토큰 해시만 저장한다. 토큰은 링크의 `#` 뒤에만 있어 서버 로그·Referer에 남지 않는다
 * - 링크를 연 사람이 「확인 시작」하면 토큰을 서버에 내고, 초대는 그 한 번으로 닫힌다
 * 확인 요청 자체(별 세 개, 서명 검사)는 claim.ts·sas.ts 그대로다.
 * 형식: v(u8) ‖ round(u32) ‖ ticketId(32) ‖ tokenHash(32) ‖ 서명
 */

const INVITE_VERSION = 1;
export const INVITE_TOKEN_BYTES = 18;

/** 확인 요청에 적는 요청자 칸. 이름 칸이 없어져, 링크로 온 요청은 모두 이 값이다 */
export const CHECK_LINK_REQUESTER = "확인 링크";

export interface ConfirmInvite {
  round: number;
  ticketId: Uint8Array;
  /** `inviteTokenHash(토큰)` */
  tokenHash: Uint8Array;
  sig: SignatureData;
}

/** 새 토큰(base64url 24자) */
export function newInviteToken(): string {
  return toBase64Url(
    crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_BYTES)),
  );
}

/** 토큰 형식이 맞는가(base64url, 18바이트) */
export function isInviteToken(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return false;
  try {
    return fromBase64Url(token).length === INVITE_TOKEN_BYTES;
  } catch {
    return false;
  }
}

export function inviteTokenHash(token: string): Uint8Array {
  return taggedHash("stardraw/confirm-invite-token/v1", utf8(token));
}

function inviteMessage(i: Omit<ConfirmInvite, "sig">): Uint8Array {
  return concat(
    utf8("stardraw/confirm-invite/v1"),
    new Uint8Array([0]),
    new ByteWriter()
      .u32(i.round)
      .fixed(i.ticketId, 32)
      .fixed(i.tokenHash, 32)
      .done(),
  );
}

/** 당첨자: 내 응모권으로 확인 링크 초대에 서명한다 */
export async function signInvite(
  signer: EntrantSigner,
  ticket: Ticket,
  token: string,
): Promise<ConfirmInvite> {
  if (!isInviteToken(token)) throw new Error("확인 링크 토큰 형식이 아니다");
  const fields = {
    round: ticket.round,
    ticketId: ticketId(ticket),
    tokenHash: inviteTokenHash(token),
  };
  return {
    ...fields,
    sig: await signAsEntrant(signer, inviteMessage(fields)),
  };
}

export function encodeInvite(i: ConfirmInvite): string {
  const w = new ByteWriter()
    .u8(INVITE_VERSION)
    .u32(i.round)
    .fixed(i.ticketId, 32)
    .fixed(i.tokenHash, 32);
  writeSignature(w, i.sig);
  return toBase64Url(w.done());
}

export function decodeInvite(text: string): ConfirmInvite {
  const r = new ByteReader(fromBase64Url(text));
  const v = r.u8();
  if (v !== INVITE_VERSION) throw new Error(`모르는 확인 링크 판: ${v}`);
  const invite = {
    round: r.u32(),
    ticketId: r.fixed(32),
    tokenHash: r.fixed(32),
    sig: readSignature(r),
  };
  r.end();
  return invite;
}

/** 문제 목록. 비어 있으면 그 응모권 주인이 만든 초대다(서버가 받기 전에 확인한다) */
export async function verifyInvite(
  invite: ConfirmInvite,
  ticket: Ticket,
  policy?: WebAuthnPolicy,
): Promise<string[]> {
  const problems: string[] = [];
  if (
    invite.round !== ticket.round ||
    !equalBytes(invite.ticketId, ticketId(ticket))
  )
    problems.push("다른 응모권의 초대다");
  if (
    !(await verifyEntrantSignature(
      ticket.pub,
      inviteMessage(invite),
      invite.sig,
      policy,
    ))
  )
    problems.push("응모권 주인의 서명이 아니다");
  return problems;
}
