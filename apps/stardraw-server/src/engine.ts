import type { Clock } from "@mighty/fair-play";
import {
  anchorBranch,
  applyRecordOps,
  checkNumbers,
  checkPow,
  checkRegistration,
  checkScheduleChange,
  closedMessage,
  closeRound,
  decodeOperation,
  decodeRegistration,
  decodeRegistrationProof,
  decodeTicket,
  directorFingerprint,
  drandRoundForClose,
  drandTime,
  entrantId,
  equalBytes,
  everDirector,
  genesisHash,
  isVoidRound,
  type KeyRegistration,
  ledgerId,
  liveStart,
  newOpsState,
  type Operation,
  type OperationsView,
  type OpsContext,
  type OpsState,
  operationsView,
  opId,
  type PowParams,
  phaseOf,
  RawKeyRejected,
  type Receipt,
  type RoundRecord,
  recordHash,
  registrationContent,
  registrationRoot,
  roundAt,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  scheduleFromRecords,
  sealDesignations,
  sealDigest,
  sealLogId,
  sealRoot,
  selectOperations,
  signAsSeal,
  signReceipt,
  type Ticket,
  ticketContent,
  ticketId,
  toBase64Url,
  toHex,
  verifyRegistrationProof,
  verifyTicketSignature,
  type WebAuthnPolicy,
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
  /** 서버 설정의 국장 열쇠(`STARDRAW_DIRECTOR_KEYS`, docs/36 11-12). 장부에 없으면 관인으로 지정을 싣는다 */
  directorKeys?: readonly { credentialId: Uint8Array; pub: Uint8Array }[];
  /** 국장 요청: IP 앞부분 하나당 하루 상한(기본 60) */
  directorRequestsPerPrefixPerDay?: number;
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

/** 국장 열쇠로 응모·등록·찾기를 하려 할 때(docs/36 11-12). 화면에 그대로 보인다 */
export const DIRECTOR_KEY_MESSAGE =
  "이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다";

/** 등록만 올리기(우주인 등록 직후, docs/36 11-14) */
export interface RegisterInput {
  /** encodeRegistration 바이트 */
  registration: Uint8Array;
  /** encodeRegistrationProof 바이트(그 패스키의 서명, UV) */
  proof: Uint8Array;
  /** 작업 증명에 쓴 문제 값(hex). 지금 문제 값과 다르면 다시 풀라고 409로 알린다 */
  head: string;
  ip: string;
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
  /** 지금 회차의 단계(시험 trial, 정식 live). 화면이 시험 띠를 띄운다 */
  mode: "trial" | "live";
  /** 정식 단계 첫 회차(사슬 회차 번호). 아직 예고되지 않았으면 null */
  liveFrom: number | null;
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
  /** 닫힌 기록의 운영 기록을 모두 반영한 상태(서명까지 다시 확인하므로 띄울 때 비동기로 읽는다) */
  private ops: OpsState;
  private readonly opsReady: Promise<void>;

  constructor(options: EngineOptions) {
    this.o = options;
    this.genesis = options.store.genesis(options.schedule);
    this.current = scheduleFromRecords(this.genesis, this.records());
    this.ops = newOpsState(this.genesis);
    this.opsReady = this.loadOps();
    this.gate = new Gate(
      options.limits.argonConcurrency,
      options.limits.argonQueue,
    );
    options.publisher.genesis(this.genesis);
    this.publishBundles();
    this.publishHead();
  }

  /** 지금 회차의 단계: 설정이 아니라 장부(일정표)가 정한다. 단계가 없는 일정표면 정식으로 본다 */
  get mode(): "trial" | "live" {
    const schedule = this.schedule();
    const round = roundAt(schedule, this.now()) ?? 1;
    return phaseOf(schedule, round) === "trial" ? "trial" : "live";
  }

  private records(): RoundRecord[] {
    const out: RoundRecord[] = [];
    for (let r = 1; r <= this.o.store.recordCount(); r++) {
      const record = this.o.store.record(r);
      if (record) out.push(record);
    }
    return out;
  }

  private opsContext(): OpsContext {
    const { store } = this.o;
    return {
      policy: this.o.policy,
      isEntrant: (pub, credentialId) =>
        store.isRegistered(toHex(entrantId(pub))) ||
        (credentialId !== null && store.credentialTaken(toHex(credentialId))),
    };
  }

  /** 닫힌 기록을 검사기와 같은 규칙으로 다시 읽고, 설정의 국장 열쇠 지문과 장부 상태를 기록에 남긴다(docs/36 11-12 D1) */
  private async loadOps(): Promise<void> {
    const state = newOpsState(this.genesis);
    for (const record of this.records()) {
      const problems = await applyRecordOps(state, record, this.opsContext());
      for (const p of problems)
        this.o.log?.(`${record.round}회차 기록의 운영 기록 문제: ${p}`);
    }
    this.ops = state;
    for (const key of this.o.directorKeys ?? []) {
      const fp = directorFingerprint(key.pub);
      const using = state.directors.some(
        (d) => equalBytes(d.pub, key.pub) && d.until === null,
      );
      const pending = state.ops.some(
        (e) =>
          e.status === "pending" &&
          e.op.kind === "director-add" &&
          equalBytes(e.op.pub, key.pub),
      );
      this.o.log?.(
        `국장 열쇠(설정) ${fp}: ${using ? "쓰는 중" : pending ? "지정 예고 중" : "다음 기록에 지정을 싣는다"}`,
      );
    }
  }

  /** 시험용: 운영 상태를 다 읽을 때까지 */
  async ready(): Promise<void> {
    await this.opsReady;
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
      mode: this.mode,
      liveFrom: liveStart(this.schedule()),
    };
  }

  isRegistered(pub: Uint8Array): boolean {
    return this.o.store.isRegistered(toHex(entrantId(pub)));
  }

  /** 이 열쇠의 등록 회차(우주인 등록증의 등록 일자). 없으면 null */
  registrationRound(pub: Uint8Array): number | null {
    return this.o.store.registrationRound(toHex(entrantId(pub)));
  }

  /** 패스키 번호 → 공개 열쇠(장부에 공개될 값이라 숨길 것이 없다). 국장 패스키면 그렇다고 알린다 */
  async passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null> {
    const pub =
      this.o.store.registrationByCredential(toHex(credentialId))?.pub ?? null;
    if (!pub && (await this.isDirectorKey(null, credentialId)))
      throw new EntryError(DIRECTOR_KEY_MESSAGE, 403);
    return pub;
  }

  /**
   * 국장 열쇠와 겹치는 열쇠·패스키 번호인지: 장부에 실렸거나 예고 중인 지정, 받아 두고 아직 싣지 않은 요청,
   * 서버 설정(`STARDRAW_DIRECTOR_KEYS`)까지 본다. 국장 열쇠와 우주인 열쇠는 섞지 않는다(docs/36 11-12)
   */
  private async isDirectorKey(
    pub: Uint8Array | null,
    credentialId: Uint8Array,
  ): Promise<boolean> {
    await this.opsReady;
    const p = pub ?? new Uint8Array(0);
    return (
      everDirector(this.ops, p, credentialId) ||
      this.submittedDirectorKey(p, credentialId) ||
      (this.o.directorKeys ?? []).some(
        (k) =>
          (pub !== null && equalBytes(k.pub, pub)) ||
          equalBytes(k.credentialId, credentialId),
      )
    );
  }

  // ── 우주인 등록(응모 없이 등록만) ──

  /**
   * 우주인 등록 직후 등록만 올린다. 응모와 같은 확인을 같은 순서로 한다: IP 상한 → 형식 → 받는 때 →
   * 국장 열쇠 거절 → 패스키 서명(UV) → 작업 증명. 장부에 싣는 등록 형식은 응모와 함께 오는 것과 같다.
   * 이미 등록된 열쇠면 그 회차를 그대로 돌려준다(다시 보내도 같다)
   */
  async register(input: RegisterInput): Promise<{ round: number }> {
    const { store } = this.o;
    const receivedAt = this.now();
    const schedule = this.schedule();
    const round = roundAt(schedule, receivedAt);
    if (round === null) throw new EntryError("아직 1회차가 열리지 않았습니다");
    const prefix = ipPrefix(input.ip);
    const day = String(Math.floor(receivedAt / 86400));

    // 1. IP 상한
    if (
      this.counters.count("register", day, prefix) >=
      this.o.limits.registrationsPerPrefixPerDay
    )
      throw new EntryError(
        "같은 곳에서 오늘 새로 등록한 열쇠가 너무 많습니다",
        429,
      );

    // 2. 형식
    let registration: KeyRegistration;
    let proof: ReturnType<typeof decodeRegistrationProof>;
    try {
      registration = decodeRegistration(input.registration);
      proof = decodeRegistrationProof(input.proof);
    } catch (err) {
      if (err instanceof RawKeyRejected)
        throw new EntryError(
          "패스키로만 등록할 수 있습니다. 직접 만든 열쇠는 받지 않습니다",
        );
      throw new EntryError("등록 형식이 맞지 않습니다");
    }
    const who = toHex(entrantId(registration.pub));
    const known = store.registrationRound(who);
    if (known !== null) return { round: known };

    // 3. 받는 때: 응모를 받는 동안만(등록은 그 회차 기록에 실린다)
    const times = roundTimes(schedule, round);
    if (
      store.recordCount() < round - 1 ||
      receivedAt >= times.closesAt ||
      store.seal(round)
    )
      throw new EntryError("다음 회차가 열리면 등록됩니다", 409);
    if (input.head !== toHex(this.head()))
      throw new EntryError("회차가 바뀌었습니다. 다시 계산해 주세요", 409);

    // 4. 국장 열쇠와 섞지 않는다, 패스키 번호는 한 번만
    if (await this.isDirectorKey(registration.pub, registration.credentialId))
      throw new EntryError(DIRECTOR_KEY_MESSAGE, 403);
    const credentialHex = toHex(registration.credentialId);
    if (store.credentialTaken(credentialHex))
      throw new EntryError("이미 다른 열쇠로 등록된 패스키입니다");

    // 5. 패스키 서명(본인 확인 UV까지)
    if (!(await verifyRegistrationProof(registration, proof, this.o.policy)))
      throw new EntryError("등록 서명이 맞지 않습니다");

    // 6. 작업 증명
    const challenge = this.head();
    const ok = await this.gate
      .run(() =>
        checkPow(
          challenge,
          registrationContent(registration),
          registration.nonce,
          times.entry.registerPowTarget,
          this.o.pow,
        ),
      )
      .catch((err) => {
        if (err instanceof BusyError) throw new EntryError(err.message, 503);
        throw err;
      });
    if (!ok) throw new EntryError("열쇠 등록 계산이 맞지 않습니다");

    let at = round;
    store.transaction(() => {
      if (store.seal(round))
        throw new EntryError("다음 회차가 열리면 등록됩니다", 409);
      const again = store.registrationRound(who);
      if (again !== null) {
        at = again;
        return;
      }
      if (store.credentialTaken(credentialHex))
        throw new EntryError("이미 다른 열쇠로 등록된 패스키입니다");
      store.addRegistration(round, who, credentialHex, registration);
      this.counters.add("register", day, prefix);
    });
    return { round: at };
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
    } catch (err) {
      // 원시 열쇠(직접 만든 열쇠 쌍)는 본인 확인(UV) 없이 서명할 수 있어 받지 않는다(docs/36 11-11)
      if (err instanceof RawKeyRejected)
        throw new EntryError(
          "패스키로만 응모할 수 있습니다. 직접 만든 열쇠는 받지 않습니다",
        );
      throw new EntryError("응모권 형식이 맞지 않습니다");
    }
    const numbersProblem = checkNumbers(ticket.numbers);
    if (numbersProblem) throw new EntryError(numbersProblem);
    // 마감 직후 도착한 앞 회차 응모권은 늦었다고 분명히 알린다(받은 서버 시각을 함께)
    if (ticket.round < round)
      throw new EntryError(closedMessage(receivedAt), 409);
    if (ticket.round !== round)
      throw new EntryError("이번 회차 응모권이 아닙니다");
    const times = roundTimes(schedule, round);
    if (store.recordCount() < round - 1)
      throw new EntryError("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다", 409);
    if (receivedAt >= times.closesAt || store.seal(round))
      throw new EntryError(closedMessage(receivedAt), 409);
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
      // 국장 열쇠와 우주인 열쇠는 섞지 않는다(docs/36 11-12)
      if (await this.isDirectorKey(registration.pub, registration.credentialId))
        throw new EntryError(DIRECTOR_KEY_MESSAGE, 403);
      credentialHex = toHex(registration.credentialId);
      if (store.credentialTaken(credentialHex))
        throw new EntryError("이미 다른 열쇠로 등록된 패스키입니다");
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
      if (store.seal(round))
        throw new EntryError(closedMessage(receivedAt), 409);
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
    this.startAnchoring();
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
    await this.opsReady;
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
      const scheduleChanges = this.dueChanges(schedule, round);
      const prev = this.head();
      const { operations, submittedIds } = await this.dueOperations(
        round,
        prev,
        scheduleChanges,
      );
      const record = closeRound({
        schedule,
        round,
        prev,
        tickets,
        registrations,
        rootLoggedAt: seal.loggedAt,
        beacon,
        scheduleChanges,
        operations,
      });
      // 봉인 뒤에는 목록이 바뀌지 않으므로 기록의 루트가 봉인 값과 같아야 한다
      if (!equalBytes(sealDigest(record), seal.digest))
        throw new Error(`${round}회차 기록이 봉인 값과 다르다`);
      store.addRecord(record);
      if (scheduleChanges.length > 0) {
        store.setPendingChange(null);
        this.o.log?.(
          `${round}회차 기록에 일정 바꾸기를 실었다: ${scheduleChanges.map(describeEntry).join(", ")}`,
        );
      }
      store.removeDirectorOps(submittedIds);
      const problems = await applyRecordOps(
        this.ops,
        record,
        this.opsContext(),
      );
      for (const p of problems)
        this.o.log?.(`${round}회차 기록의 운영 기록 문제: ${p}`);
      for (const op of operations)
        this.o.log?.(
          `${round}회차 기록에 운영 기록을 실었다: ${describeOp(op)}`,
        );
      this.current = this.ops.schedule;
      this.o.publisher.round(record, tickets, registrations);
      this.publishBundles();
      this.publishHead();
    }
  }

  /**
   * 예약해 둔 일정 바꾸기(`schedule-live`)를 이번 기록에 실을 수 있으면 싣는다.
   * 그사이 24시간 규칙에 늦어졌으면 싣지 않고 지운 뒤 기록을 남긴다(다시 예약해야 한다)
   */
  private dueChanges(schedule: Schedule, round: number): ScheduleEntry[] {
    const pending = this.o.store.pendingChange();
    if (!pending) return [];
    const problem = this.ops.pendingSchedule
      ? "국장이 예고한 일정 바꾸기가 있다"
      : checkScheduleChange(schedule, pending, round);
    if (!problem) return [pending];
    this.o.store.setPendingChange(null);
    this.o.log?.(
      `예약한 일정 바꾸기를 ${round}회차 기록에 싣지 못해 지웠다(${problem}): ${describeEntry(pending)}`,
    );
    return [];
  }

  /**
   * 이번 기록에 실을 운영 기록: 설정의 국장 열쇠 지정(관인 서명)과 받아 둔 국장 요청을 검사기와 같은 규칙으로 고른다.
   * 맞지 않게 된 요청(그사이 기록이 바뀌었거나 효력 규칙에 늦음)은 싣지 않고 지운다
   */
  private async dueOperations(
    round: number,
    prev: Uint8Array,
    scheduleChanges: readonly ScheduleEntry[],
  ): Promise<{ operations: Operation[]; submittedIds: string[] }> {
    const ctx = this.opsContext();
    const designations = sealDesignations(
      this.ops,
      round,
      prev,
      this.o.directorKeys ?? [],
      ctx,
    );
    for (const s of designations.skipped)
      this.o.log?.(
        `설정의 국장 열쇠 ${directorFingerprint(s.pub)}를 싣지 않는다: ${s.reason}`,
      );
    const sealOps = await Promise.all(
      designations.bodies.map((b) => signAsSeal(b, this.o.serverKey)),
    );
    const submitted = this.o.store.directorOps();
    const { accepted, rejected } = await selectOperations(
      this.ops,
      round,
      prev,
      [...sealOps, ...submitted.map((x) => x.op)],
      ctx,
      scheduleChanges,
    );
    for (const r of rejected)
      this.o.log?.(
        `운영 기록을 싣지 않았다(${r.problem}): ${describeOp(r.op)}`,
      );
    return { operations: accepted, submittedIds: submitted.map((x) => x.id) };
  }

  // ── 국장 요청(docs/36 11-12) ──

  private submittedDirectorKey(
    pub: Uint8Array,
    credentialId: Uint8Array,
  ): boolean {
    return this.o.store
      .directorOps()
      .some(
        ({ op }) =>
          op.kind === "director-add" &&
          (equalBytes(op.pub, pub) ||
            equalBytes(op.credentialId, credentialId)),
      );
  }

  /** 관리 화면이 보는 상태: 장부의 운영 기록과 받아 두고 아직 싣지 않은 요청 */
  async directorState(): Promise<{
    now: number;
    records: number;
    schedule: Schedule;
    view: OperationsView;
    submitted: { id: string; summary: string; effectiveRound: number }[];
  }> {
    await this.opsReady;
    const records = this.o.store.recordCount();
    const view = operationsView(this.ops, records, this.head());
    return {
      now: this.now(),
      records,
      schedule: this.schedule(),
      view,
      submitted: this.o.store.directorOps().map(({ id, op }) => ({
        id,
        summary: describeOp(op),
        effectiveRound: op.effectiveRound,
      })),
    };
  }

  /**
   * 국장 운영 기록 받기: 다음 기록(지금 닫힌 기록 수 + 1)에 실렸다고 치고 검사기와 같은 규칙으로 확인한 뒤 받아 둔다.
   * 실제로 싣는 것은 그 기록을 닫을 때다(다시 확인한다)
   */
  async submitDirectorOp(
    bytes: Uint8Array,
    ip: string,
  ): Promise<{ id: string; round: number; effectiveRound: number }> {
    const { store } = this.o;
    const prefix = ipPrefix(ip);
    const day = String(Math.floor(this.now() / 86400));
    if (
      this.counters.count("director", day, prefix) >=
      (this.o.directorRequestsPerPrefixPerDay ?? 60)
    )
      throw new EntryError(
        "같은 곳에서 오늘 보낸 국장 요청이 너무 많습니다",
        429,
      );
    this.counters.add("director", day, prefix);
    let op: Operation;
    try {
      op = decodeOperation(bytes);
    } catch {
      throw new EntryError("운영 기록 형식이 맞지 않습니다");
    }
    if (op.signer.role !== "director")
      throw new EntryError("국장 패스키로 서명한 요청만 받습니다", 403);
    await this.opsReady;
    const submitted = store.directorOps();
    if (submitted.length >= 20)
      throw new EntryError(
        "받아 둔 요청이 많습니다. 다음 기록이 닫힌 뒤에 보내 주세요",
        429,
      );
    const round = store.recordCount() + 1;
    const head = this.head();
    if (!equalBytes(op.after, head)) {
      const older =
        this.records().some((r) => equalBytes(recordHash(r), op.after)) ||
        equalBytes(genesisHash(this.genesis), op.after);
      throw older
        ? new EntryError(
            "그사이 장부에 기록이 하나 더 닫혔습니다. 다시 서명해 주세요",
            409,
          )
        : new EntryError("이 장부의 자리에서 서명한 요청이 아닙니다");
    }
    const id = toHex(opId(op));
    if (submitted.some((x) => x.id === id))
      throw new EntryError("이미 받은 요청입니다", 409);
    const { rejected } = await selectOperations(
      this.ops,
      round,
      head,
      [...submitted.map((x) => x.op), op],
      this.opsContext(),
    );
    const mine = rejected.find((r) => toHex(opId(r.op)) === id);
    if (mine) {
      if (/국장 열쇠가 아니다/.test(mine.problem))
        throw new EntryError(
          "국장 열쇠가 아닙니다. 우주국이 지정한 국장 패스키로 서명해 주세요",
          403,
        );
      throw new EntryError(mine.problem);
    }
    store.addDirectorOp(id, op, this.now());
    return { id, round, effectiveRound: op.effectiveRound };
  }

  /**
   * 앵커: 장부를 처음 만들 때 처음 일정표를 main에 한 번 남기고, 닫힌 회차를 차례대로 바깥에 남긴다. 회차 진행(봉인 기한)을 막지 않게 tick과 따로 돈다.
   * 한 번에 하나만 돌고, 실패하면 1분 쉰 뒤 그 회차부터 다시 보낸다(재시작해도 저장소의 표시로 이어진다)
   */
  private anchoring: Promise<void> | null = null;
  private nextAnchorTry = 0;

  private startAnchoring(): void {
    if (this.anchoring || this.now() < this.nextAnchorTry) return;
    if (
      this.o.store.genesisAnchored() &&
      this.o.store.anchored() >= this.o.store.recordCount()
    )
      return;
    this.anchoring = this.anchorDue().finally(() => {
      this.anchoring = null;
    });
  }

  private async anchorDue(): Promise<void> {
    const { store } = this.o;
    const ledger = ledgerId(this.genesis);
    if (!store.genesisAnchored()) {
      try {
        await this.o.anchor.anchorGenesis(this.genesis);
        store.setGenesisAnchored();
      } catch (err) {
        this.nextAnchorTry = this.now() + 60;
        this.o.log?.(
          `처음 일정표 앵커를 남기지 못해 1분 뒤 다시 시도한다: ${String(err)}`,
        );
        return;
      }
    }
    for (
      let round = store.anchored() + 1;
      round <= store.recordCount();
      round++
    ) {
      const record = store.record(round);
      if (!record) return;
      try {
        await this.o.anchor.anchor(
          {
            ledger,
            round,
            record: toHex(recordHash(record)),
            seal: sealLogId(store.seal(round)?.log),
          },
          anchorBranch(this.schedule(), round),
        );
        store.setAnchored(round);
      } catch (err) {
        this.nextAnchorTry = this.now() + 60;
        this.o.log?.(
          `${round}회차 앵커를 남기지 못해 1분 뒤 다시 시도한다: ${String(err)}`,
        );
        return;
      }
    }
  }

  /** 시험용: 돌고 있는 앵커 보내기가 끝날 때까지 */
  async anchorIdle(): Promise<void> {
    await this.anchoring;
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

  /** 다 찬 10·100회차 묶음 파일(받는 요청 수 줄이기). 못 써도 낱개 파일이 있으니 회차는 그대로 닫는다 */
  private publishBundles(): void {
    try {
      this.o.publisher.bundles(this.o.store.recordCount());
    } catch (err) {
      this.o.log?.(
        `장부 묶음 파일을 쓰지 못했다: ${err instanceof Error ? err.message : String(err)}`,
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

function describeOp(op: Operation): string {
  const kind = {
    "director-add": "국장 열쇠 지정",
    "director-remove": "국장 열쇠 빼기",
    "affiliation-add": "소속 추가",
    "affiliation-update": "소속 바꾸기",
    "affiliation-end": "소속 끝내기",
    cancel: "예고 취소",
    schedule: "일정 바꾸기",
  }[op.kind];
  const who =
    op.signer.role === "seal" ? "관인" : directorFingerprint(op.signer.pub);
  const what =
    op.kind === "director-add" || op.kind === "director-remove"
      ? ` ${directorFingerprint(op.pub)}`
      : op.kind === "affiliation-add" || op.kind === "affiliation-update"
        ? ` ${op.fields.name}`
        : "";
  const when = op.kind === "cancel" ? "바로" : `${op.effectiveRound}회차부터`;
  return `${kind}${what}(서명 ${who}, ${when})`;
}

function describeEntry(e: ScheduleEntry): string {
  return `${e.fromRound}회차부터 ${e.phase === "live" ? "정식" : e.phase === "trial" ? "시험" : ""} ${e.length / 60}분 회차`;
}
