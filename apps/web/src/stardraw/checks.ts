import type { Clock } from "@mighty/fair-play";
import {
  type ConfirmRequest,
  decodeConfirmRequest,
  encodeConfirmRequest,
  fromBase64Url,
  generateSasKey,
  type Rank,
  type Ticket,
  ticketId,
  toBase64Url,
  toHex,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { checkAnswer, starsMatch } from "./confirm";
import type { ConfirmAnswer, ConfirmRelay } from "./confirm-relay";

/**
 * 확인하는 분 기기의 확인 기록(docs/36 11-2). 서버·장부에 올리지 않고 이 기기(IndexedDB)에만 둔다.
 * - 「당첨자 확인」은 "회차·등수" 묶음 단위다. 그 등수의 아직 확인 안 된 응모권 모두에 요청을 한 번에 보낸다
 *   (임시 ECDH 열쇠는 묶음에 하나, 요청 id는 응모권마다). 같은 회차·등수에 열린 묶음은 하나뿐이다
 * - 당첨자는 24시간 안에 답한다. 서명이 맞으면 별 세 개를 기다리고, 그 뒤에는 기한이 없다
 * - 상대가 보낸 별 세 개를 누르면 묶음의 응모권 중 어느 것의 별인지 찾는다. 세 번 틀리면 묶음을 닫는다
 * - 초록불이 켜진 응모권은 확인한 날짜와 함께 남아, 이 기기의 지난 회차 화면에 "확인함 · 10/30"으로 보인다
 * 임시 비밀 열쇠는 꺼낼 수 없는 CryptoKey라 IndexedDB에 그대로 둔다. 화면을 닫았다 열어도 이어서 확인한다.
 */

export const MAX_WRONG_TRIES = 3;

/** 아직 끝나지 않은 묶음: 닫히지 않았고, 응답이나 별 세 개를 기다리는 응모권이 있다 */
export function isActive(batch: CheckBatch): boolean {
  return (
    !batch.closed &&
    batch.tickets.some((t) => t.status === "waiting" || t.status === "signed")
  );
}

export type CheckStatus =
  /** 당첨자의 응답을 기다린다 */
  | "waiting"
  /** 서명이 맞았다. 별 세 개를 기다린다 */
  | "signed"
  | "confirmed"
  | "declined"
  | "failed";

export interface CheckTicket {
  /** 전달 요청 id */
  requestId: string;
  ticketId: string;
  /** 서명한 확인 요청(encodeConfirmRequest) */
  request: string;
  status: CheckStatus;
  reasons?: string[];
  /** 서명이 맞은 뒤 계산한 별 세 개(이 기기에만) */
  stars?: number[];
  confirmedAt?: number;
}

export interface CheckBatch {
  key: string;
  round: number;
  rank: Rank;
  requester: string;
  createdAt: number;
  answerBy: number;
  checkerKey: Uint8Array;
  privateKey: CryptoKey;
  tickets: CheckTicket[];
  wrongTries: number;
  closed: boolean;
}

export interface CheckStore {
  list(): Promise<CheckBatch[]>;
  put(batch: CheckBatch): Promise<void>;
}

export type StarsResult =
  | { kind: "confirmed"; ticketId: string; of: number }
  | { kind: "already"; ticketId: string }
  | { kind: "wrong"; left: number }
  | { kind: "closed" };

export class Checker {
  constructor(
    private readonly relay: ConfirmRelay,
    private readonly store: CheckStore,
    private readonly clock: Clock,
    private readonly policy: WebAuthnPolicy,
  ) {}

  list(): Promise<CheckBatch[]> {
    return this.store.list();
  }

  /** 그 회차·등수에 아직 끝나지 않은 묶음(응답이나 별 세 개를 기다리는 응모권이 있다). 없으면 null */
  async openBatch(round: number, rank: Rank): Promise<CheckBatch | null> {
    return (
      (await this.store.list()).find(
        (b) => b.round === round && b.rank === rank && isActive(b),
      ) ?? null
    );
  }

  /** 이미 확인한 응모권(hex) → 그 기록 */
  async confirmed(): Promise<
    Map<string, CheckTicket & { round: number; rank: Rank }>
  > {
    const out = new Map<string, CheckTicket & { round: number; rank: Rank }>();
    for (const b of await this.store.list())
      for (const t of b.tickets)
        if (t.status === "confirmed")
          out.set(t.ticketId, { ...t, round: b.round, rank: b.rank });
    return out;
  }

  /** 「당첨자 확인」: 열린 묶음이 있으면 그것을, 없으면 아직 확인 안 된 응모권 모두에 요청을 보낸다 */
  async start(
    round: number,
    rank: Rank,
    tickets: readonly Ticket[],
    requester: string,
  ): Promise<CheckBatch> {
    const existing = await this.openBatch(round, rank);
    if (existing) return existing;
    const done = await this.confirmed();
    const targets = tickets.filter((t) => !done.has(toHex(ticketId(t))));
    if (targets.length === 0)
      throw new Error("이 등수의 응모권은 모두 확인했습니다");
    const key = await generateSasKey();
    const now = this.clock.now();
    let answerBy = now;
    const out: CheckTicket[] = [];
    for (const t of targets) {
      const opened = await this.relay.create(
        round,
        ticketId(t),
        requester,
        key.publicKey,
      );
      answerBy = Math.max(answerBy, opened.answerBy);
      out.push({
        requestId: opened.id,
        ticketId: toHex(ticketId(t)),
        request: encodeConfirmRequest(opened.request),
        status: "waiting",
      });
    }
    const batch: CheckBatch = {
      key: `${round}-${rank}-${now}`,
      round,
      rank,
      requester,
      createdAt: now,
      answerBy,
      checkerKey: key.publicKey,
      privateKey: key.privateKey,
      tickets: out,
      wrongTries: 0,
      closed: false,
    };
    await this.store.put(batch);
    return batch;
  }

  /**
   * 열린 묶음의 응답을 기다린다. 오면 서명을 검사해 상태를 바꾸고 저장한 뒤 알린다.
   * `ticketOf`는 장부에서 응모권을 찾는다. 끄는 함수를 돌려준다
   */
  watch(
    batch: CheckBatch,
    ticketOf: (round: number, ticketIdHex: string) => Ticket | undefined,
    onUpdate: (batch: CheckBatch) => void,
  ): () => void {
    const stops = batch.tickets
      .filter((t) => t.status === "waiting")
      .map((t) =>
        this.relay.onAnswer(t.requestId, (answer) => {
          void this.receive(batch, t, answer, ticketOf).then(() =>
            onUpdate(batch),
          );
        }),
      );
    return () => {
      for (const s of stops) s();
    };
  }

  private async receive(
    batch: CheckBatch,
    entry: CheckTicket,
    answer: ConfirmAnswer,
    ticketOf: (round: number, ticketIdHex: string) => Ticket | undefined,
  ): Promise<void> {
    if (entry.status !== "waiting") return;
    const ticket = ticketOf(batch.round, entry.ticketId);
    const request: ConfirmRequest = decodeConfirmRequest(entry.request);
    if (!ticket) {
      entry.status = "failed";
      entry.reasons = ["장부에서 그 응모권을 찾지 못했습니다"];
    } else {
      const result = await checkAnswer(
        answer,
        { id: entry.requestId, request, checkerKey: batch.checkerKey },
        batch.privateKey,
        ticket,
        this.policy,
      );
      if ("declined" in result) entry.status = "declined";
      else if (!result.ok) {
        entry.status = "failed";
        entry.reasons = result.reasons;
      } else {
        entry.status = "signed";
        entry.stars = result.stars;
      }
    }
    if (entry.status === "declined")
      await this.relay.report(entry.requestId, { declined: true });
    if (entry.status === "failed")
      await this.relay.report(entry.requestId, {
        ok: false,
        reasons: entry.reasons ?? [],
      });
    await this.store.put(batch);
  }

  /** 상대가 보낸 별 세 개(누른 차례) */
  async enterStars(
    batch: CheckBatch,
    entered: readonly number[],
  ): Promise<StarsResult> {
    if (batch.closed) return { kind: "closed" };
    const hit = batch.tickets.find(
      (t) =>
        (t.status === "signed" || t.status === "confirmed") &&
        t.stars &&
        starsMatch(t.stars, entered),
    );
    if (hit?.status === "confirmed")
      return { kind: "already", ticketId: hit.ticketId };
    if (hit) {
      hit.status = "confirmed";
      hit.confirmedAt = this.clock.now();
      await this.relay.report(hit.requestId, { ok: true });
      await this.store.put(batch);
      return {
        kind: "confirmed",
        ticketId: hit.ticketId,
        of: batch.tickets.length,
      };
    }
    batch.wrongTries++;
    if (batch.wrongTries >= MAX_WRONG_TRIES) {
      batch.closed = true;
      for (const t of batch.tickets)
        if (t.status === "signed" || t.status === "waiting") {
          t.status = "failed";
          t.reasons = ["별 세 개가 세 번 맞지 않아 요청을 닫았습니다"];
          await this.relay.report(t.requestId, {
            ok: false,
            reasons: t.reasons,
          });
        }
      await this.store.put(batch);
      return { kind: "closed" };
    }
    await this.store.put(batch);
    return { kind: "wrong", left: MAX_WRONG_TRIES - batch.wrongTries };
  }

  /** 다 끝난 묶음(모두 확인·거절·실패)이나 손으로 닫는다 */
  async close(batch: CheckBatch): Promise<void> {
    batch.closed = true;
    await this.store.put(batch);
  }
}

/** 확인 기록을 이 기기 IndexedDB에 둔다 */
export function browserCheckStore(dbName = "stardraw-checks"): CheckStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("batches", { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    async list() {
      const db = await open();
      const rows = await new Promise<CheckBatch[]>((resolve, reject) => {
        const req = db
          .transaction("batches", "readonly")
          .objectStore("batches")
          .getAll();
        req.onsuccess = () => resolve(req.result as CheckBatch[]);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    async put(batch) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("batches", "readwrite");
        tx.objectStore("batches").put(batch);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
  };
}

/** 시험용 메모리 저장소(값을 복사해 IndexedDB처럼 따로 둔다) */
export function memoryCheckStore(): CheckStore {
  const rows = new Map<string, CheckBatch>();
  const copy = (b: CheckBatch): CheckBatch => ({
    ...b,
    checkerKey: fromBase64Url(toBase64Url(b.checkerKey)),
    tickets: b.tickets.map((t) => ({ ...t })),
  });
  return {
    async list() {
      return [...rows.values()]
        .map(copy)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async put(batch) {
      rows.set(batch.key, copy(batch));
    },
  };
}
