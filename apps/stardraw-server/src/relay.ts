import type { Clock } from "@mighty/fair-play";
import {
  CHECK_LINK_REQUESTER,
  type ConfirmRequest,
  decodeClaim,
  decodeConfirmRequest,
  decodeInvite,
  encodeConfirmRequest,
  equalBytes,
  fromBase64Url,
  fromHex,
  inviteTokenHash,
  isInviteToken,
  newChallengeText,
  RANKS,
  sasChallenge,
  type Ticket,
  ticketId,
  toBase64Url,
  toHex,
  verifyClaim,
  verifyInvite,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { EntryError } from "./engine";
import { Counters, ipPrefix } from "./limits";
import type { Store } from "./store";

/**
 * 당첨자 확인 전달(docs/36 11-2, 화면의 `ConfirmRelay` 서버 쪽). 2026-10-30 "당첨자가 먼저 보내는 확인 링크"로 바꿨다.
 * 1. 당첨자가 응모권 열쇠로 서명한 초대(토큰 해시)를 올린다. 서명이 장부의 그 응모권 열쇠로 맞아야 받는다
 *    → 응모권 주인만 링크를 만들 수 있다. 서버는 토큰 해시만 둔다(토큰은 링크 `#` 뒤에만 있다)
 * 2. 링크를 연 사람이 토큰과 임시 ECDH 공개 열쇠를 내면 초대에 요청 하나를 붙이고 초대를 닫는다(한 번만)
 * 3. 당첨자 기기가 그 요청을 찾아 서명으로 답하고, 확인하는 쪽이 결과를 올린다(요청을 붙일 때 준 결과 열쇠로)
 * 서버는 전달·보관(7일)만 한다. 별 세 개는 임시 ECDH라 서버가 모른다. 응답은 서명이 맞아야 받는다
 * (요청 id는 공개 응모권 id로 찾을 수 있어, 엉터리 응답을 먼저 올려 진짜 당첨자가 답하지 못하게 하는 것을 막는다).
 * 장난: 아무나 당첨자에게 요청을 보낼 수 없어 요청 폭탄이 없다. 초대는 주인만 만들 수 있어 응모권당 열린 초대 상한(10)이
 * 방해 도구가 되지 않는다. 그 밖에 IP 앞부분마다 하루 초대 수, 없는 링크 조회 수 상한.
 */

export const ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLAIM = 4096;
const MAX_INVITE = 2048;
const MAX_OPEN_QUERY = 64;

interface Payload {
  request: string;
  checkerKey: string;
  /** 결과를 올릴 수 있는 열쇠(요청을 붙인 기기만 안다) */
  reportKey: string;
  /** 초대를 만든 시각(당첨자 화면에 "○시에 만든 링크") */
  invitedAt: number;
  answer?: { claim: string; winnerKey: string } | { declined: true };
  outcome?: unknown;
}

export interface OpenRequestJson {
  id: string;
  request: string;
  checkerKey: string;
  answerBy: number;
  invitedAt: number;
}

export type InvitePeek =
  | { state: "open"; round: number; ticketId: string; expiresAt: number }
  | { state: "used" };

export interface RelayLimits {
  /** 공인 IP 앞부분 하나당 하루(UTC) 확인 링크 만들기 수 */
  invitesPerPrefixPerDay: number;
  /** 공인 IP 앞부분 하나당 하루 없는 링크 조회 수(토큰 맞히기 막기) */
  badLinksPerPrefixPerDay: number;
  /** 응모권 하나에 아직 쓰이지 않은 링크 수 */
  openInvitesPerTicket: number;
}

export const DEFAULT_RELAY_LIMITS: RelayLimits = {
  // 운영 기본값은 config.ts DEFAULT_PREFIX_LIMITS(공유 IP 기준으로 넉넉히)와 같다
  invitesPerPrefixPerDay: 100,
  badLinksPerPrefixPerDay: 60,
  openInvitesPerTicket: 10,
};

export class Relay {
  private readonly counters = new Counters();

  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
    private readonly policy: WebAuthnPolicy,
    private readonly limits: RelayLimits = DEFAULT_RELAY_LIMITS,
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

  private day(): string {
    return new Date(this.clock.now()).toISOString().slice(0, 10);
  }

  /** 당첨자: 서명한 초대를 올린다 */
  async createInvite(input: {
    invite: string;
    ip?: string;
  }): Promise<{ expiresAt: number }> {
    const prefix = ipPrefix(input.ip ?? "unknown");
    const day = this.day();
    if (
      this.counters.count("invite", day, prefix) >=
      this.limits.invitesPerPrefixPerDay
    )
      throw new EntryError(
        "오늘 이 곳에서 만든 확인 링크가 너무 많습니다. 내일 다시 해 주세요",
        429,
      );
    let invite: ReturnType<typeof decodeInvite>;
    try {
      if (input.invite.length > MAX_INVITE) throw new Error();
      invite = decodeInvite(input.invite);
    } catch {
      throw new EntryError("확인 링크 형식이 맞지 않습니다");
    }
    const ticket = this.winningTicket(invite.round, invite.ticketId);
    if (!ticket) throw new EntryError("그 회차의 당첨 응모권이 아닙니다", 404);
    const now = this.clock.now();
    const ticketHex = toHex(invite.ticketId);
    this.store.relayPrune(now);
    if (
      this.store.invitesOpen(ticketHex, now) >= this.limits.openInvitesPerTicket
    )
      throw new EntryError(
        `아직 쓰이지 않은 확인 링크가 ${this.limits.openInvitesPerTicket}개입니다. 그 링크를 먼저 보내 주세요`,
        429,
      );
    this.counters.add("invite", day, prefix);
    if ((await verifyInvite(invite, ticket, this.policy)).length > 0)
      throw new EntryError("그 응모권 주인의 서명이 아닙니다", 403);
    const expiresAt = now + INVITE_TTL_MS;
    const added = this.store.inviteAdd({
      tokenHash: toHex(invite.tokenHash),
      ticketHex,
      round: invite.round,
      createdAt: now,
      expiresAt,
      requestId: null,
    });
    if (!added) throw new EntryError("이미 만든 확인 링크입니다", 409);
    return { expiresAt };
  }

  /** 토큰으로 살아 있는 초대를 찾는다. 없거나 기한이 지났으면 404(조회 수를 센다) */
  private invite(token: string, ip: string | undefined) {
    const prefix = ipPrefix(ip ?? "unknown");
    const day = this.day();
    if (
      this.counters.count("bad-link", day, prefix) >=
      this.limits.badLinksPerPrefixPerDay
    )
      throw new EntryError(
        "오늘 이 곳에서 없는 링크를 너무 많이 열었습니다. 내일 다시 해 주세요",
        429,
      );
    const row = isInviteToken(token)
      ? this.store.inviteGet(toHex(inviteTokenHash(token)))
      : null;
    if (!row || row.expiresAt <= this.clock.now()) {
      this.counters.add("bad-link", day, prefix);
      throw new EntryError(
        "없는 링크이거나 기한(7일)이 지났습니다. 당첨자에게 새 링크를 받으세요",
        404,
      );
    }
    return row;
  }

  /** 확인하는 사람: 링크를 열어 회차·응모권을 본다(초대를 쓰지 않는다) */
  peek(token: string, ip?: string): InvitePeek {
    const row = this.invite(token, ip);
    if (row.requestId) return { state: "used" };
    return {
      state: "open",
      round: row.round,
      ticketId: toBase64Url(fromHex(row.ticketHex)),
      expiresAt: row.expiresAt,
    };
  }

  /** 확인하는 사람: 「확인 시작」. 초대에 요청을 붙이고 초대를 닫는다 */
  start(input: {
    token: string;
    checkerKey: string;
    ip?: string;
  }): OpenRequestJson & { reportKey: string } {
    const row = this.invite(input.token, input.ip);
    let checkerKey: Uint8Array;
    try {
      checkerKey = fromBase64Url(input.checkerKey);
    } catch {
      checkerKey = new Uint8Array();
    }
    if (checkerKey.length !== 65)
      throw new EntryError("확인 요청 형식이 맞지 않습니다");
    if (row.requestId) throw usedLink();
    const id = fromHex(row.ticketHex);
    if (!this.winningTicket(row.round, id))
      throw new EntryError("그 회차의 당첨 응모권이 아닙니다", 404);
    const now = this.clock.now();
    const relayId = toHex(crypto.getRandomValues(new Uint8Array(12)));
    // 여기까지 기다림이 없어 다른 요청이 끼어들 수 없지만, 저장소에서도 한 번만 쓰이게 한다
    if (!this.store.inviteUse(row.tokenHash, relayId)) throw usedLink();
    const request: ConfirmRequest = {
      challenge: newChallengeText(),
      requester: CHECK_LINK_REQUESTER,
      round: row.round,
      ticketId: id,
    };
    const payload: Payload = {
      request: encodeConfirmRequest(request),
      checkerKey: input.checkerKey,
      reportKey: toBase64Url(crypto.getRandomValues(new Uint8Array(18))),
      invitedAt: row.createdAt,
    };
    const answerBy = now + ANSWER_TTL_MS;
    this.store.relayPut({
      id: relayId,
      ticketHex: row.ticketHex,
      payload: JSON.stringify(payload),
      answerBy,
      keepUntil: now + KEEP_MS,
    });
    return {
      id: relayId,
      request: payload.request,
      checkerKey: input.checkerKey,
      answerBy,
      invitedAt: row.createdAt,
      reportKey: payload.reportKey,
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
        invitedAt: p.invitedAt,
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

  report(id: string, reportKey: string, outcome: unknown): void {
    const { row, p } = this.load(id);
    if (reportKey !== p.reportKey)
      throw new EntryError("이 확인 요청을 만든 기기가 아닙니다", 403);
    if (!p.answer) throw new EntryError("아직 응답이 오지 않았습니다", 409);
    const text = JSON.stringify(outcome);
    if (text.length > 2048) throw new EntryError("결과가 너무 깁니다");
    this.store.relayPut({ ...row, payload: JSON.stringify({ ...p, outcome }) });
  }
}

function usedLink(): EntryError {
  return new EntryError(
    "이미 사용된 링크입니다. 당첨자에게 새 링크를 받으세요",
    409,
  );
}
