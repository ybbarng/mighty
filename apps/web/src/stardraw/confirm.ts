import {
  type ConfirmRequest,
  decodeClaim,
  type EntrantSigner,
  encodeClaim,
  equalBytes,
  generateSasKey,
  makeChallengeClaim,
  sasChallenge,
  sasSecret,
  sasStars,
  type Ticket,
  ticketId,
  verifyClaim,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import type { ConfirmAnswer, OpenRequest } from "./confirm-relay";

/**
 * 당첨자 확인의 양쪽 계산(docs/36 11-2). 전달은 confirm-relay, 계산은 규칙 패키지다.
 * 판정은 늘 확인하는 분의 기기에서 한다: 장부에서 찾은 응모권으로 서명을 직접 검사하고,
 * 임시 ECDH 공유 비밀로 별 세 개를 계산해 상대가 보낸 별과 맞춰 본다.
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

export type AnswerCheck =
  | { declined: true }
  | { ok: false; reasons: string[] }
  /** 서명이 맞았다. 이제 상대가 보낸 별 세 개를 맞춰 본다 */
  | { ok: true; stars: number[] };

/** 확인하는 분: 받은 응답(서명이나 거절)을 검사하고, 맞으면 별 세 개를 계산한다 */
export async function checkAnswer(
  answer: ConfirmAnswer,
  open: Pick<OpenRequest, "id" | "request" | "checkerKey">,
  checkerPrivateKey: CryptoKey,
  ticket: Ticket,
  policy: WebAuthnPolicy,
): Promise<AnswerCheck> {
  if ("declined" in answer) return { declined: true };
  let claim: ReturnType<typeof decodeClaim>;
  try {
    claim = decodeClaim(answer.claim);
  } catch {
    return { ok: false, reasons: ["서명을 읽을 수 없습니다"] };
  }
  const problems = await verifyClaim(claim, {
    ticket,
    request: {
      // 당첨자는 양쪽 임시 공개 열쇠를 묶은 문구에 서명한다(가운데서 열쇠를 바꿔치기할 수 없게)
      challenge: sasChallenge(
        open.request.challenge,
        open.checkerKey,
        answer.winnerKey,
      ),
      requester: open.request.requester,
    },
    policy,
  });
  if (problems.length > 0)
    return { ok: false, reasons: [...new Set(problems.map(friendly))] };
  try {
    const secret = await sasSecret(checkerPrivateKey, answer.winnerKey);
    return { ok: true, stars: sasStars(secret, open.id) };
  } catch {
    return { ok: false, reasons: ["응답의 임시 열쇠가 맞지 않습니다"] };
  }
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

/** 당첨자: 확인 요청에 서명하고, 확인하는 분께 보낼 별 세 개를 계산한다 */
export async function prepareAnswer(
  signer: EntrantSigner,
  ticket: Ticket,
  open: OpenRequest,
): Promise<{ answer: ConfirmAnswer; stars: number[] }> {
  if (
    open.request.round !== ticket.round ||
    !equalBytes(open.request.ticketId, ticketId(ticket))
  )
    throw new Error("이 응모권에 대한 확인 요청이 아닙니다");
  const mine = await generateSasKey();
  const claim = await makeChallengeClaim(
    signer,
    ticket,
    sasChallenge(open.request.challenge, open.checkerKey, mine.publicKey),
    open.request.requester,
  );
  const secret = await sasSecret(mine.privateKey, open.checkerKey);
  return {
    answer: { claim: encodeClaim(claim), winnerKey: mine.publicKey },
    stars: sasStars(secret, open.id),
  };
}

/** 확인하는 분: 상대가 보낸 별(누른 차례)이 계산한 별과 같은가 */
export function starsMatch(
  expected: readonly number[],
  entered: readonly number[],
): boolean {
  return (
    expected.length === entered.length &&
    expected.every((n, i) => entered[i] === n)
  );
}
