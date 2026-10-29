import type { Clock } from "@mighty/fair-play";
import {
  checkNumbers,
  checkPow,
  checkRegistration,
  closeRound,
  decodeRegistration,
  decodeTicket,
  drandRoundForClose,
  drandTime,
  entrantId,
  equalBytes,
  genesisHash,
  isVoidRound,
  type KeyRegistration,
  type PowParams,
  type Receipt,
  type RoundRecord,
  recordHash,
  registrationContent,
  registrationRoot,
  roundAt,
  roundTimes,
  type Schedule,
  sealDigest,
  sealRoot,
  signReceipt,
  type Ticket,
  ticketContent,
  ticketId,
  toBase64Url,
  toHex,
  verifyTicketSignature,
  type WebAuthnPolicy,
  withChange,
} from "@mighty/stardraw-core";

import { BusyError, Counters, Gate, ipPrefix } from "./limits";
import type { Anchor, DrandSource, RootLog } from "./outside";
import type { Publisher } from "./publish";
import type { ServerKey } from "./server-key";
import type { Store } from "./store";

/**
 * 회차 서버(docs/36 3절·11-1). 시각은 모두 주입한 `Clock`으로 잰다(시험은 ManualClock).
 * - 응모: 8-1 P1 순서로 싼 확인부터 한다. IP 상한 → 형식 → 등록된 열쇠 → 서명 → 열쇠당 회차 1장 → 작업 증명(Argon2, 동시 실행 제한)
 * - 봉인: 마감 시각이 지나면 응모권·등록 목록의 봉인 값을 투명성 로그에 올리고 공개한다(기한 안에 못 올리면 그 회차는 무효)
 * - 추첨: 봉인한 회차의 drand 회차 값이 나오면 회차 기록을 닫아 장부에 붙이고, 기록 해시를 앵커에 남긴다
 */

export interface EngineOptions {
  store: Store;
  publisher: Publisher;
  clock: Clock;
  /** 처음 일정표(장부가 이미 있으면 장부의 것) */
  schedule: Schedule;
  pow: PowParams;
  policy: WebAuthnPolicy;
  serverKey: ServerKey;
  drand: DrandSource;
  rootLog: RootLog;
  anchor: Anchor;
  limits: {
    entriesPerPrefixPerRound: number;
    registrationsPerPrefixPerDay: number;
    argonConcurrency: number;
    argonQueue: number;
  };
  /** 마감 뒤 봉인 값을 로그에 올리는 기한(초) */
  sealDeadline: number;
  /** drand 값을 이만큼(초) 못 받으면 알린다 */
  drandAlertAfter?: number;
  log?: (message: string) => void;
}

/** 응모자에게 보일 거절. status는 HTTP 응답 번호 */
export class EntryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface EntryInput {
  /** encodeTicket 바이트 */
  ticket: Uint8Array;
  /** 새 열쇠면 encodeRegistration 바이트 */
  registration?: Uint8Array;
  ip: string;
}

export interface ServerState {
  now: number;
  /** 지금 응모받는(또는 곧 받을) 회차. 1회차 전이면 0 */
  round: number;
  /** 닫힌 회차 수 */
  records: number;
  /** 봉인한 회차 수 */
  sealed: number;
  /** 다음 회차 문제 값 */
  head: string;
  /** 이번 회차에 들어온 응모 수 */
  entries: number;
  serverKey: string;
}

export class StardrawServer {
  readonly genesis: Schedule;
  private readonly o: EngineOptions;
  private readonly counters = new Counters();
  private readonly gate: Gate;
  private ticking: Promise<void> = Promise.resolve();
  /** 기록에 붙은 일정 변경을 모두 반영한 일정표(기록이 붙을 때마다 고친다) */
  private current: Schedule;
  /** drand 값을 기다리기 시작한 시각과 마지막 알림 시각 */
  private waitingDrand = new Map<number, { since: number; alerted: number }>();

  constructor(options: EngineOptions) {
    this.o = options;
    this.genesis = options.store.genesis(options.schedule);
    this.current = this.genesis;
    for (let r = 1; r <= options.store.recordCount(); r++)
      this.applyChanges(options.store.record(r));
    this.gate = new Gate(
      options.limits.argonConcurrency,
      options.limits.argonQueue,
    );
    options.publisher.genesis(this.genesis);
    this.publishHead();
  }

  private applyChanges(record: RoundRecord | null): void {
    for (const change of record?.scheduleChanges ?? [])
      this.current = withChange(this.current, change);
  }

  /** 지금 시각(초) */
  now(): number {
    return Math.floor(this.o.clock.now() / 1000);
  }

  schedule(): Schedule {
    return this.current;
  }

  /** 다음 회차 문제 값 = 마지막 기록 해시(1회차는 처음 일정표 해시) */
  head(): Uint8Array {
    const n = this.o.store.recordCount();
    const last = n > 0 ? this.o.store.record(n) : null;
    return last ? recordHash(last) : genesisHash(this.genesis);
  }

