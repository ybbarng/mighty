import type { Clock } from "@mighty/fair-play";
import {
  type ConfirmRequest,
  decodeConfirmRequest,
  encodeConfirmRequest,
  equalBytes,
  newChallengeText,
  toHex,
} from "@mighty/stardraw-core";

/**
 * 당첨자 확인 전달(docs/36 11-2, 초록불 흐름).
 * 1. 확인하는 분이 지난 회차의 당첨 응모권에서 「당첨자 확인」 → 이름을 적어 요청을 만든다
 * 2. 당첨자 기기는 내 응모권에 온 열린 요청을 스스로 찾아 "○○님이 12회 1등 당첨자 확인을 요청했습니다"를
 *    띄우고, [확인]이면 패스키로 서명해 응답을 올린다([거절]도 알린다)
 * 3. 확인하는 분의 브라우저가 서명을 장부의 응모권으로 직접 검사해 초록불을 켜고, 결과를 당첨자에게 알린다
 * 서버는 요청을 응모권 id로 찾아 주고 응답·결과를 잠깐 전달만 한다(검사하지 않는다). 요청은 한 번만, 10분 동안.
 * 지금은 서버가 없어 같은 기기 안(localStorage, 탭 사이 storage 이벤트)으로 흉내 내고,
 * 서버가 생기면 같은 인터페이스(`ConfirmRelay`)로 바꿔 끼운다.
 */

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

export type ConfirmOutcome =
  | { ok: true }
  | { ok: false; reasons: string[] }
  | { declined: true };

export interface OpenRequest {
  id: string;
  request: ConfirmRequest;
  expiresAt: number;
}

export type ConfirmAnswer = { claim: string } | { declined: true };

export interface ConfirmRelay {
  /** 확인하는 분: 요청을 만든다 */
  create(
    round: number,
    ticketId: Uint8Array,
    requester: string,
  ): Promise<OpenRequest>;
  /** 당첨자: 내 응모권들에 온, 아직 답하지 않은 요청 */
  openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]>;
  /** 당첨자: 서명을 올리거나 거절한다. 요청은 한 번만 답할 수 있다 */
  answer(id: string, answer: ConfirmAnswer): Promise<void>;
  /** 확인하는 분: 응답을 기다린다. 끄는 함수를 돌려준다 */
  onAnswer(id: string, listener: (answer: ConfirmAnswer) => void): () => void;
  /** 확인하는 분: 검사 결과를 올린다 */
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
  expiresAt: number;
  answer?: ConfirmAnswer;
  outcome?: ConfirmOutcome;
}

/** 같은 기기 안 전달에 쓰는 저장소(기본은 localStorage). 시험은 메모리를 넣는다 */
export interface RelayStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  keys(): string[];
  /** 다른 탭에서 바뀌었을 때 부른다. 끄는 함수를 돌려준다 */
  subscribe?(listener: (key: string) => void): () => void;
}

const PREFIX = "stardraw-confirm:";

export function browserRelayStore(): RelayStore {
  return {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 저장소를 못 쓰면 같은 탭 안에서만 전달된다
      }
    },
    keys: () => {
      try {
        return Object.keys(localStorage);
      } catch {
        return [];
      }
    },
    subscribe: (listener) => {
      const handler = (e: StorageEvent) => {
        if (e.key) listener(e.key);
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}

export class LocalConfirmRelay implements ConfirmRelay {
  private listeners = new Set<(key: string) => void>();

  constructor(
    private readonly clock: Clock,
    private readonly store: RelayStore,
  ) {
    store.subscribe?.((key) => this.emit(key));
  }

  private read(id: string): Entry | null {
    const text = this.store.get(PREFIX + id);
    if (!text) return null;
    try {
      return JSON.parse(text) as Entry;
    } catch {
      return null;
    }
  }

  private write(id: string, entry: Entry): void {
    this.store.set(PREFIX + id, JSON.stringify(entry));
    this.emit(PREFIX + id);
  }

  private emit(key: string): void {
    for (const l of [...this.listeners]) l(key);
  }

  private watch(id: string, check: (entry: Entry) => boolean): () => void {
    const listener = (key: string) => {
      if (key !== PREFIX + id) return;
      const entry = this.read(id);
      if (entry && check(entry)) this.listeners.delete(listener);
    };
    this.listeners.add(listener);
    listener(PREFIX + id);
    return () => this.listeners.delete(listener);
  }

  async create(
    round: number,
    ticketId: Uint8Array,
    requester: string,
  ): Promise<OpenRequest> {
    const id = toHex(crypto.getRandomValues(new Uint8Array(12)));
    const request: ConfirmRequest = {
      // 매번 새 문구라 미리 서명해 두거나 지난 서명을 다시 쓸 수 없다
      challenge: newChallengeText(),
      requester,
      round,
      ticketId,
    };
    const expiresAt = this.clock.now() + CONFIRM_TTL_MS;
    this.write(id, { request: encodeConfirmRequest(request), expiresAt });
    return { id, request, expiresAt };
  }

  async openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]> {
    const now = this.clock.now();
    const out: OpenRequest[] = [];
    for (const key of this.store.keys()) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      const entry = this.read(id);
      if (!entry || entry.answer || entry.expiresAt <= now) continue;
      const request = decodeConfirmRequest(entry.request);
      if (ticketIds.some((t) => equalBytes(t, request.ticketId)))
        out.push({ id, request, expiresAt: entry.expiresAt });
    }
    return out.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  async answer(id: string, answer: ConfirmAnswer): Promise<void> {
    const entry = this.read(id);
    if (!entry) throw new Error("없는 확인 요청입니다");
    if (entry.expiresAt <= this.clock.now())
      throw new Error("확인 요청 시간이 지났습니다(10분)");
    if (entry.answer) throw new Error("이미 답한 확인 요청입니다");
    this.write(id, { ...entry, answer });
  }

  onAnswer(id: string, listener: (answer: ConfirmAnswer) => void): () => void {
    return this.watch(id, (entry) => {
      if (!entry.answer) return false;
      listener(entry.answer);
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
      if (key.startsWith(PREFIX)) listener();
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
