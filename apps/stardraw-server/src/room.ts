import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Clock } from "@mighty/fair-play";
import {
  drandRoundForClose,
  drandTime,
  ROOM_TEXT_MAX,
  type RoomModAction,
  roomCharCount,
  roomModMessage,
  roomPassMessage,
  roundTimes,
  type Schedule,
  type SignatureData,
  type Ticket,
  toBase64Url,
  toHex,
  verifyEntrantSignature,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { EntryError } from "./engine";

/**
 * 회차 방(docs/36 11-23): 실시간 추첨을 함께 보고 말하고 응원하는 곳.
 * 모든 것이 메모리에만 있다. 말은 그 순간 연결된 사람들에게 건네고 버린다(장부·디스크에 남기지 않는다).
 * 서명 내용(대화 표·국장 조치)은 화면과 같이 쓰려고 규칙 패키지(room.ts)에 있다
 */

export interface RoomLimits {
  /** 말 길이(글자) */
  textMax: number;
  /** 표마다 말 사이(ms)와 몰아서 낼 수 있는 수 */
  sayIntervalMs: number;
  sayBurst: number;
  /** 응원 사이(ms) */
  cheerIntervalMs: number;
  /** 추첨 뒤 방을 닫기까지(ms) */
  closeAfterMs: number;
  /** 한 번 쓰는 값이 살아 있는 시간(ms) */
  nonceTtlMs: number;
  maxConnections: number;
  maxPasses: number;
  maxNonces: number;
  /** 서버 전체에 동시에 둘 방 수 */
  maxRooms: number;
  /** 시각 알림 사이(ms). 스트림이 끊기지 않게도 */
  heartbeatMs: number;
}

export const DEFAULT_ROOM_LIMITS: RoomLimits = {
  textMax: ROOM_TEXT_MAX,
  sayIntervalMs: 2500,
  sayBurst: 3,
  cheerIntervalMs: 800,
  closeAfterMs: 7 * 60_000,
  nonceTtlMs: 120_000,
  maxConnections: 600,
  maxPasses: 600,
  maxNonces: 2000,
  maxRooms: 4,
  heartbeatMs: 15_000,
};

/** 방이 서버에서 읽는 것 */
export interface RoomDeps {
  clock: Clock;
  policy: WebAuthnPolicy;
  schedule: () => Schedule;
  isRegistered: (pub: Uint8Array) => boolean;
  isDirector: (pub: Uint8Array) => boolean;
  /** 봉인(마감)이 끝났는지 */
  sealed: (round: number) => boolean;
  /** 그 회차 응모권(봉인 뒤 공개되는 것) */
  tickets: (round: number) => Ticket[];
  /** 회차 기록이 닫혔는지(결과가 나왔는지) */
  drawn: (round: number) => boolean;
}

/** 방 이벤트(스트림 한 줄) */
export type RoomEvent =
  | {
      type: "hello";
      serverTime: number;
      round: number;
      drawAt: number;
      entryDeadline: number;
      closesAt: number;
      me: string | null;
      people: Person[];
      watchers: number;
      sealed: boolean;
      drawn: boolean;
      picks: Picks | null;
    }
  | { type: "time"; serverTime: number }
  | { type: "join"; person: Person }
  | { type: "leave"; id: string }
  | { type: "watchers"; count: number }
  | { type: "say"; id: string; from: string; text: string; at: number }
  | {
      type: "cheer";
      from: string;
      kind: "twinkle" | "meteor";
      to: string | null;
    }
  | { type: "hide"; id: string }
  | { type: "kicked"; id: string }
  | { type: "sealed"; picks: Picks }
  | { type: "drawn" }
  | { type: "closed" };

/** 방 안 사람(표 하나). `pub`으로 화면이 얼굴·이름을 계산한다 */
export interface Person {
  id: string;
  pub: string;
  entered: boolean;
  /** 국장 패스키로 받은 표(국장 조치를 쓸 수 있다) */
  director?: boolean;
}

/** 봉인 뒤 공개: 별마다 고른 수와 사람마다 고른 6개 */
export interface Picks {
  counts: Record<number, number>;
  byPerson: Record<string, number[]>;
}

interface Pass {
  token: string;
  id: string;
  pub: Uint8Array;
  pubHex: string;
  issuedAt: number;
  director: boolean;
  sayTokens: number;
  sayRefillAt: number;
  lastCheer: number;
  kicked: boolean;
}

interface Connection {
  res: ServerResponse;
  pass: Pass | null;
}

interface Room {
  round: number;
  drawAt: number;
  entryDeadline: number;
  closesAt: number;
  passes: Map<string, Pass>;
  nonces: Map<string, number>;
  connections: Set<Connection>;
  reports: Map<string, Set<string>>;
  sealedSent: boolean;
  drawnSent: boolean;
  closed: boolean;
  messageSeq: number;
}

const sec = (ms: number) => Math.floor(ms / 1000);

export type ModAction = RoomModAction;
export { roomModMessage, roomPassMessage };

const charCount = roomCharCount;

export class RoomHub {
  private rooms = new Map<number, Room>();
  private stopBeat: () => void;

  constructor(
    private deps: RoomDeps,
    private limits: RoomLimits = DEFAULT_ROOM_LIMITS,
  ) {
    const beat = () => {
      this.tick();
      this.stopBeat = deps.clock.after(1000, beat);
    };
    this.stopBeat = deps.clock.after(1000, beat);
  }

  stop(): void {
    this.stopBeat();
    for (const room of this.rooms.values()) this.closeRoom(room);
  }

  /** 지금 열려 있는 방 수(시험·상태용) */
  roomCount(): number {
    return this.rooms.size;
  }

  private nowMs(): number {
    return this.deps.clock.now();
  }

  /** 회차의 방. 아직 열리지 않았거나 이미 닫힌 회차면 거절 */
  private room(round: number, create = true): Room {
    const found = this.rooms.get(round);
    if (found) {
      if (found.closed) throw new EntryError("이 회차 방은 닫혔습니다", 410);
      return found;
    }
    if (!Number.isInteger(round) || round < 1)
      throw new EntryError("회차가 맞지 않습니다");
    const times = roundTimes(this.deps.schedule(), round);
    const drawAt = drandTime(drandRoundForClose(times.closesAt));
    const now = sec(this.nowMs());
    if (!create)
      throw now * 1000 >= drawAt * 1000 + this.limits.closeAfterMs
        ? new EntryError("이 회차 방은 닫혔습니다", 410)
        : new EntryError("열린 방이 없습니다", 404);
    if (now < times.opensAt)
      throw new EntryError("아직 열리지 않은 회차입니다", 404);
    if (now * 1000 >= drawAt * 1000 + this.limits.closeAfterMs)
      throw new EntryError("이 회차 방은 닫혔습니다", 410);
    if (this.rooms.size >= this.limits.maxRooms) {
      // 가장 오래된 방부터 정리(닫힌 방)
      for (const [r, room] of this.rooms) if (room.closed) this.rooms.delete(r);
      if (this.rooms.size >= this.limits.maxRooms)
        throw new EntryError("방이 가득 찼습니다", 503);
    }
    const room: Room = {
      round,
      drawAt,
      entryDeadline: times.entryDeadline,
      closesAt: times.closesAt,
      passes: new Map(),
      nonces: new Map(),
      connections: new Set(),
      reports: new Map(),
      sealedSent: this.deps.sealed(round),
      drawnSent: this.deps.drawn(round),
      closed: false,
      messageSeq: 0,
    };
    this.rooms.set(round, room);
    return room;
  }

  private afterDraw(room: Room): boolean {
    return sec(this.nowMs()) >= room.drawAt;
  }

  /** ① 한 번 쓰는 값 */
  challenge(round: number): { nonce: string; expiresAt: number } {
    const room = this.room(round);
    if (this.afterDraw(room))
      throw new EntryError("추첨이 끝나 새로 들어올 수 없습니다", 409);
    const now = this.nowMs();
    for (const [n, at] of room.nonces)
      if (now - at > this.limits.nonceTtlMs) room.nonces.delete(n);
    while (room.nonces.size >= this.limits.maxNonces) {
      const first = room.nonces.keys().next().value as string;
      room.nonces.delete(first);
    }
    const nonce = toBase64Url(randomBytes(16));
    room.nonces.set(nonce, now);
    return { nonce, expiresAt: now + this.limits.nonceTtlMs };
  }

  private takeNonce(room: Room, nonce: string): Uint8Array {
    const at = room.nonces.get(nonce);
    if (at === undefined || this.nowMs() - at > this.limits.nonceTtlMs)
      throw new EntryError("확인 값이 맞지 않거나 시간이 지났습니다", 403);
    room.nonces.delete(nonce);
    return Buffer.from(nonce, "base64url");
  }

  /** ② 대화 표: 등록한 우주인의 패스키 서명(또는 국장 패스키) */
  async issuePass(
    round: number,
    input: { pub: Uint8Array; signature: SignatureData; nonce: string },
  ): Promise<{ pass: string; id: string }> {
    const room = this.room(round);
    if (this.afterDraw(room))
      throw new EntryError("추첨이 끝나 새로 들어올 수 없습니다", 409);
    const nonce = this.takeNonce(room, input.nonce);
    const director = this.deps.isDirector(input.pub);
    if (!director && !this.deps.isRegistered(input.pub))
      throw new EntryError("등록한 우주인만 말할 수 있습니다", 403);
    const ok = await verifyEntrantSignature(
      input.pub,
      roomPassMessage(round, nonce),
      input.signature,
      this.deps.policy,
    );
    if (!ok) throw new EntryError("신분증 확인이 맞지 않습니다", 403);
    const pubHex = toHex(input.pub);
    // 같은 사람이 다시 받으면 앞 표를 바꾼다(얼굴은 하나)
    for (const [t, p] of room.passes)
      if (p.pubHex === pubHex) room.passes.delete(t);
    if (room.passes.size >= this.limits.maxPasses)
      throw new EntryError("방이 가득 찼습니다", 503);
    const token = toBase64Url(randomBytes(32));
    const pass: Pass = {
      token,
      id: pubHex.slice(0, 16),
      pub: input.pub,
      pubHex,
      issuedAt: this.nowMs(),
      director,
      sayTokens: this.limits.sayBurst,
      sayRefillAt: this.nowMs(),
      lastCheer: 0,
      kicked: false,
    };
    room.passes.set(token, pass);
    return { pass: token, id: pass.id };
  }

  private passOf(room: Room, token: unknown): Pass {
    if (typeof token !== "string")
      throw new EntryError("대화 표가 없습니다", 401);
    const pass = room.passes.get(token);
    if (!pass || pass.kicked)
      throw new EntryError("대화 표가 맞지 않습니다", 401);
    return pass;
  }

  private person(room: Room, pass: Pass): Person {
    const entered = this.deps
      .tickets(room.round)
      .some((t) => toHex(t.pub) === pass.pubHex);
    return {
      id: pass.id,
      pub: toBase64Url(pass.pub),
      entered,
      ...(pass.director ? { director: true } : {}),
    };
  }

  private people(room: Room): Person[] {
    const seen = new Set<string>();
    const out: Person[] = [];
    for (const c of room.connections)
      if (c.pass && !seen.has(c.pass.id)) {
        seen.add(c.pass.id);
        out.push(this.person(room, c.pass));
      }
    return out;
  }

  private watchers(room: Room): number {
    let n = 0;
    for (const c of room.connections) if (!c.pass) n++;
    return n;
  }

  private picks(room: Room): Picks | null {
    if (!this.deps.sealed(room.round)) return null;
    const counts: Record<number, number> = {};
    const byPerson: Record<string, number[]> = {};
    const inRoom = new Map<string, string>();
    for (const p of room.passes.values()) inRoom.set(p.pubHex, p.id);
    for (const t of this.deps.tickets(room.round)) {
      for (const n of t.numbers) counts[n] = (counts[n] ?? 0) + 1;
      const id = inRoom.get(toHex(t.pub));
      if (id) byPerson[id] = [...t.numbers];
    }
    return { counts, byPerson };
  }

  /** ③ 스트림 연결(표가 있으면 얼굴로, 없으면 보는 사람으로) */
  connect(round: number, res: ServerResponse, token: unknown): void {
    const room = this.room(round);
    let pass: Pass | null = null;
    if (typeof token === "string" && token) {
      pass = this.passOf(room, token);
    } else if (this.afterDraw(room)) {
      throw new EntryError("추첨이 끝나 새로 들어올 수 없습니다", 409);
    }
    if (room.connections.size >= this.limits.maxConnections)
      throw new EntryError("방이 가득 찼습니다", 503);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    const conn: Connection = { res, pass };
    const wasHere = pass ? this.hasFace(room, pass.id) : false;
    room.connections.add(conn);
    this.write(conn, {
      type: "hello",
      serverTime: this.nowMs(),
      round,
      drawAt: room.drawAt,
      entryDeadline: room.entryDeadline,
      closesAt: room.closesAt,
      me: pass?.id ?? null,
      people: this.people(room),
      watchers: this.watchers(room),
      sealed: this.deps.sealed(round),
      drawn: this.deps.drawn(round),
      picks: this.picks(room),
    });
    if (pass && !wasHere)
      this.broadcast(
        room,
        { type: "join", person: this.person(room, pass) },
        conn,
      );
    else if (!pass)
      this.broadcast(
        room,
        { type: "watchers", count: this.watchers(room) },
        conn,
      );
    res.on("close", () => {
      room.connections.delete(conn);
      if (room.closed) return;
      if (conn.pass) {
        if (!this.hasFace(room, conn.pass.id))
          this.broadcast(room, { type: "leave", id: conn.pass.id });
      } else
        this.broadcast(room, { type: "watchers", count: this.watchers(room) });
    });
  }

  private hasFace(room: Room, id: string): boolean {
    for (const c of room.connections) if (c.pass?.id === id) return true;
    return false;
  }

  /** ④ 말하기 */
  say(round: number, token: unknown, text: unknown): { id: string } {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    if (typeof text !== "string") throw new EntryError("말이 없습니다");
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) throw new EntryError("말이 없습니다");
    if (charCount(clean) > this.limits.textMax)
      throw new EntryError(`말은 ${this.limits.textMax}자까지입니다`, 413);
    const now = this.nowMs();
    // 표마다 물통: 몰아서 sayBurst번, 그 뒤 sayIntervalMs마다 한 번씩 찬다
    const refill = Math.floor(
      (now - pass.sayRefillAt) / this.limits.sayIntervalMs,
    );
    if (refill > 0) {
      pass.sayTokens = Math.min(this.limits.sayBurst, pass.sayTokens + refill);
      pass.sayRefillAt += refill * this.limits.sayIntervalMs;
    }
    if (pass.sayTokens <= 0)
      throw new EntryError("조금 천천히 말해 주세요", 429);
    if (pass.sayTokens === this.limits.sayBurst) pass.sayRefillAt = now;
    pass.sayTokens -= 1;
    room.messageSeq += 1;
    const id = `${room.round}-${room.messageSeq}`;
    this.broadcast(room, {
      type: "say",
      id,
      from: pass.id,
      text: clean,
      at: now,
    });
    return { id };
  }

  /** ⑤ 응원 */
  cheer(round: number, token: unknown, kind: unknown, to: unknown): void {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    if (kind !== "twinkle" && kind !== "meteor")
      throw new EntryError("응원 종류가 맞지 않습니다");
    const now = this.nowMs();
    if (now - pass.lastCheer < this.limits.cheerIntervalMs)
      throw new EntryError("조금 천천히 응원해 주세요", 429);
    pass.lastCheer = now;
    const target = typeof to === "string" && this.hasFace(room, to) ? to : null;
    this.broadcast(room, { type: "cheer", from: pass.id, kind, to: target });
  }

  /** 신고: 국장 화면에서 그 말 옆에 수가 보인다(말은 남기지 않으므로 수만) */
  report(round: number, token: unknown, messageId: unknown): { count: number } {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    if (typeof messageId !== "string") throw new EntryError("말이 없습니다");
    const set = room.reports.get(messageId) ?? new Set<string>();
    set.add(pass.id);
    room.reports.set(messageId, set);
    for (const c of room.connections)
      if (c.pass?.director)
        this.writeRaw(c, { type: "report", id: messageId, count: set.size });
    return { count: set.size };
  }

  /** 국장 조치: 국장 패스키 서명 */
  async moderate(
    round: number,
    input: {
      pub: Uint8Array;
      signature: SignatureData;
      nonce: string;
      action: ModAction;
      target: string;
    },
  ): Promise<void> {
    const room = this.room(round, false);
    if (!this.deps.isDirector(input.pub))
      throw new EntryError("국장 열쇠가 아닙니다", 403);
    const nonce = this.takeNonce(room, input.nonce);
    const ok = await verifyEntrantSignature(
      input.pub,
      roomModMessage(round, input.action, input.target, nonce),
      input.signature,
      this.deps.policy,
    );
    if (!ok) throw new EntryError("국장 서명이 맞지 않습니다", 403);
    if (input.action === "hide") {
      this.broadcast(room, { type: "hide", id: input.target });
      return;
    }
    for (const p of room.passes.values())
      if (p.id === input.target) p.kicked = true;
    this.broadcast(room, { type: "kicked", id: input.target });
    for (const c of [...room.connections])
      if (c.pass?.id === input.target) c.res.end();
  }

  /** 1초마다: 시각 알림, 봉인·추첨 소식, 닫기 */
  private tick(): void {
    const now = this.nowMs();
    for (const [round, room] of this.rooms) {
      if (room.closed) {
        this.rooms.delete(round);
        continue;
      }
      if (!room.sealedSent && this.deps.sealed(round)) {
        room.sealedSent = true;
        const picks = this.picks(room);
        if (picks) this.broadcast(room, { type: "sealed", picks });
      }
      if (!room.drawnSent && this.deps.drawn(round)) {
        room.drawnSent = true;
        this.broadcast(room, { type: "drawn" });
      }
      if (now >= room.drawAt * 1000 + this.limits.closeAfterMs) {
        this.broadcast(room, { type: "closed" });
        this.closeRoom(room);
        continue;
      }
      if (
        Math.floor(now / 1000) % Math.round(this.limits.heartbeatMs / 1000) ===
        0
      )
        this.broadcast(room, { type: "time", serverTime: now });
    }
  }

  private closeRoom(room: Room): void {
    room.closed = true;
    for (const c of room.connections) c.res.end();
    room.connections.clear();
    room.passes.clear();
    room.nonces.clear();
  }

  private write(conn: Connection, event: RoomEvent): void {
    this.writeRaw(conn, event);
  }

  private writeRaw(conn: Connection, event: unknown): void {
    conn.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  private broadcast(room: Room, event: RoomEvent, except?: Connection): void {
    for (const c of room.connections) if (c !== except) this.write(c, event);
  }
}
