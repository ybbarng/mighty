import { DatabaseSync } from "node:sqlite";
import {
  decodeOperation,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  encodeOperation,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  type KeyRegistration,
  type Operation,
  type RoundRecord,
  recordHash,
  type Schedule,
  type ScheduleEntry,
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

/** 당첨자 확인 링크 초대(토큰 해시만 둔다) */
export interface InviteRow {
  tokenHash: string;
  ticketHex: string;
  round: number;
  createdAt: number;
  expiresAt: number;
  /** 쓰였으면 붙은 확인 요청 id */
  requestId: string | null;
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
      CREATE TABLE IF NOT EXISTS invites (
        token_hash TEXT PRIMARY KEY,
        ticket TEXT NOT NULL,
        round INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        request_id TEXT
      );
      CREATE INDEX IF NOT EXISTS invites_ticket ON invites (ticket);
      CREATE TABLE IF NOT EXISTS director_ops (
        id TEXT PRIMARY KEY,
        op BLOB NOT NULL,
        received_at INTEGER NOT NULL
      );
    `);
    // 2026-10-30 확인 링크로 바꾸며 옛 방식(회차·등수 묶음 요청) 요청을 버린다. 한 번만
    const moved = this.db
      .prepare("SELECT v FROM meta WHERE k = 'relay-invites'")
      .get();
    if (!moved) {
      this.db.exec("DELETE FROM relay");
      this.db
        .prepare("INSERT INTO meta (k, v) VALUES ('relay-invites', '1')")
        .run();
    }
  }

  close(): void {
    this.db.close();
  }

  /** 처음 일정표(장부가 처음 만들어질 때 한 번 정해지고 바뀌지 않는다) */
  genesis(fallback: Schedule): Schedule {
    const stored = this.storedGenesis();
    if (stored) return stored;
    this.db
      .prepare("INSERT INTO meta (k, v) VALUES ('genesis', ?)")
      .run(JSON.stringify(fallback));
    return fallback;
  }

  /** 이미 정해진 처음 일정표(없으면 null) */
  storedGenesis(): Schedule | null {
    const row = this.db.prepare("SELECT v FROM meta WHERE k = 'genesis'").get();
    return row ? (JSON.parse(String(row.v)) as Schedule) : null;
  }

  /**
   * 장부에 넣을 일정 바꾸기(정식 단계 예약 등, `schedule-live` 명령이 넣는다).
   * 엔진이 다음에 닫는 회차 기록에 싣고 지운다. 없으면 null
   */
  pendingChange(): ScheduleEntry | null {
    const row = this.db
      .prepare("SELECT v FROM meta WHERE k = 'pendingChange'")
      .get();
    return row ? (JSON.parse(String(row.v)) as ScheduleEntry) : null;
  }

  setPendingChange(change: ScheduleEntry | null): void {
    if (!change) {
      this.db.prepare("DELETE FROM meta WHERE k = 'pendingChange'").run();
      return;
    }
    this.db
      .prepare(
        "INSERT INTO meta (k, v) VALUES ('pendingChange', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      )
      .run(JSON.stringify(change));
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

  /** 이 열쇠가 등록된 회차(없으면 null). 등록 회차는 닫히면 그 회차 공개 장부 파일에도 드러난다 */
  registrationRound(entrantHex: string): number | null {
    const row = this.db
      .prepare("SELECT round FROM registrations WHERE entrant = ?")
      .get(entrantHex);
    return row ? Number(row.round) : null;
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

  // ── 앵커 ──

  /** 앵커를 남긴 마지막 회차(차례대로 남긴다). 없으면 0 */
  anchored(): number {
    const row = this.db
      .prepare("SELECT v FROM meta WHERE k = 'anchored'")
      .get();
    return row ? Number(row.v) : 0;
  }

  /** 처음 일정표를 앵커(main의 genesis.txt)에 남겼는지 */
  genesisAnchored(): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM meta WHERE k = 'genesisAnchored'")
      .get();
  }

  setGenesisAnchored(): void {
    this.db
      .prepare(
        "INSERT INTO meta (k, v) VALUES ('genesisAnchored', '1') ON CONFLICT(k) DO NOTHING",
      )
      .run();
  }

  /** 앵커 저장소의 그 브랜치에 장부 JSON 사본을 올린 마지막 회차(1회차부터 빈틈없이). 없으면 0 */
  mirrored(branch: string): number {
    const row = this.db
      .prepare("SELECT v FROM meta WHERE k = ?")
      .get(`mirrored:${branch}`);
    return row ? Number(row.v) : 0;
  }

  setMirrored(branch: string, round: number): void {
    this.db
      .prepare(
        "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      )
      .run(`mirrored:${branch}`, String(round));
  }

  setAnchored(round: number): void {
    this.db
      .prepare(
        "INSERT INTO meta (k, v) VALUES ('anchored', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      )
      .run(String(round));
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

  // ── 국장 요청(다음 기록에 실을 운영 기록, docs/36 11-12) ──

  /** 받아 두고 아직 기록에 싣지 않은 국장 운영 기록(받은 차례) */
  directorOps(): { id: string; op: Operation }[] {
    return this.db
      .prepare("SELECT id, op FROM director_ops ORDER BY received_at, id")
      .all()
      .map((r) => ({ id: String(r.id), op: decodeOperation(bytes(r.op)) }));
  }

  addDirectorOp(id: string, op: Operation, receivedAt: number): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO director_ops (id, op, received_at) VALUES (?, ?, ?)",
      )
      .run(id, blob(encodeOperation(op)), receivedAt);
  }

  removeDirectorOps(ids: readonly string[]): void {
    const stmt = this.db.prepare("DELETE FROM director_ops WHERE id = ?");
    for (const id of ids) stmt.run(id);
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
    this.db.prepare("DELETE FROM invites WHERE expires_at <= ?").run(now);
  }

  /** 새 초대. 같은 토큰 해시가 이미 있으면 false */
  inviteAdd(row: InviteRow): boolean {
    const r = this.db
      .prepare(
        "INSERT OR IGNORE INTO invites (token_hash, ticket, round, created_at, expires_at, request_id) VALUES (?, ?, ?, ?, ?, NULL)",
      )
      .run(
        row.tokenHash,
        row.ticketHex,
        row.round,
        row.createdAt,
        row.expiresAt,
      );
    return Number(r.changes) === 1;
  }

  inviteGet(tokenHash: string): InviteRow | null {
    const r = this.db
      .prepare("SELECT * FROM invites WHERE token_hash = ?")
      .get(tokenHash);
    return r
      ? {
          tokenHash: String(r.token_hash),
          ticketHex: String(r.ticket),
          round: Number(r.round),
          createdAt: Number(r.created_at),
          expiresAt: Number(r.expires_at),
          requestId: r.request_id === null ? null : String(r.request_id),
        }
      : null;
  }

  /** 그 응모권의 아직 쓰이지 않고 기한이 남은 초대 수 */
  invitesOpen(ticketHex: string, now: number): number {
    const r = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM invites WHERE ticket = ? AND request_id IS NULL AND expires_at > ?",
      )
      .get(ticketHex, now);
    return Number(r?.n ?? 0);
  }

  /** 초대를 쓴다(한 번만). 이미 쓰였으면 false */
  inviteUse(tokenHash: string, requestId: string): boolean {
    const r = this.db
      .prepare(
        "UPDATE invites SET request_id = ? WHERE token_hash = ? AND request_id IS NULL",
      )
      .run(requestId, tokenHash);
    return Number(r.changes) === 1;
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
