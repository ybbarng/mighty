import type { Clock } from "@mighty/fair-play";
import {
  type ConfirmRequest,
  decodeConfirmRequest,
  encodeConfirmRequest,
  newChallengeText,
} from "@mighty/stardraw-core";

/**
 * 당첨자 확인 전달(docs/36 11-2, 초록불 흐름).
 * 1. 확인하는 분이 지난 회차의 당첨 응모권에서 「당첨자 확인」 → 6자리 확인 번호와 QR이 뜬다
 * 2. 당첨자는 "내 응모"에서 그 번호를 넣고 패스키로 서명한다
 * 3. 확인하는 분의 브라우저가 서명을 장부의 응모권으로 직접 검사해 초록불을 켜고, 결과를 당첨자에게 알린다
 * 서버는 번호로 요청을 찾아 주고 응답과 결과를 잠깐 전달만 한다(검사는 하지 않는다).
 * 지금은 서버가 없어 같은 기기 안(localStorage, 탭 사이 storage 이벤트)으로 흉내 낸다.
 * 서버가 생기면 같은 인터페이스(`ConfirmRelay`)로 바꿔 끼운다.
 */

/** 확인 번호가 유효한 시간 */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;
/** 서명 안에 들어가는 요청자 자리(사람 이름은 두지 않는다) */
export const CONFIRM_REQUESTER = "당첨자 확인";

export type ConfirmOutcome = { ok: true } | { ok: false; reasons: string[] };

export interface OpenedConfirm {
  code: string;
  request: ConfirmRequest;
  expiresAt: number;
}

export interface ConfirmRelay {
  /** 확인하는 분: 요청을 올리고 6자리 번호를 받는다 */
  open(round: number, ticketId: Uint8Array): Promise<OpenedConfirm>;
  /** 당첨자: 번호로 요청을 찾는다. 없거나 지났거나 이미 쓴 번호면 이유를 던진다 */
  find(code: string): Promise<ConfirmRequest>;
  /** 당첨자: 서명(증명 문자열)을 올린다. 번호는 한 번만 쓸 수 있다 */
  answer(code: string, claim: string): Promise<void>;
  /** 확인하는 분: 응답을 기다린다. 끄는 함수를 돌려준다 */
  onAnswer(code: string, listener: (claim: string) => void): () => void;
  /** 확인하는 분: 검사 결과를 올린다 */
  report(code: string, outcome: ConfirmOutcome): Promise<void>;
  /** 당첨자: 결과를 기다린다 */
  onOutcome(
    code: string,
    listener: (outcome: ConfirmOutcome) => void,
  ): () => void;
}

interface Entry {
  request: string;
  expiresAt: number;
  claim?: string;
  outcome?: ConfirmOutcome;
}

/** 같은 기기 안 전달에 쓰는 저장소(기본은 localStorage). 시험은 메모리를 넣는다 */
export interface RelayStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
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
    subscribe: (listener) => {
      const handler = (e: StorageEvent) => {
        if (e.key) listener(e.key);
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}

/** 6자리 숫자(앞자리 0 포함) */
export function newConfirmCode(
  random: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n)),
): string {
  const [a = 0, b = 0, c = 0] = random(3);
  return String(((a << 16) | (b << 8) | c) % 1_000_000).padStart(6, "0");
}

export function normalizeCode(text: string): string {
  return text.replace(/\D/g, "");
}

export class LocalConfirmRelay implements ConfirmRelay {
  private listeners = new Set<(key: string) => void>();

  constructor(
    private readonly clock: Clock,
    private readonly store: RelayStore,
  ) {
    store.subscribe?.((key) => this.emit(key));
  }

  private read(code: string): Entry | null {
    const text = this.store.get(PREFIX + code);
    if (!text) return null;
    try {
      return JSON.parse(text) as Entry;
    } catch {
      return null;
    }
  }

  private write(code: string, entry: Entry): void {
    this.store.set(PREFIX + code, JSON.stringify(entry));
    this.emit(PREFIX + code);
  }

  private emit(key: string): void {
    for (const l of this.listeners) l(key);
  }

  private watch(code: string, check: (entry: Entry) => boolean): () => void {
    const listener = (key: string) => {
      if (key !== PREFIX + code) return;
      const entry = this.read(code);
      if (entry && check(entry)) this.listeners.delete(listener);
    };
    this.listeners.add(listener);
    listener(PREFIX + code);
    return () => this.listeners.delete(listener);
  }

  async open(round: number, ticketId: Uint8Array): Promise<OpenedConfirm> {
    let code = newConfirmCode();
    // 아직 살아 있는 번호와 겹치지 않게
    while (this.alive(this.read(code))) code = newConfirmCode();
    const request: ConfirmRequest = {
      // 번호는 찾는 열쇠일 뿐, 서명하는 문구는 따로 길게 만들어 미리 서명해 둘 수 없게 한다
      challenge: newChallengeText(),
      requester: CONFIRM_REQUESTER,
      round,
      ticketId,
    };
    const expiresAt = this.clock.now() + CONFIRM_TTL_MS;
    this.write(code, { request: encodeConfirmRequest(request), expiresAt });
    return { code, request, expiresAt };
  }

  private alive(entry: Entry | null): boolean {
    return !!entry && entry.expiresAt > this.clock.now() && !entry.claim;
  }

  async find(code: string): Promise<ConfirmRequest> {
    const entry = this.read(normalizeCode(code));
    if (!entry) throw new Error("없는 확인 번호입니다");
    if (entry.expiresAt <= this.clock.now())
      throw new Error("확인 번호 시간이 지났습니다(10분)");
    if (entry.claim) throw new Error("이미 쓴 확인 번호입니다");
    return decodeConfirmRequest(entry.request);
  }

  async answer(code: string, claim: string): Promise<void> {
    const key = normalizeCode(code);
    await this.find(key);
    const entry = this.read(key) as Entry;
    this.write(key, { ...entry, claim });
  }

  onAnswer(code: string, listener: (claim: string) => void): () => void {
    return this.watch(code, (entry) => {
      if (!entry.claim) return false;
      listener(entry.claim);
      return true;
    });
  }

  async report(code: string, outcome: ConfirmOutcome): Promise<void> {
    const entry = this.read(code);
    if (entry) this.write(code, { ...entry, outcome });
  }

  onOutcome(
    code: string,
    listener: (outcome: ConfirmOutcome) => void,
  ): () => void {
    return this.watch(normalizeCode(code), (entry) => {
      if (!entry.outcome) return false;
      listener(entry.outcome);
      return true;
    });
  }
}
