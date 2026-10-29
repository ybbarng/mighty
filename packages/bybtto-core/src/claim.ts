import {
  ByteReader,
  ByteWriter,
  concat,
  equalBytes,
  fromBase64Url,
  toBase64Url,
  utf8,
} from "./bytes";
import {
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  type Signer,
  verifySignature,
} from "./keys";
import { type Ticket, ticketId } from "./ticket";

/**
 * 당첨 증명(docs/36 11-2). 둘 다 응모권 열쇠의 서명이고, 장부의 응모권으로 확인한다.
 * 1. 바로 보내는 증명: claim ‖ 응모권 id ‖ 받는 사람 ‖ 보내는 사람 ‖ 최근 drand 회차
 *    받는 사람이 다르면 다른 사람에게 못 쓰고, 보내는 사람이 연락해 온 사람과 다르면
 *    남의 증명을 넘겨받은 것이다. drand 회차로 언제 만들었는지 알 수 있다.
 * 2. 확인 문구 증명: 확인하는 쪽이 준 문구에 서명. 다시 쓸 수 없다.
 * 붙여 넣는 문자열은 `bybtto-claim:` + base64url(바이너리)다.
 */

export const CLAIM_PREFIX = "bybtto-claim:";

export type Claim =
  | {
      kind: "direct";
      ticketId: Uint8Array;
      to: string;
      from: string;
      drandRound: number;
      pub: Uint8Array;
      sig: Uint8Array;
    }
  | {
      kind: "challenge";
      ticketId: Uint8Array;
      challenge: string;
      pub: Uint8Array;
      sig: Uint8Array;
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type ClaimFields = DistributiveOmit<Claim, "pub" | "sig">;

const MAX_TEXT = 200;

function claimBody(c: ClaimFields): Uint8Array {
  const w = new ByteWriter().fixed(c.ticketId, 32);
  if (c.kind === "direct")
    return w.text(c.to).text(c.from).u64(c.drandRound).done();
  return w.text(c.challenge).done();
}

function claimMessage(c: ClaimFields): Uint8Array {
  const tag =
    c.kind === "direct"
      ? "bybtto/claim-direct/v1"
      : "bybtto/claim-challenge/v1";
  return concat(utf8(tag), new Uint8Array([0]), claimBody(c));
}

function checkText(label: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed !== text || text.length > MAX_TEXT) {
    throw new Error(`${label}은(는) 앞뒤 공백 없이 1~${MAX_TEXT}자`);
  }
}

export async function makeDirectClaim(
  signer: Signer,
  ticket: Ticket,
  to: string,
  from: string,
  drandRound: number,
): Promise<Claim> {
  checkText("받는 사람", to);
  checkText("보내는 사람", from);
  const fields = {
    kind: "direct",
    ticketId: ticketId(ticket),
    to,
    from,
    drandRound,
  } as const;
  return {
    ...fields,
    pub: signer.publicKey,
    sig: await signer.sign(claimMessage(fields)),
  };
}

export async function makeChallengeClaim(
  signer: Signer,
  ticket: Ticket,
  challenge: string,
): Promise<Claim> {
  checkText("확인 문구", challenge);
  const fields = {
    kind: "challenge",
    ticketId: ticketId(ticket),
    challenge,
  } as const;
  return {
    ...fields,
    pub: signer.publicKey,
    sig: await signer.sign(claimMessage(fields)),
  };
}

/** 확인 문구: 헷갈리는 글자(0·O·1·I 등)를 뺀 10자 */
export function newChallengeText(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function encodeClaim(c: Claim): string {
  const w = new ByteWriter().u8(c.kind === "direct" ? 1 : 2);
  const body = claimBody(c);
  w.bytes(body).fixed(c.pub, PUBLIC_KEY_LENGTH).fixed(c.sig, SIGNATURE_LENGTH);
  return CLAIM_PREFIX + toBase64Url(w.done());
}

export function decodeClaim(text: string): Claim {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CLAIM_PREFIX))
    throw new Error("빕또 당첨 증명이 아니다");
  const r = new ByteReader(fromBase64Url(trimmed.slice(CLAIM_PREFIX.length)));
  const kind = r.u8();
  const body = new ByteReader(r.bytes());
  const pub = r.fixed(PUBLIC_KEY_LENGTH);
  const sig = r.fixed(SIGNATURE_LENGTH);
  r.end();
  const id = body.fixed(32);
  if (kind === 1) {
    const claim: Claim = {
      kind: "direct",
      ticketId: id,
      to: body.text(),
      from: body.text(),
      drandRound: body.u64(),
      pub,
      sig,
    };
    body.end();
    return claim;
  }
  if (kind === 2) {
    const claim: Claim = {
      kind: "challenge",
      ticketId: id,
      challenge: body.text(),
      pub,
      sig,
    };
    body.end();
    return claim;
  }
  throw new Error(`모르는 증명 종류: ${kind}`);
}

export interface ClaimExpectation {
  /** 장부에서 찾은 그 응모권 */
  ticket: Ticket;
  /** 바로 보내는 증명: 받는 사람이 나여야 한다 */
  to?: string;
  /** 확인 문구 증명: 내가 준 문구여야 한다 */
  challenge?: string;
}

/** 문제 목록. 비어 있으면 통과 */
export async function verifyClaim(
  claim: Claim,
  expect: ClaimExpectation,
): Promise<string[]> {
  const problems: string[] = [];
  if (!equalBytes(claim.ticketId, ticketId(expect.ticket)))
    problems.push("다른 응모권의 증명이다");
  if (!equalBytes(claim.pub, expect.ticket.pub))
    problems.push("응모권 주인의 열쇠가 아니다");
  if (
    claim.kind === "direct" &&
    expect.to !== undefined &&
    claim.to !== expect.to
  ) {
    problems.push(`받는 사람이 다르다(증명에는 "${claim.to}")`);
  }
  if (
    claim.kind === "challenge" &&
    expect.challenge !== undefined &&
    claim.challenge !== expect.challenge
  ) {
    problems.push("확인 문구가 다르다");
  }
  if (claim.kind === "direct" && expect.challenge !== undefined) {
    problems.push("확인 문구 증명을 요청했는데 바로 보내는 증명이다");
  }
  if (!(await verifySignature(claim.pub, claimMessage(claim), claim.sig))) {
    problems.push("서명이 맞지 않는다");
  }
  return problems;
}