  state(): ServerState {
    const now = this.now();
    const round = roundAt(this.schedule(), now) ?? 0;
    return {
      now,
      round,
      records: this.o.store.recordCount(),
      sealed: this.o.store.lastSealed(),
      head: toHex(this.head()),
      entries: round > 0 ? this.o.store.entryCount(round) : 0,
      serverKey: toBase64Url(this.o.serverKey.publicKey),
    };
  }

  isRegistered(pub: Uint8Array): boolean {
    return this.o.store.isRegistered(toHex(entrantId(pub)));
  }

  /** 패스키 번호 → 공개 열쇠(장부에 공개될 값이라 숨길 것이 없다) */
  passkeyPub(credentialId: Uint8Array): Uint8Array | null {
    return (
      this.o.store.registrationByCredential(toHex(credentialId))?.pub ?? null
    );
  }

  // ── 응모 ──

  async submit(input: EntryInput): Promise<Receipt> {
    const { store } = this.o;
    const receivedAt = this.now();
    const schedule = this.schedule();
    const round = roundAt(schedule, receivedAt);
    if (round === null) throw new EntryError("아직 1회차가 열리지 않았습니다");
    const prefix = ipPrefix(input.ip);

    // 1. IP 상한(가장 싸다)
    if (
      this.counters.count("entry", String(round), prefix) >=
      this.o.limits.entriesPerPrefixPerRound
    )
      throw new EntryError(
        "같은 곳에서 이번 회차에 낸 응모가 너무 많습니다",
        429,
      );

    // 2. 형식
    let ticket: Ticket;
    let registration: KeyRegistration | undefined;
    try {
      ticket = decodeTicket(input.ticket);
      if (input.registration)
        registration = decodeRegistration(input.registration);
    } catch {
      throw new EntryError("응모권 형식이 맞지 않습니다");
    }
    const numbersProblem = checkNumbers(ticket.numbers);
    if (numbersProblem) throw new EntryError(numbersProblem);
    if (ticket.round !== round)
      throw new EntryError("이번 회차 응모권이 아닙니다");
    const times = roundTimes(schedule, round);
    if (store.recordCount() < round - 1)
      throw new EntryError("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다", 409);
    if (receivedAt >= times.closesAt || store.seal(round))
      throw new EntryError("응모가 마감되었습니다", 409);
    const who = toHex(entrantId(ticket.pub));

    // 3. 등록된 열쇠(새 열쇠면 함께 온 등록을 본다)
    const known = store.isRegistered(who);
    let credentialHex: string | null = null;
    if (!known) {
      if (!registration) throw new EntryError("등록되지 않은 열쇠입니다");
      if (!equalBytes(entrantId(registration.pub), entrantId(ticket.pub)))
        throw new EntryError("응모권과 다른 열쇠의 등록입니다");
      const problem = checkRegistration(registration);
      if (problem) throw new EntryError(problem);
      if (registration.kind === "passkey") {
        credentialHex = toHex(registration.credentialId);
        if (store.credentialTaken(credentialHex))
          throw new EntryError("이미 다른 열쇠로 등록된 패스키입니다");
      }
      const day = String(Math.floor(receivedAt / 86400));
      if (
        this.counters.count("register", day, prefix) >=
        this.o.limits.registrationsPerPrefixPerDay
      )
        throw new EntryError(
          "같은 곳에서 오늘 새로 등록한 열쇠가 너무 많습니다",
          429,
        );
    }

    // 4. 서명(ECDSA라 싸다)
    if (!(await verifyTicketSignature(ticket, this.o.policy)))
      throw new EntryError("응모권 서명이 맞지 않습니다");

    // 5. 열쇠당 회차 1장
    if (store.hasEntry(round, who))
      throw new EntryError("이번 회차에는 이미 응모했습니다", 409);

    // 6. 작업 증명(가장 비싸다, 동시 실행 제한)
    const challenge = this.head();
    const powOk = await this.gate
      .run(async () => {
        if (!known && registration) {
          const regOk = await checkPow(
            challenge,
            registrationContent(registration),
            registration.nonce,
            times.entry.registerPowTarget,
            this.o.pow,
          );
          if (!regOk) return "열쇠 등록 계산이 맞지 않습니다";
        }
        const ok = await checkPow(
          challenge,
          ticketContent(ticket),
          ticket.nonce,
          times.entry.powTarget,
          this.o.pow,
        );
        return ok ? null : "응모 계산이 맞지 않습니다";
      })
      .catch((err) => {
        if (err instanceof BusyError) throw new EntryError(err.message, 503);
        throw err;
      });
    if (powOk) throw new EntryError(powOk);

    // 기다리는 사이 봉인했거나 같은 열쇠가 먼저 들어왔을 수 있다. 확인과 넣기를 한 번에(동기) 한다
    store.transaction(() => {
      if (store.seal(round)) throw new EntryError("응모가 마감되었습니다", 409);
      if (store.hasEntry(round, who))
        throw new EntryError("이번 회차에는 이미 응모했습니다", 409);
      if (!known && registration) {
        if (store.isRegistered(who))
          throw new EntryError("이미 등록된 열쇠입니다. 다시 내 주세요", 409);
        if (credentialHex && store.credentialTaken(credentialHex))
          throw new EntryError("이미 다른 열쇠로 등록된 패스키입니다");
        store.addRegistration(round, who, credentialHex, registration);
      }
      store.addEntry(round, toHex(ticketId(ticket)), who, ticket, receivedAt);
    });
    this.counters.add("entry", String(round), prefix);
    if (!known)
      this.counters.add(
        "register",
        String(Math.floor(receivedAt / 86400)),
        prefix,
      );
    return signReceipt(this.o.serverKey, {
      round,
      ticketId: ticketId(ticket),
      receivedAt,
    });
  }

