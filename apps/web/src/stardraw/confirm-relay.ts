import type { Clock } from "@mighty/fair-play";
import {
  type ConfirmRequest,
  decodeConfirmRequest,
  encodeConfirmRequest,
  equalBytes,
  fromBase64Url,
  newChallengeText,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";

/**
 * 당첨자 확인 전달(docs/36 11-2).
 * 1. 확인하는 분이 지난 회차의 당첨 응모권에서 「당첨자 확인」 → 이름과 임시 ECDH 공개 열쇠를 실어 요청을 만든다
 * 2. 당첨자 기기는 내 응모권에 온 열린 요청을 스스로 찾아 띄우고, [확인]이면 패스키로 서명해
 *    서명과 자기 임시 공개 열쇠를 올린다([거절]도 알린다). 24시간 안에 답해야 한다
 * 3. 확인하는 분의 브라우저가 서명을 장부의 응모권으로 직접 검사하고, 별 세 개를 맞춰 본 뒤 결과를 올린다
 * 서버는 응모권 id로 요청을 찾아 주고 응답·결과를 전달·보관(7일)만 한다. 검사하지 않고, 공개 열쇠만 봐서 별을 모른다.
 * 지금은 서버가 없어 같은 기기 안(localStorage, 탭 사이 storage 이벤트)으로 흉내 낸다.
 * 서버가 생기면 같은 인터페이스(`ConfirmRelay`)로 바꿔 끼운다.
 */

/** 당첨자가 답할 수 있는 시간(그 뒤 별 누르기에는 기한이 없다) */
export const CONFIRM_ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
/** 전달하는 쪽이 요청·응답·결과를 들고 있는 시간 */
export const CONFIRM_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

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
}

export type ConfirmAnswer =
  | { claim: string; winnerKey: Uint8Array }
  | { declined: true };

export interface ConfirmRelay {
  /** 확인하는 분: 요청을 만든다 */
  create(
    round: number,
    ticketId: Uint8Array,
    requester: string,
    checkerKey: Uint8Array,
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
  keepUntil: number;
  answer?: { claim: string; winnerKey: string } | { declined: true };
  outcome?: ConfirmOutcome;
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

  async create(
    round: number,
    ticketId: Uint8Array,
    requester: string,
    checkerKey: Uint8Array,
  ): Promise<OpenRequest> {
    const id = toHex(crypto.getRandomValues(new Uint8Array(12)));
    const request: ConfirmRequest = {
      // 매번 새 문구라 미리 서명해 두거나 지난 서명을 다시 쓸 수 없다
      challenge: newChallengeText(),
      requester,
      round,
      ticketId,
    };
    const now = this.clock.now();
    const answerBy = now + CONFIRM_ANSWER_TTL_MS;
    this.write(id, {
      request: encodeConfirmRequest(request),
      checkerKey: toBase64Url(checkerKey),
      answerBy,
      keepUntil: now + CONFIRM_KEEP_MS,
    });
    return { id, request, checkerKey, answerBy };
  }

  async openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]> {
    const now = this.clock.now();
    const out: OpenRequest[] = [];
    for (const key of this.store.keys()) {
      if (!key.startsWith(this.prefix)) continue;
      const id = key.slice(this.prefix.length);
      const entry = this.read(id);
      if (!entry || entry.answer || entry.answerBy <= now) continue;
      const request = decodeConfirmRequest(entry.request);
      if (ticketIds.some((t) => equalBytes(t, request.ticketId)))
        out.push({
          id,
          request,
          checkerKey: fromBase64Url(entry.checkerKey),
          answerBy: entry.answerBy,
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
