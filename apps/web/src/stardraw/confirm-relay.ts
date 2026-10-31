import type { Clock } from "@mighty/fair-play";
import {
  CHECK_LINK_REQUESTER,
  type ConfirmRequest,
  decodeConfirmRequest,
  decodeInvite,
  directorRequester,
  encodeConfirmRequest,
  equalBytes,
  fromBase64Url,
  fromHex,
  inviteTokenHash,
  isInviteToken,
  newChallengeText,
  type SignatureData,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";

/**
 * 당첨자 확인 전달(docs/36 11-2, 2026-10-30 "당첨자가 먼저 보내는 확인 링크").
 * 1. 당첨자가 내 응모의 당첨 응모권에서 「확인 링크 만들기」 → 응모권 열쇠로 서명한 초대를 올린다(`invite`)
 * 2. 당첨자가 메신저로 링크(…/stardraw/check#토큰)를 보낸다
 * 3. 확인하는 사람이 링크를 열어(`peek`) 「확인 시작」 → 임시 ECDH 공개 열쇠를 실어 요청을 붙인다(`start`, 초대는 한 번만)
 * 4. 당첨자 기기는 내 응모권에 온 열린 요청을 스스로 찾아 띄우고, 승인하면 서명과 임시 공개 열쇠를 올린다. 24시간 안에
 * 5. 확인하는 사람의 브라우저가 서명을 장부의 응모권으로 직접 검사하고, 별 세 개를 맞춰 본 뒤 결과를 올린다
 * 서버 판은 `RemoteConfirmRelay`, 연습 장부·데모는 같은 기기 안(localStorage, 탭 사이 storage 이벤트)으로 흉내 낸다.
 * 기기 안 흉내는 초대 서명을 검사하지 않는다(장부를 모른다). 서버는 검사한다.
 */

/** 당첨자가 답할 수 있는 시간(그 뒤 별 누르기에는 기한이 없다) */
export const CONFIRM_ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
/** 전달하는 쪽이 요청·응답·결과를 들고 있는 시간 */
export const CONFIRM_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
/** 확인 링크를 쓸 수 있는 시간 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 응모권 하나에 아직 쓰이지 않은 링크 수 */
export const OPEN_INVITES_PER_TICKET = 10;

/** 확인 링크를 열어 본 결과 */
export type InvitePeek =
  | { state: "open"; round: number; ticketId: Uint8Array; expiresAt: number }
  | { state: "used" }
  /** 없거나 기한이 지났다 */
  | { state: "missing" };

export const USED_LINK =
  "이미 사용된 링크입니다. 당첨자에게 새 링크를 받으세요";

export type ConfirmOutcome =
  | { ok: true }
  | { ok: false; reasons: string[] }
  | { declined: true };

export interface OpenRequest {
  id: string;
  request: ConfirmRequest;
  /** 확인하는 분의 임시 ECDH 공개 열쇠 */
  checkerKey: Uint8Array;
  /** 이때까지 답해야 한다 */
  answerBy: number;
  /** 이 요청이 붙은 확인 링크를 만든 시각 */
  invitedAt: number;
  /** 우주국장이 국장 패스키로 서명해 연 확인이면 국장 공개 열쇠와 받는 분(2026-10-31 보안 검토 B3) */
  director?: { pub: Uint8Array; to: string };
}

/** 국장의 「확인 시작」 서명(checkStartMessage에 대한 국장 패스키 서명) */
export interface DirectorStartProof {
  pub: Uint8Array;
  signature: SignatureData;
  to: string;
}

export type ConfirmAnswer =
  | { claim: string; winnerKey: Uint8Array }
  | { declined: true };

export interface ConfirmRelay {
  /** 당첨자: 서명한 확인 링크 초대(`encodeInvite`)를 올린다 */
  invite(encoded: string): Promise<{ expiresAt: number }>;
  /** 확인하는 사람: 링크를 열어 본다(초대를 쓰지 않는다) */
  peek(token: string): Promise<InvitePeek>;
  /** 확인하는 사람: 「확인 시작」. 링크에 요청을 붙이고 링크를 닫는다 */
  start(
    token: string,
    checkerKey: Uint8Array,
    director?: DirectorStartProof,
  ): Promise<OpenRequest>;
  /** 당첨자: 내 응모권들에 온, 아직 답하지 않은 요청 */
  openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]>;
  /** 당첨자: 서명을 올리거나 거절한다. 요청은 한 번만 답할 수 있다 */
  answer(id: string, answer: ConfirmAnswer): Promise<void>;
  /** 확인하는 분: 응답을 기다린다(이미 와 있으면 곧바로). 끄는 함수를 돌려준다 */
  onAnswer(id: string, listener: (answer: ConfirmAnswer) => void): () => void;
  /** 확인하는 분: 결과를 올린다 */
  report(id: string, outcome: ConfirmOutcome): Promise<void>;
  /** 당첨자: 결과를 기다린다 */
  onOutcome(
    id: string,
    listener: (outcome: ConfirmOutcome) => void,
  ): () => void;
  /** 무엇이든 바뀌면 알린다(당첨자 화면이 열린 동안 요청을 다시 찾는 데 쓴다) */
  onChange(listener: () => void): () => void;
}

