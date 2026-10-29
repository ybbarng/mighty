import {
  ByteReader,
  ByteWriter,
  concat,
  equalBytes,
  fromBase64Url,
  toBase64Url,
  utf8,
} from "./bytes";
import { PUBLIC_KEY_LENGTH } from "./keys";
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
 * 당첨 증명(docs/36 11-2). 둘 다 응모권 열쇠(원시 열쇠나 패스키)의 서명이고,
 * 장부의 응모권으로 확인한다.
 * 1. 확인 문구 증명(화면 기본, "초록불"): 확인하는 쪽이 확인 요청(문구·내 이름·회차·응모권)을
 *    링크나 QR로 건네고, 당첨자가 그 문구와 요청자 이름에 서명한다. 문구가 매번 달라
 *    다시 쓸 수 없고, 당첨자는 누가 확인을 요청했는지 보고 서명한다.
 * 2. 바로 보내는 증명: claim ‖ 응모권 id ‖ 받는 사람 ‖ 보내는 사람 ‖ 최근 drand 회차.
 *    메신저 한 번으로 보내는 길로 남겨 둔다.
 * 붙여 넣는 문자열은 `stardraw-claim:` + base64url(바이너리)다.
 */

export const CLAIM_PREFIX = "stardraw-claim:";

export type Claim =
  | {
      kind: "direct";
      ticketId: Uint8Array;
      to: string;
      from: string;
      drandRound: number;
      pub: Uint8Array;
      sig: SignatureData;
    }
  | {
      kind: "challenge";
      ticketId: Uint8Array;
      challenge: string;
      /** 확인을 요청한 사람(당첨자 화면에 "○○님이 확인을 요청했어요"로 보인다) */
      requester: string;
      pub: Uint8Array;
      sig: SignatureData;
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
  return w.text(c.challenge).text(c.requester).done();
}

function claimMessage(c: ClaimFields): Uint8Array {
  const tag =
    c.kind === "direct"
      ? "stardraw/claim-direct/v1"
      : "stardraw/claim-challenge/v1";
  return concat(utf8(tag), new Uint8Array([0]), claimBody(c));
}

function checkText(label: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed !== text || text.length > MAX_TEXT) {
    throw new Error(`${label}은(는) 앞뒤 공백 없이 1~${MAX_TEXT}자`);
  }
}

export async function makeDirectClaim(
  signer: EntrantSigner,
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
    sig: await signAsEntrant(signer, claimMessage(fields)),
  };
}

export async function makeChallengeClaim(
  signer: EntrantSigner,
  ticket: Ticket,
  challenge: string,
  requester: string,
): Promise<Claim> {
  checkText("확인 문구", challenge);
  checkText("확인 요청자", requester);
  const fields = {
    kind: "challenge",
    ticketId: ticketId(ticket),
    challenge,
    requester,
  } as const;
  return {
    ...fields,
    pub: signer.publicKey,
    sig: await signAsEntrant(signer, claimMessage(fields)),
  };
}

/** 확인 문구: 헷갈리는 글자(0·O·1·I 등)를 뺀 10자 */
export function newChallengeText(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function encodeClaim(c: Claim): string {
  const w = new ByteWriter()
    .u8(c.kind === "direct" ? 1 : 2)
    .bytes(claimBody(c))
    .fixed(c.pub, PUBLIC_KEY_LENGTH);
  writeSignature(w, c.sig);
  return CLAIM_PREFIX + toBase64Url(w.done());
}

export function decodeClaim(text: string): Claim {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CLAIM_PREFIX))
    throw new Error("하늘의 별 따기 당첨 증명이 아니다");
  const r = new ByteReader(fromBase64Url(trimmed.slice(CLAIM_PREFIX.length)));
  const kind = r.u8();
  const body = new ByteReader(r.bytes());
  const pub = r.fixed(PUBLIC_KEY_LENGTH);
  const sig = readSignature(r);
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
      requester: body.text(),
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
  /** 확인 문구 증명: 내가 건넨 확인 요청이어야 한다 */
  request?: Pick<ConfirmRequest, "challenge" | "requester">;
  policy?: WebAuthnPolicy;
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
  if (claim.kind === "challenge" && expect.request) {
    if (claim.challenge !== expect.request.challenge)
      problems.push("확인 문구가 다르다");
    if (claim.requester !== expect.request.requester)
      problems.push(`확인 요청자가 다르다(증명에는 "${claim.requester}")`);
  }
  if (claim.kind === "direct" && expect.request) {
    problems.push("확인 문구 증명을 요청했는데 바로 보내는 증명이다");
  }
  if (
    !(await verifyEntrantSignature(
      claim.pub,
      claimMessage(claim),
      claim.sig,
      expect.policy,
    ))
  ) {
    problems.push("서명이 맞지 않는다");
  }
  return problems;
}

/**
 * 확인 요청(초록불 흐름, docs/36 11-2): 확인하는 쪽이 만들어 링크(`…#<인코딩>`)나 QR로 건넨다.
 * 당첨자 화면은 이것을 읽어 "○○님이 12회 1등 주인 확인을 요청했어요"를 보이고 서명한다.
 * 형식: v(u8) ‖ round(u32) ‖ ticketId(32) ‖ challenge(text) ‖ requester(text)
 */
export interface ConfirmRequest {
  challenge: string;
  requester: string;
  round: number;
  ticketId: Uint8Array;
}

const CONFIRM_VERSION = 1;

export function newConfirmRequest(
  requester: string,
  round: number,
  id: Uint8Array,
): ConfirmRequest {
  checkText("확인 요청자", requester);
  return { challenge: newChallengeText(), requester, round, ticketId: id };
}

export function encodeConfirmRequest(req: ConfirmRequest): string {
  checkText("확인 문구", req.challenge);
  checkText("확인 요청자", req.requester);
  return toBase64Url(
    new ByteWriter()
      .u8(CONFIRM_VERSION)
      .u32(req.round)
      .fixed(req.ticketId, 32)
      .text(req.challenge)
      .text(req.requester)
      .done(),
  );
}

/** `base`(예: https://game.byb.kr/stardraw/confirm) 뒤에 `#`로 붙인다. `#` 뒤는 서버로 가지 않는다 */
export function confirmRequestUrl(base: string, req: ConfirmRequest): string {
  return `${base}#${encodeConfirmRequest(req)}`;
}

/** 링크 전체나 `#` 뒤 부분을 읽는다 */
export function decodeConfirmRequest(textOrUrl: string): ConfirmRequest {
  const trimmed = textOrUrl.trim();
  const hash = trimmed.lastIndexOf("#");
  const r = new ByteReader(
    fromBase64Url(hash >= 0 ? trimmed.slice(hash + 1) : trimmed),
  );
  const v = r.u8();
  if (v !== CONFIRM_VERSION) throw new Error(`모르는 확인 요청 판: ${v}`);
  const req = {
    round: r.u32(),
    ticketId: r.fixed(32),
    challenge: r.text(),
    requester: r.text(),
  };
  r.end();
  checkText("확인 문구", req.challenge);
  checkText("확인 요청자", req.requester);
  return req;
}

/** 당첨자 쪽: 받은 확인 요청이 내 응모권 것인지 보고 서명한다 */
export async function answerConfirmRequest(
  signer: EntrantSigner,
  ticket: Ticket,
  req: ConfirmRequest,
): Promise<Claim> {
  if (req.round !== ticket.round || !equalBytes(req.ticketId, ticketId(ticket)))
    throw new Error("이 응모권에 대한 확인 요청이 아니다");
  return makeChallengeClaim(signer, ticket, req.challenge, req.requester);
}
