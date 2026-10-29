import { ByteReader, ByteWriter, concat, utf8 } from "./bytes";
import { SIGNATURE_LENGTH, type Signer, verifySignature } from "./keys";
import { roundTimes, type Schedule } from "./schedule";

/**
 * 응모 영수증(docs/36 8-1 O2): 서버가 응모권을 받으면 `round·응모권 id·받은 시각`에
 * 서버 열쇠로 서명해 돌려준다. 영수증이 있는데 그 회차 목록에 없으면
 * 운영자가 응모권을 뺐다는 것을 누구에게나 보일 수 있다.
 * 형식: round(u32) ‖ ticketId(32) ‖ receivedAt(u64) ‖ sig(64)
 */

export interface Receipt {
  round: number;
  ticketId: Uint8Array;
  /** 서버가 받은 시각(유닉스 초). 마감은 이 시각으로 정한다 */
  receivedAt: number;
  sig: Uint8Array;
}

function receiptBody(r: Omit<Receipt, "sig">): Uint8Array {
  return new ByteWriter()
    .u32(r.round)
    .fixed(r.ticketId, 32)
    .u64(r.receivedAt)
    .done();
}

function message(body: Uint8Array): Uint8Array {
  return concat(utf8("stardraw/receipt/v1"), new Uint8Array([0]), body);
}

export async function signReceipt(
  server: Signer,
  r: Omit<Receipt, "sig">,
): Promise<Receipt> {
  return { ...r, sig: await server.sign(message(receiptBody(r))) };
}

export async function verifyReceipt(
  serverPublicKey: Uint8Array,
  r: Receipt,
): Promise<boolean> {
  return verifySignature(serverPublicKey, message(receiptBody(r)), r.sig);
}

/** 받은 시각이 그 회차 응모 기간 안인지 */
export function receiptInTime(schedule: Schedule, r: Receipt): boolean {
  const { opensAt, closesAt } = roundTimes(schedule, r.round);
  return r.receivedAt >= opensAt && r.receivedAt < closesAt;
}

export function encodeReceipt(r: Receipt): Uint8Array {
  return concat(
    receiptBody(r),
    new ByteWriter().fixed(r.sig, SIGNATURE_LENGTH).done(),
  );
}

export function decodeReceipt(bytes: Uint8Array): Receipt {
  const reader = new ByteReader(bytes);
  const receipt = {
    round: reader.u32(),
    ticketId: reader.fixed(32),
    receivedAt: reader.u64(),
    sig: reader.fixed(SIGNATURE_LENGTH),
  };
  reader.end();
  return receipt;
}
