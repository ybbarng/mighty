import { ByteReader, ByteWriter, concat, taggedHash, utf8 } from "./bytes";
import {
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  type Signer,
  verifySignature,
} from "./keys";
import { type SolveOptions, solvePow } from "./pow";

/**
 * 응모권(docs/36 4절). 고정 바이너리 형식:
 *   v(u8) ‖ round(u32) ‖ numbers(6바이트) ‖ pub(65) ‖ nonce(u32) ‖ sig(64) = 144바이트
 * - 작업 증명 대상은 v·round·numbers·pub(= `ticketContent`)
 * - 서명 대상과 응모권 id는 서명을 뺀 앞부분(= `ticketBody`). id에 서명이 빠져
 *   서명 모양만 바꾼 복제(ECDSA 변형)도 같은 id로 걸러진다(8-1 P3)
 */

export const TICKET_VERSION = 1;
export const TICKET_LENGTH =
  1 + 4 + 6 + PUBLIC_KEY_LENGTH + 4 + SIGNATURE_LENGTH;
export const PICK_COUNT = 6;
export const MAX_NUMBER = 45;

export interface Ticket {
  v: number;
  round: number;
  /** 1~45에서 서로 다른 6개, 오름차순 */
  numbers: number[];
  pub: Uint8Array;
  nonce: number;
  sig: Uint8Array;
}

export type UnsignedTicket = Omit<Ticket, "nonce" | "sig">;

export function checkNumbers(numbers: readonly number[]): string | null {
  if (numbers.length !== PICK_COUNT) return `번호는 ${PICK_COUNT}개`;
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i] as number;
    if (!Number.isInteger(n) || n < 1 || n > MAX_NUMBER)
      return `번호는 1~${MAX_NUMBER}`;
    if (i > 0 && n <= (numbers[i - 1] as number))
      return "번호는 서로 다르고 오름차순";
  }
  return null;
}

/** 작업 증명 대상 */
export function ticketContent(t: UnsignedTicket): Uint8Array {
  const problem = checkNumbers(t.numbers);
  if (problem) throw new Error(problem);
  return new ByteWriter()
    .u8(t.v)
    .u32(t.round)
    .fixed(Uint8Array.from(t.numbers), PICK_COUNT)
    .fixed(t.pub, PUBLIC_KEY_LENGTH)
    .done();
}

/** 서명 대상, 응모권 id의 바탕 */
export function ticketBody(t: Omit<Ticket, "sig">): Uint8Array {
  return concat(ticketContent(t), new ByteWriter().u32(t.nonce).done());
}

export function ticketId(t: Omit<Ticket, "sig">): Uint8Array {
  return taggedHash("bybtto/ticket/v1", ticketBody(t));
}

function signMessage(body: Uint8Array): Uint8Array {
  return concat(utf8("bybtto/ticket-sig/v1"), new Uint8Array([0]), body);
}

export function encodeTicket(t: Ticket): Uint8Array {
  return concat(
    ticketBody(t),
    new ByteWriter().fixed(t.sig, SIGNATURE_LENGTH).done(),
  );
}

export function decodeTicket(bytes: Uint8Array): Ticket {
  const r = new ByteReader(bytes);
  const v = r.u8();
  if (v !== TICKET_VERSION) throw new Error(`모르는 응모권 판: ${v}`);
  const round = r.u32();
  const numbers = Array.from(r.fixed(PICK_COUNT));
  const pub = r.fixed(PUBLIC_KEY_LENGTH);
  const nonce = r.u32();
  const sig = r.fixed(SIGNATURE_LENGTH);
  r.end();
  const problem = checkNumbers(numbers);
  if (problem) throw new Error(problem);
  return { v, round, numbers, pub, nonce, sig };
}

export async function verifyTicketSignature(t: Ticket): Promise<boolean> {
  try {
    return await verifySignature(t.pub, signMessage(ticketBody(t)), t.sig);
  } catch {
    return false;
  }
}

export function unsignedTicket(
  signer: Signer,
  round: number,
  numbers: readonly number[],
): UnsignedTicket {
  return {
    v: TICKET_VERSION,
    round,
    numbers: [...numbers].sort((a, b) => a - b),
    pub: signer.publicKey,
  };
}

/** 작업 증명을 따로(예: 웹 워커에서) 푼 뒤 서명만 한다 */
export async function signTicket(
  signer: Signer,
  unsigned: UnsignedTicket,
  nonce: number,
): Promise<Ticket> {
  const sig = await signer.sign(
    signMessage(ticketBody({ ...unsigned, nonce })),
  );
  return { ...unsigned, nonce, sig };
}

/** 작업 증명을 풀고 서명해 응모권을 만든다. 취소되면 null */
export async function makeTicket(
  signer: Signer,
  round: number,
  numbers: readonly number[],
  challenge: Uint8Array,
  powTarget: number,
  options: SolveOptions = {},
): Promise<Ticket | null> {
  const unsigned = unsignedTicket(signer, round, numbers);
  const nonce = await solvePow(
    challenge,
    ticketContent(unsigned),
    powTarget,
    options,
  );
  if (nonce === null) return null;
  return signTicket(signer, unsigned, nonce);
}
