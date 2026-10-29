import {
  type ByteReader,
  ByteWriter,
  compareBytes,
  concat,
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
 * 별명 남기기(docs/36 11-2, 선택): 당첨자가 원하면 지난 회차 화면에 "12회 1등: 철수"를 남긴다.
 * 그 응모권 열쇠의 서명으로만 남길 수 있고, 응모권 하나에 한 번이다.
 * 별명은 그 회차가 닫힌 뒤에 내므로 다음 회차들의 기록에 들어간다.
 * 서명 대상: 용도 이름 ‖ round(u32) ‖ 응모권 id(32) ‖ 별명(u16 길이 + UTF-8)
 */

export const MAX_NICKNAME = 20;

export interface Nickname {
  round: number;
  ticketId: Uint8Array;
  nickname: string;
  sig: SignatureData;
}

/** 유니코드 NFC로 맞추고 앞뒤 공백을 뗀다. 같은 글자가 다른 바이트로 들어가지 않게 */
export function normalizeNickname(text: string): string {
  return text.normalize("NFC").trim();
}

/** 정규화된 1~20자(코드 포인트), 제어·서식 문자(보이지 않는 글자) 없음 */
export function checkNickname(text: string): string | null {
  if (normalizeNickname(text) !== text)
    return "별명은 NFC로 맞추고 앞뒤 공백 없이";
  const length = [...text].length;
  if (length < 1 || length > MAX_NICKNAME) return `별명은 1~${MAX_NICKNAME}자`;
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return "별명에 보이지 않는 글자가 있다";
  return null;
}

function nicknameMessage(n: Omit<Nickname, "sig">): Uint8Array {
  return concat(
    utf8("bybtto/nickname/v1"),
    new Uint8Array([0]),
    new ByteWriter().u32(n.round).fixed(n.ticketId, 32).text(n.nickname).done(),
  );
}

export async function makeNickname(
  signer: EntrantSigner,
  ticket: Ticket,
  text: string,
): Promise<Nickname> {
  const nickname = normalizeNickname(text);
  const problem = checkNickname(nickname);
  if (problem) throw new Error(problem);
  const fields = { round: ticket.round, ticketId: ticketId(ticket), nickname };
  return {
    ...fields,
    sig: await signAsEntrant(signer, nicknameMessage(fields)),
  };
}

export async function verifyNicknameSignature(
  n: Nickname,
  publicKey: Uint8Array,
  policy?: WebAuthnPolicy,
): Promise<boolean> {
  return verifyEntrantSignature(publicKey, nicknameMessage(n), n.sig, policy);
}

export function writeNickname(w: ByteWriter, n: Nickname): ByteWriter {
  w.u32(n.round).fixed(n.ticketId, 32).text(n.nickname);
  return writeSignature(w, n.sig);
}

export function readNickname(r: ByteReader): Nickname {
  return {
    round: r.u32(),
    ticketId: r.fixed(32),
    nickname: r.text(),
    sig: readSignature(r),
  };
}

/** 기록 안의 별명은 응모권 id 순서다 */
export function sortNicknames(list: readonly Nickname[]): Nickname[] {
  return [...list].sort((a, b) => compareBytes(a.ticketId, b.ticketId));
}
