import type { Clock } from "@mighty/fair-play";
import {
  type ConfirmRequest,
  decodeClaim,
  decodeConfirmRequest,
  encodeConfirmRequest,
  equalBytes,
  fromBase64Url,
  newChallengeText,
  RANKS,
  sasChallenge,
  type Ticket,
  ticketId,
  toBase64Url,
  toHex,
  verifyClaim,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { EntryError } from "./engine";
import type { Store } from "./store";

/**
 * 당첨자 확인 전달(docs/36 11-2, 화면의 `ConfirmRelay` 서버 쪽).
 * 서버는 요청을 응모권 id로 찾아 주고, 응답·결과를 전달·보관(7일)만 한다. 별 세 개는 임시 ECDH라 서버가 모른다.
 * 그래도 두 가지는 막는다.
 * - 당첨 응모권에만 요청할 수 있다(장부에 없는 응모권으로 요청을 쌓지 못하게)
 * - 응답은 서명이 맞아야 받는다. 요청 id는 응모권 id(공개)로 찾을 수 있어서, 엉터리 응답을 먼저 올려
 *   진짜 당첨자가 답하지 못하게 하는 것을 막는다. 서명 확인에 필요한 값은 모두 공개 값이다
 * 결과는 요청을 만든 쪽만 올린다(만들 때 준 비밀 표).
 */

export const ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUESTER = 40;
const MAX_CLAIM = 4096;
const MAX_OPEN_QUERY = 64;

interface Payload {
  request: string;
  checkerKey: string;
  token: string;
  answer?: { claim: string; winnerKey: string } | { declined: true };
  outcome?: unknown;
}

export interface OpenRequestJson {
  id: string;
  request: string;
  checkerKey: string;
  answerBy: number;
}

export class Relay {
  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
    private readonly policy: WebAuthnPolicy,
  ) {}

  /** 닫힌 회차의 당첨 응모권(id로 찾음) */
  private winningTicket(round: number, id: Uint8Array): Ticket | null {
    const record = this.store.record(round);
    if (!record || record.void) return null;
    const winner = RANKS.some((rank) =>
      record.winners[rank].some((w) => equalBytes(w, id)),
    );
    if (!winner) return null;
    return (
      this.store.entries(round).find((t) => equalBytes(ticketId(t), id)) ?? null
    );
  }

  create(input: {
    round: number;
    ticketId: string;
    requester: string;
    checkerKey: string;
  }): OpenRequestJson & { token: string } {
    const requester = input.requester.trim();
    if (!requester || requester.length > MAX_REQUESTER)
      throw new EntryError(`확인하는 분 이름은 1~${MAX_REQUESTER}자입니다`);
    const id = fromBase64Url(input.ticketId);
    const checkerKey = fromBase64Url(input.checkerKey);
    if (id.length !== 32 || checkerKey.length !== 65)
      throw new EntryError("확인 요청 형식이 맞지 않습니다");
    if (!this.winningTicket(input.round, id))
      throw new EntryError("그 회차의 당첨 응모권이 아닙니다", 404);
    const now = this.clock.now();
    const request: ConfirmRequest = {
      challenge: newChallengeText(),
      requester,
      round: input.round,
      ticketId: id,
    };
    const relayId = toHex(crypto.getRandomValues(new Uint8Array(12)));
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
    const payload: Payload = {
      request: encodeConfirmRequest(request),
      checkerKey: input.checkerKey,
      token,
    };
    const answerBy = now + ANSWER_TTL_MS;
    this.store.relayPrune(now);
    this.store.relayPut({
      id: relayId,
      ticketHex: toHex(id),
      payload: JSON.stringify(payload),
      answerBy,
      keepUntil: now + KEEP_MS,
    });
    return {
      id: relayId,
      request: payload.request,
      checkerKey: input.checkerKey,
      answerBy,
      token,
    };
  }

  /** 당첨자: 내 응모권들에 온, 아직 답하지 않은 요청 */
  openFor(ticketIds: readonly string[]): OpenRequestJson[] {
    if (ticketIds.length > MAX_OPEN_QUERY)
      throw new EntryError("한 번에 찾는 응모권이 너무 많습니다");
    const now = this.clock.now();
    const hexes = ticketIds.map((t) => toHex(fromBase64Url(t)));
    return this.store
      .relayByTickets(hexes)
      .filter((row) => row.keepUntil > now && row.answerBy > now)
      .map((row) => ({ row, p: JSON.parse(row.payload) as Payload }))
      .filter(({ p }) => !p.answer)
      .map(({ row, p }) => ({
        id: row.id,
        request: p.request,
        checkerKey: p.checkerKey,
        answerBy: row.answerBy,
      }))
      .sort((a, b) => a.answerBy - b.answerBy);
  }

  private load(id: string) {
    const row = this.store.relayGet(id);
    if (!row || row.keepUntil <= this.clock.now())
      throw new EntryError("없는 확인 요청입니다", 404);
    return { row, p: JSON.parse(row.payload) as Payload };
  }

  async answer(
    id: string,
    answer: { claim: string; winnerKey: string } | { declined: true },
  ): Promise<void> {
    const { row, p } = this.load(id);
    if (row.answerBy <= this.clock.now())
      throw new EntryError("확인 요청 시간이 지났습니다(24시간)", 410);
    if (p.answer) throw new EntryError("이미 답한 확인 요청입니다", 409);
    if (!("declined" in answer)) {
      if (answer.claim.length > MAX_CLAIM)
        throw new EntryError("응답이 너무 깁니다");
      const request = decodeConfirmRequest(p.request);
      const ticket = this.winningTicket(request.round, request.ticketId);
      if (!ticket) throw new EntryError("없는 확인 요청입니다", 404);
      let problems: string[];
      try {
        const winnerKey = fromBase64Url(answer.winnerKey);
        problems = await verifyClaim(decodeClaim(answer.claim), {
          ticket,
          request: {
            challenge: sasChallenge(
              request.challenge,
              fromBase64Url(p.checkerKey),
              winnerKey,
            ),
            requester: request.requester,
          },
          policy: this.policy,
        });
      } catch {
        problems = ["형식"];
      }
      if (problems.length > 0)
        throw new EntryError("그 응모권의 서명이 아닙니다", 403);
    }
    // 서명 확인을 기다리는 사이 다른 응답이 먼저 왔을 수 있다
    const fresh = this.load(id);
    if (fresh.p.answer) throw new EntryError("이미 답한 확인 요청입니다", 409);
    this.store.relayPut({
      ...fresh.row,
      payload: JSON.stringify({ ...fresh.p, answer }),
    });
  }

  /** 응답·결과(기다리는 쪽이 짧게 되묻는다) */
  get(id: string): { answer: Payload["answer"] | null; outcome: unknown } {
    const { p } = this.load(id);
    return { answer: p.answer ?? null, outcome: p.outcome ?? null };
  }

  report(id: string, token: string, outcome: unknown): void {
    const { row, p } = this.load(id);
    if (token !== p.token)
      throw new EntryError("이 확인 요청을 만든 기기가 아닙니다", 403);
    if (!p.answer) throw new EntryError("아직 응답이 오지 않았습니다", 409);
    const text = JSON.stringify(outcome);
    if (text.length > 2048) throw new EntryError("결과가 너무 깁니다");
    this.store.relayPut({ ...row, payload: JSON.stringify({ ...p, outcome }) });
  }
}