  // ── 봉인과 추첨 ──

  /** 할 일을 한다(겹쳐 돌지 않게 차례로). 운영은 1초마다, 시험은 시계를 옮긴 뒤 부른다 */
  tick(): Promise<void> {
    const run = this.ticking.then(() => this.tickNow());
    this.ticking = run.catch((err) =>
      this.o.log?.(`회차 진행 오류: ${String(err)}`),
    );
    return run;
  }

  private async tickNow(): Promise<void> {
    await this.sealDue();
    await this.drawDue();
  }

  private async sealDue(): Promise<void> {
    const { store } = this.o;
    for (;;) {
      const round = store.lastSealed() + 1;
      const schedule = this.schedule();
      const { closesAt } = roundTimes(schedule, round);
      const now = this.now();
      if (now < closesAt) return;
      const tickets = store.entries(round);
      const registrations = store.registrations(round);
      const parts = {
        round,
        count: tickets.length,
        merkleRoot: sealRoot(tickets),
        registrationCount: registrations.length,
        registrationRoot: registrationRoot(registrations),
      };
      const digest = sealDigest(parts);
      const logged = await this.o.rootLog.log(digest);
      if (!logged && now < closesAt + this.o.sealDeadline) return; // 다음 번에 다시
      const loggedAt = logged?.loggedAt ?? 0;
      if (!logged)
        this.o.log?.(
          `${round}회차 봉인 값을 기한 안에 로그에 올리지 못해 무효로 닫는다`,
        );
      store.addSeal({ round, digest, loggedAt, log: logged?.proof ?? null });
      this.o.publisher.seal({
        round,
        count: parts.count,
        merkleRoot: toHex(parts.merkleRoot),
        registrationCount: parts.registrationCount,
        registrationRoot: toHex(parts.registrationRoot),
        digest: toHex(digest),
        loggedAt,
        log: logged?.proof ?? null,
      });
      this.publishHead();
    }
  }

  private async drawDue(): Promise<void> {
    const { store } = this.o;
    for (;;) {
      const round = store.recordCount() + 1;
      const seal = store.seal(round);
      if (!seal) return;
      const schedule = this.schedule();
      const { closesAt } = roundTimes(schedule, round);
      const drandRound = drandRoundForClose(closesAt);
      let beacon = null;
      if (!isVoidRound(closesAt, seal.loggedAt)) {
        if (this.now() < drandTime(drandRound)) return;
        beacon = await this.o.drand.get(drandRound);
        if (!beacon) {
          this.alertDrand(round);
          return;
        }
      }
      this.waitingDrand.delete(round);
      const tickets = store.entries(round);
      const registrations = store.registrations(round);
      const record = closeRound({
        schedule,
        round,
        prev: this.head(),
        tickets,
        registrations,
        rootLoggedAt: seal.loggedAt,
        beacon,
      });
      // 봉인 뒤에는 목록이 바뀌지 않으므로 기록의 루트가 봉인 값과 같아야 한다
      if (!equalBytes(sealDigest(record), seal.digest))
        throw new Error(`${round}회차 기록이 봉인 값과 다르다`);
      store.addRecord(record);
      this.applyChanges(record);
      this.o.publisher.round(record, tickets, registrations);
      this.publishHead();
      void this.anchor(record);
    }
  }

  private async anchor(record: RoundRecord): Promise<void> {
    try {
      await this.o.anchor.anchor(record.round, toHex(recordHash(record)));
    } catch (err) {
      this.o.log?.(`${record.round}회차 앵커를 남기지 못했다: ${String(err)}`);
    }
  }

  private alertDrand(round: number): void {
    const now = this.now();
    const wait = this.waitingDrand.get(round) ?? { since: now, alerted: 0 };
    this.waitingDrand.set(round, wait);
    // 대체 난수를 쓰지 않고 기다린다. 오래 걸리면 10분마다 운영자에게 알린다(docs/36 3절)
    if (
      now - wait.since >= (this.o.drandAlertAfter ?? 30 * 60) &&
      now - wait.alerted >= 600
    ) {
      wait.alerted = now;
      this.o.log?.(
        `${round}회차 drand 값을 ${Math.floor((now - wait.since) / 60)}분째 받지 못했다`,
      );
    }
  }

  private publishHead(): void {
    this.o.publisher.head({
      rounds: this.o.store.recordCount(),
      head: toHex(this.head()),
      sealed: this.o.store.lastSealed(),
      serverKey: toBase64Url(this.o.serverKey.publicKey),
    });
  }
}