interface Entry {
  request: string;
  checkerKey: string;
  answerBy: number;
  invitedAt: number;
  keepUntil: number;
  answer?: { claim: string; winnerKey: string } | { declined: true };
  outcome?: ConfirmOutcome;
  director?: { pub: string; to: string };
}

/** 같은 기기 안 전달에 쓰는 저장소(기본은 localStorage). 시험은 메모리를 넣는다 */
export interface RelayStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
  /** 다른 탭에서 바뀌었을 때 부른다. 끄는 함수를 돌려준다 */
  subscribe?(listener: (key: string) => void): () => void;
}

export function browserRelayStore(): RelayStore {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    get: (key) => safe(() => localStorage.getItem(key), null),
    set: (key, value) =>
      safe(() => localStorage.setItem(key, value), undefined),
    remove: (key) => safe(() => localStorage.removeItem(key), undefined),
    keys: () => safe(() => Object.keys(localStorage), []),
    subscribe: (listener) => {
      const handler = (e: StorageEvent) => {
        if (e.key) listener(e.key);
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}

interface StoredInvite {
  round: number;
  ticketHex: string;
  createdAt: number;
  expiresAt: number;
  requestId?: string;
}

function toAnswer(a: NonNullable<Entry["answer"]>): ConfirmAnswer {
  return "declined" in a
    ? { declined: true }
    : { claim: a.claim, winnerKey: fromBase64Url(a.winnerKey) };
}

export class LocalConfirmRelay implements ConfirmRelay {
  private listeners = new Set<(key: string) => void>();

  constructor(
    private readonly clock: Clock,
    private readonly store: RelayStore,
    /** 저장 이름 앞머리(데모는 실제 게임과 따로 둔다) */
    private readonly prefix = "stardraw-confirm:",
  ) {
    store.subscribe?.((key) => this.emit(key));
  }

  private read(id: string): Entry | null {
    const text = this.store.get(this.prefix + id);
    if (!text) return null;
    try {
      const entry = JSON.parse(text) as Entry;
      if (entry.keepUntil <= this.clock.now()) {
        this.store.remove(this.prefix + id);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private write(id: string, entry: Entry): void {
    this.store.set(this.prefix + id, JSON.stringify(entry));
    this.emit(this.prefix + id);
  }

  private emit(key: string): void {
    for (const l of [...this.listeners]) l(key);
  }

  private watch(id: string, check: (entry: Entry) => boolean): () => void {
    const listener = (key: string) => {
      if (key !== this.prefix + id) return;
      const entry = this.read(id);
      if (entry && check(entry)) this.listeners.delete(listener);
    };
    this.listeners.add(listener);
    listener(this.prefix + id);
    return () => this.listeners.delete(listener);
  }

  private inviteKey(token: string): string {
    return `${this.prefix}i-${toHex(inviteTokenHash(token))}`;
  }

  private invites(): { key: string; invite: StoredInvite }[] {
    const out: { key: string; invite: StoredInvite }[] = [];
    for (const key of this.store.keys()) {
      if (!key.startsWith(`${this.prefix}i-`)) continue;
      try {
        out.push({
          key,
          invite: JSON.parse(this.store.get(key) ?? "") as StoredInvite,
        });
      } catch {
        // 깨진 값은 건너뛴다
      }
    }
    return out;
  }

  async invite(encoded: string): Promise<{ expiresAt: number }> {
    const invite = decodeInvite(encoded);
    const now = this.clock.now();
    const ticketHex = toHex(invite.ticketId);
    const open = this.invites().filter(
      ({ invite: i }) =>
        i.ticketHex === ticketHex && !i.requestId && i.expiresAt > now,
    );
    if (open.length >= OPEN_INVITES_PER_TICKET)
      throw new Error(
        `아직 쓰이지 않은 확인 링크가 ${OPEN_INVITES_PER_TICKET}개입니다. 그 링크를 먼저 보내 주세요`,
      );
    const key = `${this.prefix}i-${toHex(invite.tokenHash)}`;
    if (this.store.get(key)) throw new Error("이미 만든 확인 링크입니다");
    const expiresAt = now + INVITE_TTL_MS;
    const stored: StoredInvite = {
      round: invite.round,
      ticketHex,
      createdAt: now,
      expiresAt,
    };
    this.store.set(key, JSON.stringify(stored));
    this.emit(key);
    return { expiresAt };
  }

  private liveInvite(token: string): StoredInvite | null {
    if (!isInviteToken(token)) return null;
    const text = this.store.get(this.inviteKey(token));
    if (!text) return null;
    try {
      const invite = JSON.parse(text) as StoredInvite;
      return invite.expiresAt > this.clock.now() ? invite : null;
    } catch {
      return null;
    }
  }

  async peek(token: string): Promise<InvitePeek> {
    const invite = this.liveInvite(token);
    if (!invite) return { state: "missing" };
    if (invite.requestId) return { state: "used" };
    return {
      state: "open",
      round: invite.round,
      ticketId: fromHex(invite.ticketHex),
      expiresAt: invite.expiresAt,
    };
  }

  async start(
    token: string,
    checkerKey: Uint8Array,
    director?: DirectorStartProof,
  ): Promise<OpenRequest> {
    const invite = this.liveInvite(token);
    if (!invite)
      throw new Error(
        "없는 링크이거나 기한(7일)이 지났습니다. 당첨자에게 새 링크를 받으세요",
      );
    if (invite.requestId) throw new Error(USED_LINK);
    const id = toHex(crypto.getRandomValues(new Uint8Array(12)));
    this.store.set(
      this.inviteKey(token),
      JSON.stringify({ ...invite, requestId: id }),
    );
    const request: ConfirmRequest = {
      // 매번 새 문구라 미리 서명해 두거나 지난 서명을 다시 쓸 수 없다
      challenge: newChallengeText(),
      // 연습 장부의 같은 기기 전달은 국장 서명을 따로 확인하지 않는다(실제 서버가 장부의 국장 열쇠로 확인한다)
      requester: director
        ? directorRequester(director.to)
        : CHECK_LINK_REQUESTER,
      round: invite.round,
      ticketId: fromHex(invite.ticketHex),
    };
    const now = this.clock.now();
    const answerBy = now + CONFIRM_ANSWER_TTL_MS;
    this.write(id, {
      request: encodeConfirmRequest(request),
      checkerKey: toBase64Url(checkerKey),
      answerBy,
      invitedAt: invite.createdAt,
      keepUntil: now + CONFIRM_KEEP_MS,
      ...(director
        ? { director: { pub: toBase64Url(director.pub), to: director.to } }
        : {}),
    });
    return {
      id,
      request,
      checkerKey,
      answerBy,
      invitedAt: invite.createdAt,
    };
  }

  async openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]> {
    const now = this.clock.now();
    const out: OpenRequest[] = [];
    for (const key of this.store.keys()) {
      if (!key.startsWith(this.prefix)) continue;
      const id = key.slice(this.prefix.length);
      if (!/^[0-9a-f]{24}$/.test(id)) continue;
      const entry = this.read(id);
      if (!entry || entry.answer || entry.answerBy <= now) continue;
      const request = decodeConfirmRequest(entry.request);
      if (ticketIds.some((t) => equalBytes(t, request.ticketId)))
        out.push({
          id,
          request,
          checkerKey: fromBase64Url(entry.checkerKey),
          answerBy: entry.answerBy,
          invitedAt: entry.invitedAt,
          ...(entry.director
            ? {
                director: {
                  pub: fromBase64Url(entry.director.pub),
                  to: entry.director.to,
                },
              }
            : {}),
        });
    }
    return out.sort((a, b) => a.answerBy - b.answerBy);
  }

  async answer(id: string, answer: ConfirmAnswer): Promise<void> {
    const entry = this.read(id);
    if (!entry) throw new Error("없는 확인 요청입니다");
    if (entry.answerBy <= this.clock.now())
      throw new Error("확인 요청 시간이 지났습니다(24시간)");
    if (entry.answer) throw new Error("이미 답한 확인 요청입니다");
    this.write(id, {
      ...entry,
      answer:
        "declined" in answer
          ? { declined: true }
          : { claim: answer.claim, winnerKey: toBase64Url(answer.winnerKey) },
    });
  }

  onAnswer(id: string, listener: (answer: ConfirmAnswer) => void): () => void {
    return this.watch(id, (entry) => {
      if (!entry.answer) return false;
      listener(toAnswer(entry.answer));
      return true;
    });
  }

  async report(id: string, outcome: ConfirmOutcome): Promise<void> {
    const entry = this.read(id);
    if (entry) this.write(id, { ...entry, outcome });
  }

  onOutcome(
    id: string,
    listener: (outcome: ConfirmOutcome) => void,
  ): () => void {
    return this.watch(id, (entry) => {
      if (!entry.outcome) return false;
      listener(entry.outcome);
      return true;
    });
  }

  onChange(listener: () => void): () => void {
    const l = (key: string) => {
      if (key.startsWith(this.prefix)) listener();
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
