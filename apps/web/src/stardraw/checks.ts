import type { Clock } from "@mighty/fair-play";
import {
  decodeConfirmRequest,
  encodeConfirmRequest,
  fromBase64Url,
  generateSasKey,
  inviteTokenHash,
  type Rank,
  type Ticket,
  toBase64Url,
  toHex,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { checkAnswer, starsMatch } from "./confirm";
import type { ConfirmAnswer, ConfirmRelay } from "./confirm-relay";

/**
 * 확인하는 사람 기기의 확인 기록(docs/36 11-2). 서버·장부에 올리지 않고 이 기기(IndexedDB)에만 둔다.
 * - 확인은 당첨자가 보낸 확인 링크 한 건 단위다. 「확인 시작」하면 임시 ECDH 열쇠를 만들어 그 링크에 요청을 붙인다
 * - 당첨자는 24시간 안에 답한다. 서명이 맞으면 별 세 개를 기다리고, 그 뒤에는 기한이 없다
 * - 상대가 보낸 별 세 개가 맞으면 초록불. 세 번 틀리면 닫는다(당첨자에게 새 링크를 받는다)
 * - 초록불이 켜진 응모권은 확인한 날짜와 함께 남아, 이 기기의 지난 회차 화면에 "확인함 · 10/30"으로 보인다
 * 임시 비밀 열쇠는 꺼낼 수 없는 CryptoKey라 IndexedDB에 그대로 둔다. 같은 링크를 다시 열면 이어서 확인한다.
 */

export const MAX_WRONG_TRIES = 3;

export type CheckStatus =
  /** 당첨자의 응답을 기다린다 */
  | "waiting"
  /** 서명이 맞았다. 별 세 개를 기다린다 */
  | "signed"
  | "confirmed"
  | "declined"
  | "failed";

export interface CheckSession {
  /** 전달 요청 id */
  key: string;
  /** 확인 링크 토큰의 해시(hex). 같은 링크를 다시 열면 이 기록으로 이어 간다 */
  linkHash: string;
  round: number;
  rank: Rank;
  /** 응모권 id(hex) */
  ticketId: string;
  /** 서명할 확인 요청(encodeConfirmRequest) */
  request: string;
  createdAt: number;
  answerBy: number;
  checkerKey: Uint8Array;
  privateKey: CryptoKey;
  status: CheckStatus;
  reasons?: string[];
  /** 서명이 맞은 뒤 계산한 별 세 개(이 기기에만) */
  stars?: number[];
  confirmedAt?: number;
  wrongTries: number;
}

/** 아직 끝나지 않은 확인: 응답이나 별 세 개를 기다린다 */
export function isActive(s: CheckSession): boolean {
  return s.status === "waiting" || s.status === "signed";
}

export function linkHashOf(token: string): string {
  return toHex(inviteTokenHash(token));
}

export interface CheckStore {
  list(): Promise<CheckSession[]>;
  put(session: CheckSession): Promise<void>;
}

export type StarsResult =
  | { kind: "confirmed" }
  | { kind: "wrong"; left: number }
  | { kind: "closed" };

export class Checker {
  constructor(
    private readonly relay: ConfirmRelay,
    private readonly store: CheckStore,
    private readonly clock: Clock,
    private readonly policy: WebAuthnPolicy,
  ) {}

  list(): Promise<CheckSession[]> {
    return this.store.list();
  }

  /** 이 링크로 이 기기에서 시작한 확인. 없으면 null */
  async byLink(token: string): Promise<CheckSession | null> {
    const hash = linkHashOf(token);
    return (await this.store.list()).find((s) => s.linkHash === hash) ?? null;
  }

  /** 이미 확인한 응모권(hex) → 그 기록 */
  async confirmed(): Promise<Map<string, CheckSession>> {
    const out = new Map<string, CheckSession>();
    for (const s of await this.store.list())
      if (s.status === "confirmed" && !out.has(s.ticketId))
        out.set(s.ticketId, s);
    return out;
  }

  /** 「확인 시작」: 임시 ECDH 열쇠를 만들어 링크에 요청을 붙인다(링크는 이때 쓰여 닫힌다) */
  async start(token: string, rank: Rank): Promise<CheckSession> {
    const existing = await this.byLink(token);
    if (existing) return existing;
    const key = await generateSasKey();
    const opened = await this.relay.start(token, key.publicKey);
    const session: CheckSession = {
      key: opened.id,
      linkHash: linkHashOf(token),
      round: opened.request.round,
      rank,
      ticketId: toHex(opened.request.ticketId),
      request: encodeConfirmRequest(opened.request),
      createdAt: this.clock.now(),
      answerBy: opened.answerBy,
      checkerKey: key.publicKey,
      privateKey: key.privateKey,
      status: "waiting",
      wrongTries: 0,
    };
    await this.store.put(session);
    return session;
  }

  /**
   * 응답을 기다린다. 오면 서명을 검사해 상태를 바꾸고 저장한 뒤 알린다.
   * `ticketOf`는 장부에서 응모권을 찾는다. 끄는 함수를 돌려준다
   */
  watch(
    session: CheckSession,
    ticketOf: (round: number, ticketIdHex: string) => Ticket | undefined,
    onUpdate: (session: CheckSession) => void,
  ): () => void {
    if (session.status !== "waiting") return () => {};
    return this.relay.onAnswer(session.key, (answer) => {
      void this.receive(session, answer, ticketOf).then(() =>
        onUpdate(session),
      );
    });
  }

  private async receive(
    s: CheckSession,
    answer: ConfirmAnswer,
    ticketOf: (round: number, ticketIdHex: string) => Ticket | undefined,
  ): Promise<void> {
    if (s.status !== "waiting") return;
    const ticket = ticketOf(s.round, s.ticketId);
    if (!ticket) {
      s.status = "failed";
      s.reasons = ["장부에서 그 응모권을 찾지 못했습니다"];
    } else {
      const result = await checkAnswer(
        answer,
        {
          id: s.key,
          request: decodeConfirmRequest(s.request),
          checkerKey: s.checkerKey,
        },
        s.privateKey,
        ticket,
        this.policy,
      );
      if ("declined" in result) s.status = "declined";
      else if (!result.ok) {
        s.status = "failed";
        s.reasons = result.reasons;
      } else {
        s.status = "signed";
        s.stars = result.stars;
      }
    }
    if (s.status === "declined")
      await this.relay.report(s.key, { declined: true });
    if (s.status === "failed")
      await this.relay.report(s.key, { ok: false, reasons: s.reasons ?? [] });
    await this.store.put(s);
  }

  /** 상대가 보낸 별 세 개(누른 차례) */
  async enterStars(
    s: CheckSession,
    entered: readonly number[],
  ): Promise<StarsResult> {
    if (s.status === "confirmed") return { kind: "confirmed" };
    if (s.status !== "signed" || !s.stars) return { kind: "closed" };
    if (starsMatch(s.stars, entered)) {
      s.status = "confirmed";
      s.confirmedAt = this.clock.now();
      await this.relay.report(s.key, { ok: true });
      await this.store.put(s);
      return { kind: "confirmed" };
    }
    s.wrongTries++;
    if (s.wrongTries >= MAX_WRONG_TRIES) {
      s.status = "failed";
      s.reasons = ["별 세 개가 세 번 맞지 않아 확인을 닫았습니다"];
      await this.relay.report(s.key, { ok: false, reasons: s.reasons });
      await this.store.put(s);
      return { kind: "closed" };
    }
    await this.store.put(s);
    return { kind: "wrong", left: MAX_WRONG_TRIES - s.wrongTries };
  }
}

/** 확인 기록을 이 기기 IndexedDB에 둔다(2판: 링크 한 건 단위. 1판의 회차·등수 묶음 기록은 버린다) */
export function browserCheckStore(dbName = "stardraw-checks"): CheckStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (db.objectStoreNames.contains("batches"))
          db.deleteObjectStore("batches");
        if (!db.objectStoreNames.contains("sessions"))
          db.createObjectStore("sessions", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    async list() {
      const db = await open();
      const rows = await new Promise<CheckSession[]>((resolve, reject) => {
        const req = db
          .transaction("sessions", "readonly")
          .objectStore("sessions")
          .getAll();
        req.onsuccess = () => resolve(req.result as CheckSession[]);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    async put(session) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put(session);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
  };
}

/** 시험용 메모리 저장소(값을 복사해 IndexedDB처럼 따로 둔다) */
export function memoryCheckStore(): CheckStore {
  const rows = new Map<string, CheckSession>();
  const copy = (s: CheckSession): CheckSession => ({
    ...s,
    checkerKey: fromBase64Url(toBase64Url(s.checkerKey)),
    ...(s.stars ? { stars: [...s.stars] } : {}),
    ...(s.reasons ? { reasons: [...s.reasons] } : {}),
  });
  return {
    async list() {
      return [...rows.values()]
        .map(copy)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async put(session) {
      rows.set(session.key, copy(session));
    },
  };
}
