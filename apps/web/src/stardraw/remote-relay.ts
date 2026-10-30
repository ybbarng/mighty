import type { Clock } from "@mighty/fair-play";
import {
  decodeConfirmRequest,
  fromBase64Url,
  toBase64Url,
} from "@mighty/stardraw-core";

import type {
  ConfirmAnswer,
  ConfirmOutcome,
  ConfirmRelay,
  InvitePeek,
  OpenRequest,
} from "./confirm-relay";

/**
 * 당첨자 확인 전달의 서버 판(apps/stardraw-server `/api/confirm`). `LocalConfirmRelay`와 같은 인터페이스다.
 * 서버는 서명이 맞는 초대·응답만 받고, 결과는 요청을 붙인 기기만 올린다(붙일 때 받은 결과 열쇠를 이 기기에 둔다).
 * 확인 링크 토큰은 주소가 아니라 본문으로만 보낸다(서버 로그에 남지 않게).
 * 기다리는 쪽은 `Clock`으로 짧게 되묻는다(시험은 ManualClock).
 */

const POLL_MS = 3000;
const CHANGE_MS = 15000;

interface OpenJson {
  id: string;
  request: string;
  checkerKey: string;
  answerBy: number;
  invitedAt: number;
}

export interface TokenStore {
  get(id: string): string | null;
  set(id: string, token: string): void;
}

export function browserTokenStore(key: string): TokenStore {
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  };
  return {
    get: (id) => read()[id] ?? null,
    set: (id, token) => {
      try {
        localStorage.setItem(key, JSON.stringify({ ...read(), [id]: token }));
      } catch {
        // 저장하지 못하면 이 방문 동안만 결과를 올릴 수 있다
      }
    },
  };
}

const toOpen = (o: OpenJson): OpenRequest => ({
  id: o.id,
  request: decodeConfirmRequest(o.request),
  checkerKey: fromBase64Url(o.checkerKey),
  answerBy: o.answerBy,
  invitedAt: o.invitedAt,
});

/** 서버가 낸 오류(상태 번호를 함께 둔다) */
class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class RemoteConfirmRelay implements ConfirmRelay {
  private readonly f: typeof fetch;

  constructor(
    private readonly base: string,
    private readonly clock: Clock,
    private readonly tokens: TokenStore,
    fetchFn?: typeof fetch,
  ) {
    this.f = fetchFn ?? ((...args) => fetch(...args));
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok)
      throw new RelayError(
        json.error ?? `확인 전달에 실패했습니다(${res.status})`,
        res.status,
      );
    return json;
  }

  async invite(encoded: string): Promise<{ expiresAt: number }> {
    return this.call<{ expiresAt: number }>("/api/confirm/invites", {
      invite: encoded,
    });
  }

  async peek(token: string): Promise<InvitePeek> {
    try {
      const got = await this.call<
        | { state: "open"; round: number; ticketId: string; expiresAt: number }
        | { state: "used" }
      >("/api/confirm/peek", { token });
      return got.state === "used"
        ? got
        : { ...got, ticketId: fromBase64Url(got.ticketId) };
    } catch (err) {
      if (err instanceof RelayError && err.status === 404)
        return { state: "missing" };
      throw err;
    }
  }

  async start(token: string, checkerKey: Uint8Array): Promise<OpenRequest> {
    const created = await this.call<OpenJson & { reportKey: string }>(
      "/api/confirm/start",
      { token, checkerKey: toBase64Url(checkerKey) },
    );
    this.tokens.set(created.id, created.reportKey);
    return toOpen(created);
  }

  async openFor(ticketIds: readonly Uint8Array[]): Promise<OpenRequest[]> {
    if (ticketIds.length === 0) return [];
    const { open } = await this.call<{ open: OpenJson[] }>(
      "/api/confirm/open",
      {
        ticketIds: ticketIds.map(toBase64Url),
      },
    );
    return open.map(toOpen);
  }

  async answer(id: string, answer: ConfirmAnswer): Promise<void> {
    await this.call(
      `/api/confirm/${id}/answer`,
      "declined" in answer
        ? { declined: true }
        : { claim: answer.claim, winnerKey: toBase64Url(answer.winnerKey) },
    );
  }

  /** 조건이 맞을 때까지 되묻는다. 끄는 함수를 돌려준다 */
  private poll(
    id: string,
    take: (got: { answer: unknown; outcome: unknown }) => boolean,
  ): () => void {
    let stop: (() => void) | null = null;
    let alive = true;
    const tick = async () => {
      try {
        const got = await this.call<{ answer: unknown; outcome: unknown }>(
          `/api/confirm/${id}`,
        );
        if (!alive || take(got)) return;
      } catch {
        // 잠깐 끊겨도 다시 묻는다
      }
      if (alive) stop = this.clock.after(POLL_MS, () => void tick());
    };
    void tick();
    return () => {
      alive = false;
      stop?.();
    };
  }

  onAnswer(id: string, listener: (answer: ConfirmAnswer) => void): () => void {
    return this.poll(id, ({ answer }) => {
      if (!answer) return false;
      const a = answer as
        | { declined: true }
        | { claim: string; winnerKey: string };
      listener(
        "declined" in a
          ? { declined: true }
          : { claim: a.claim, winnerKey: fromBase64Url(a.winnerKey) },
      );
      return true;
    });
  }

  async report(id: string, outcome: ConfirmOutcome): Promise<void> {
    const reportKey = this.tokens.get(id);
    if (!reportKey) throw new Error("이 확인 요청을 만든 기기가 아닙니다");
    await this.call(`/api/confirm/${id}/report`, { reportKey, outcome });
  }

  onOutcome(
    id: string,
    listener: (outcome: ConfirmOutcome) => void,
  ): () => void {
    return this.poll(id, ({ outcome }) => {
      if (!outcome) return false;
      listener(outcome as ConfirmOutcome);
      return true;
    });
  }

  onChange(listener: () => void): () => void {
    let stop: (() => void) | null = null;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      listener();
      stop = this.clock.after(CHANGE_MS, tick);
    };
    stop = this.clock.after(CHANGE_MS, tick);
    return () => {
      alive = false;
      stop?.();
    };
  }
}
