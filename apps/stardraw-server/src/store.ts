import { DatabaseSync } from "node:sqlite";
import {
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  type KeyRegistration,
  type RoundRecord,
  recordHash,
  type Schedule,
  type Ticket,
} from "@mighty/stardraw-core";

/**
 * 서버 저장소(Node 내장 SQLite). 공개 장부 파일은 여기서 만들어 낸다(publish.ts).
 * IP는 여기에 남기지 않는다(상한 계산은 메모리에서만, limits.ts).
 */

export interface Seal {
  round: number;
  digest: Uint8Array;
  /** 투명성 로그 시각(초). 0이면 기한 안에 못 올림(무효 회차) */
  loggedAt: number;
  /** 로그 쪽 증거(Rekor 항목 등) */
  log: unknown;
}

export interface RelayRow {
  id: string;
  ticketHex: string;
  payload: string;
  answerBy: number;
  keepUntil: number;
}

const blob = (b: Uint8Array) => new Uint8Array(b);
const bytes = (v: unknown) => new Uint8Array(v as Uint8Array);

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries (
        round INTEGER NOT NULL,
        ticket_id TEXT NOT NULL PRIMARY KEY,
        entrant TEXT NOT NULL,
        ticket BLOB NOT NULL,
        received_at INTEGER NOT NULL,
        UNIQUE (round, entrant)
      );
      CREATE TABLE IF NOT EXISTS registrations (
        entrant TEXT NOT NULL PRIMARY KEY,
        credential TEXT,
        round INTEGER NOT NULL,
        reg BLOB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS registrations_credential
        ON registrations (credential) WHERE credential IS NOT NULL;
      CREATE TABLE IF NOT EXISTS seals (
        round INTEGER PRIMARY KEY,
        digest BLOB NOT NULL,
        logged_at INTEGER NOT NULL,
        log TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        round INTEGER PRIMARY KEY,
        record BLOB NOT NULL,
        hash BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relay (
        id TEXT PRIMARY KEY,
        ticket TEXT NOT NULL,
        payload TEXT NOT NULL,
        answer_by INTEGER NOT NULL,
        keep_until INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS relay_ticket ON relay (ticket);
    `);
  }

  close(): void {
    this.db.close();
  }

  /** 처음 일정표(장부가 처음 만들어질 때 한 번 정해지고 바뀌지 않는다) */
  genesis(fallback: Schedule): Schedule {
    const row = this.db.prepare("SELECT v FROM meta WHERE k = 'genesis'").get();
    if (row) return JSON.parse(String(row.v)) as Schedule;
    this.db
      .prepare("INSERT INTO meta (k, v) VALUES ('genesis', ?)")
      .run(JSON.stringify(fallback));
    return fallback;
  }

  // ── 응모권 ──

  addEntry(
    round: number,
    idHex: string,
    entrantHex: string,
    t: Ticket,
    receivedAt: number,
  ): void {
    this.db
      .prepare(
        "INSERT INTO entries (round, ticket_id, entrant, ticket, received_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(round, idHex, entrantHex, blob(encodeTicket(t)), receivedAt);
  }

  hasEntry(round: number, entrantHex: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM entries WHERE round = ? AND entrant = ?")
      .get(round, entrantHex);
  }

  entries(round: number): Ticket[] {
    return this.db
      .prepare("SELECT ticket FROM entries WHERE round = ?")
      .all(round)
      .map((r) => decodeTicket(bytes(r.ticket)));
  }

  entryCount(round: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM entries WHERE round = ?")
      .get(round);
    return Number(row?.n ?? 0);
  }

  // ── 열쇠 등록 ──

  isRegistered(entrantHex: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM registrations WHERE entrant = ?")
      .get(entrantHex);
  }

  credentialTaken(credentialHex: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM registrations WHERE credential = ?")
      .get(credentialHex);
  }

  /** 패스키 번호로 등록을 찾는다(다른 기기에서 내 패스키 찾기) */
  registrationByCredential(credentialHex: string): KeyRegistration | null {
    const row = this.db
      .prepare("SELECT reg FROM registrations WHERE credential = ?")
      .get(credentialHex);
    return row ? decodeRegistration(bytes(row.reg)) : null;
  }

  addRegistration(
    round: number,
    entrantHex: string,
    credentialHex: string | null,
    r: KeyRegistration,
  ): void {
    this.db
      .prepare(
        "INSERT INTO registrations (entrant, credential, round, reg) VALUES (?, ?, ?, ?)",
      )
      .run(entrantHex, credentialHex, round, blob(encodeRegistration(r)));
  }

  registrations(round: number): KeyRegistration[] {
    return this.db
      .prepare("SELECT reg FROM registrations WHERE round = ?")
      .all(round)
      .map((r) => decodeRegistration(bytes(r.reg)));
  }

  /** 한 거래로 묶어 돌린다(응모권과 등록을 함께 넣을 때) */
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  // ── 봉인 ──

  seal(round: number): Seal | null {
    const row = this.db
      .prepare("SELECT * FROM seals WHERE round = ?")
      .get(round);
    if (!row) return null;
    return {
      round,
      digest: bytes(row.digest),
      loggedAt: Number(row.logged_at),
      log: JSON.parse(String(row.log)),
    };
  }

  lastSealed(): number {
    const row = this.db.prepare("SELECT MAX(round) AS r FROM seals").get();
    return Number(row?.r ?? 0);
  }

  addSeal(s: Seal): void {
    this.db
      .prepare(
        "INSERT INTO seals (round, digest, logged_at, log) VALUES (?, ?, ?, ?)",
      )
      .run(s.round, blob(s.digest), s.loggedAt, JSON.stringify(s.log ?? null));
  }

  // ── 회차 기록 ──

  recordCount(): number {
    const row = this.db.prepare("SELECT MAX(round) AS r FROM records").get();
    return Number(row?.r ?? 0);
  }

  record(round: number): RoundRecord | null {
    const row = this.db
      .prepare("SELECT record FROM records WHERE round = ?")
      .get(round);
    return row ? decodeRecord(bytes(row.record)) : null;
  }

  addRecord(r: RoundRecord): void {
    this.db
      .prepare("INSERT INTO records (round, record, hash) VALUES (?, ?, ?)")
      .run(r.round, blob(encodeRecord(r)), blob(recordHash(r)));
  }

  // ── 당첨자 확인 전달 ──

  relayPut(row: RelayRow): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO relay (id, ticket, payload, answer_by, keep_until) VALUES (?, ?, ?, ?, ?)",
      )
      .run(row.id, row.ticketHex, row.payload, row.answerBy, row.keepUntil);
  }

  relayGet(id: string): RelayRow | null {
    const r = this.db.prepare("SELECT * FROM relay WHERE id = ?").get(id);
    return r ? toRelayRow(r) : null;
  }

  relayByTickets(ticketHexes: readonly string[]): RelayRow[] {
    if (ticketHexes.length === 0) return [];
    const marks = ticketHexes.map(() => "?").join(",");
    return this.db
      .prepare(`SELECT * FROM relay WHERE ticket IN (${marks})`)
      .all(...ticketHexes)
      .map(toRelayRow);
  }

  relayPrune(now: number): void {
    this.db.prepare("DELETE FROM relay WHERE keep_until <= ?").run(now);
  }
}

function toRelayRow(r: Record<string, unknown>): RelayRow {
  return {
    id: String(r.id),
    ticketHex: String(r.ticket),
    payload: String(r.payload),
    answerBy: Number(r.answer_by),
    keepUntil: Number(r.keep_until),
  };
}
