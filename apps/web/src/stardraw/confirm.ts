import {
  answerConfirmRequest,
  type ConfirmRequest,
  decodeClaim,
  type EntrantSigner,
  encodeClaim,
  equalBytes,
  type Ticket,
  ticketId,
  verifyClaim,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import type { ConfirmAnswer, ConfirmOutcome } from "./confirm-relay";

/**
 * 당첨자 확인의 양쪽 계산(docs/36 11-2). 전달은 confirm-relay, 계산은 규칙 패키지다.
 * 확인하는 분의 브라우저가 장부에서 찾은 응모권으로 서명을 직접 검사한다.
 */

/** 규칙 패키지의 문제 문장을 화면 말투로 */
const REASONS: [RegExp, string][] = [
  [/다른 응모권/, "다른 응모권의 서명입니다"],
  [/열쇠가 아니다/, "그 응모권을 낸 열쇠의 서명이 아닙니다"],
  [/확인 문구가 다르다/, "이 확인 요청에 대한 서명이 아닙니다"],
  [/요청자가 다르다/, "이 확인 요청에 대한 서명이 아닙니다"],
  [/바로 보내는 증명/, "이 확인 요청에 대한 서명이 아닙니다"],
  [/서명이 맞지 않는다/, "서명이 맞지 않습니다"],
];

function friendly(problem: string): string {
  return REASONS.find(([re]) => re.test(problem))?.[1] ?? problem;
}

/** 확인하는 분: 받은 응답(서명이나 거절)을 결과로 */
export async function checkAnswer(
  answer: ConfirmAnswer,
  request: ConfirmRequest,
  ticket: Ticket,
  policy: WebAuthnPolicy,
): Promise<ConfirmOutcome> {
  if ("declined" in answer) return { declined: true };
  return checkClaim(answer.claim, request, ticket, policy);
}

/** 확인하는 분: 받은 서명을 검사한다 */
export async function checkClaim(
  claimText: string,
  request: ConfirmRequest,
  ticket: Ticket,
  policy: WebAuthnPolicy,
): Promise<ConfirmOutcome> {
  let claim: ReturnType<typeof decodeClaim>;
  try {
    claim = decodeClaim(claimText);
  } catch {
    return { ok: false, reasons: ["서명을 읽을 수 없습니다"] };
  }
  const problems = await verifyClaim(claim, {
    ticket,
    request: { challenge: request.challenge, requester: request.requester },
    policy,
  });
  if (problems.length === 0) return { ok: true };
  return { ok: false, reasons: [...new Set(problems.map(friendly))] };
}

/** 당첨자: 확인 요청에 맞는 내 응모권을 찾는다 */
export function myTicketFor(
  request: ConfirmRequest,
  mine: readonly Ticket[],
): Ticket | null {
  return (
    mine.find(
      (t) =>
        t.round === request.round && equalBytes(ticketId(t), request.ticketId),
    ) ?? null
  );
}

/** 당첨자: 확인 요청에 서명해 올릴 문자열을 만든다 */
export async function signAnswer(
  signer: EntrantSigner,
  ticket: Ticket,
  request: ConfirmRequest,
): Promise<string> {
  return encodeClaim(await answerConfirmRequest(signer, ticket, request));
}
