import type { Clock } from "@mighty/fair-play";
import {
  alignedEpoch,
  applyRecordOps,
  ByteWriter,
  checkPow,
  checkRegistration,
  closedMessage,
  closeRound,
  concat,
  type DrandBeacon,
  type Draw,
  decodeOperation,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRandomness,
  drandRoundForClose,
  drandTime,
  drawNumbers,
  drawSeed,
  encodeOperation,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  entrantId,
  everDirector,
  fromBase64Url,
  generateSigner,
  genesisHash,
  type KeyRegistration,
  makeRegistration,
  makeTicket,
  newOpsState,
  type Operation,
  type OpsContext,
  type OpsState,
  operationsView,
  opId,
  type PowParams,
  parseDirectorKeys,
  powTargetForTries,
  type RoundRecord,
  type RoundTimes,
  recordHash,
  registrationContent,
  roundAt,
  roundTimes,
  type Schedule,
  type SignatureData,
  type Signer,
  sealDesignations,
  selectOperations,
  signAsSeal,
  signerFromKeyPair,
  softPasskeySigner,
  sortRegistrations,
  sortTickets,
  type Ticket,
  taggedHash,
  ticketContent,
  toBase64Url,
  toHex,
  type VerifyReport,
  verifyLedger,
  verifyRegistrationProof,
  verifyTicketSignature,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { type Ledger, RegisterLater } from "./ledger";

/**
 * 기기 안 연습 장부(docs/36 11-5 2번). 서버가 생기기 전까지 화면이 이것으로 응모 → 마감 → 추첨 →
 * 결과 → 이력 → 증명까지 돈다. 계산은 모두 규칙 패키지(`@mighty/stardraw-core`) 그대로이고,
 * 서버만 할 수 있는 일 둘을 흉내 낸다.
 * - drand: 진짜 공개 난수 대신 이 기기의 씨앗과 회차로 정한 값을 서명 자리에 넣는다(검사기는 서명 확인을 건너뛴다)
 * - 봉인 시각 증거(TSA): 마감 1분 뒤 받았다고 적는다
 * 연습 참가자(컴퓨터 24명)가 최근 회차마다 함께 응모해 등수별 당첨자 수가 비지 않게 한다.
 * 시각은 `Clock`으로 재고, 연습용 "건너뛰기"는 그 위에 더한 시간이다(시험은 ManualClock).
 */

/** 연습 장부의 작업 증명: 규칙(16MB)보다 훨씬 가볍게 해 기기에서 곧바로 풀린다 */
export const PRACTICE_POW: PowParams = { memorySize: 256, iterations: 1 };

/** 연습 참가자 수(최근 회차마다) */
export const PRACTICE_BOTS = 24;
/** 지금 회차에서 이만큼 앞 회차까지만 연습 참가자가 응모한다(오래 비운 뒤 따라잡기를 가볍게) */
const BOT_ROUNDS = 3;

/** 연습 장부 회차 길이: 매시 정각 추첨 · 55분 마감 */
export const PRACTICE_LENGTH = 3600;

export function practiceSchedule(epoch: number): Schedule {
  return {
    epoch,
    entries: [
      {
        fromRound: 1,
        length: PRACTICE_LENGTH,
        closeMargin: 5,
        powTarget: powTargetForTries(4),
        registerPowTarget: powTargetForTries(12),
      },
    ],
  };
}

/** 저장소(기본은 localStorage). 시험은 메모리를 넣는다 */
export interface LedgerStore {
  load(): string | null;
  save(text: string): void;
}

export interface LocalLedgerOptions {
  clock: Clock;
  store?: LedgerStore;
  policy: WebAuthnPolicy;
  /** 연습 drand 서명(48바이트)을 만드는 난수. 기본은 crypto */
  random?: (n: number) => Uint8Array;
  /** 연습 참가자 수(시험은 줄인다) */
  bots?: number;
}

/**
 * 저장 판. 2(2026-10-30): 원시 열쇠를 받지 않게 되며(docs/36 11-11) 컴퓨터 참가자가 원시 열쇠로
 * 등록했던 판 1 장부는 읽지 않고 새로 시작한다(새 epoch라 장부 표시도 바뀐다)
 */
const SAVE_VERSION = 2;

interface Saved {
  v: typeof SAVE_VERSION;
  epoch: number;
  /** 건너뛴 시간(초) */
  skipped: number;
  /** 연습 drand 값의 씨앗(이 기기에만) */
  secret: string;
  records: string[];
  tickets: string[][];
  registrations: string[][];
  pending: { round: number; tickets: string[]; registrations: string[] };
  /** 데모 관인(이 기기 안 서버 서명 열쇠, JWK). 처음 국장을 지정할 때 만든다 */
  seal?: { priv: JsonWebKey; pub: JsonWebKey };
  /** 데모의 "서버 설정"(STARDRAW_DIRECTOR_KEYS와 같은 값 목록) */
  directorKeys?: string[];
  /** 받아 두고 다음 기록에 실을 국장 운영 기록 */
  directorOps?: string[];
}

const OP_NAME: Record<Operation["kind"], string> = {
  "director-add": "국장 열쇠 지정",
  "director-remove": "국장 열쇠 빼기",
  "affiliation-add": "소속 추가",
  "affiliation-update": "소속 바꾸기",
  "affiliation-end": "소속 끝내기",
  cancel: "예고 취소",
  schedule: "일정 바꾸기",
};

/** 관리 화면이 보는 상태(서버 GET /api/director/state와 같은 모양) */
export interface DirectorState {
  now: number;
  records: number;
  schedule: Schedule;
  view: ReturnType<typeof operationsView>;
  submitted: { id: string; summary: string; effectiveRound: number }[];
}

export type LedgerPhase =
  /** 응모를 받는다 */
  | "open"
  /** 화면 마감(마감 여유) 뒤, 서버 마감 전 */
  | "closing"
  /** 앞 회차 추첨이 끝나야 이번 회차 문제 값이 나온다(마감 5분 뒤) */
  | "waiting";

export interface LedgerStatus {
  /** 지금 응모받는(또는 곧 받을) 회차 */
  round: number;
  times: RoundTimes;
  phase: LedgerPhase;
  /** 지금 시각(초) */
  now: number;
  /** 다음 추첨(마감한 회차의 drand 시각) */
  nextDrawAt: number;
  nextDrawRound: number;
  /** 이번 회차에 들어온 응모 수 */
  entries: number;
}

const enc = (b: Uint8Array) => toBase64Url(b);
const dec = (s: string) => fromBase64Url(s);

export class LocalLedger implements Ledger {
  readonly schedule: Schedule;
  readonly powParams = PRACTICE_POW;
  readonly mode = "practice" as const;
  private skipped: number;
  /** 연습 drand 값의 씨앗. 회차마다 정해진 값이라 데모는 당첨 번호를 미리 볼 수 있다 */
  private readonly secret: Uint8Array;
  private records: RoundRecord[];
  private tickets: Ticket[][];
  private registrations: KeyRegistration[][];
  private pending: {
    round: number;
    tickets: Ticket[];
    registrations: KeyRegistration[];
  };
  /** 등록된 열쇠(응모자 id hex) */
  private keys = new Set<string>();
  /** 운영 기록 상태(처음 쓸 때 기록을 다시 읽어 만든다) */
  private ops: OpsState | null = null;
  private seal: Saved["seal"];
  private directorKeys: string[];
  private directorOps: Operation[];
  private busy: Promise<unknown> = Promise.resolve();
  private readonly clock: Clock;
  private readonly store: LedgerStore | undefined;
  private readonly random: (n: number) => Uint8Array;
  private readonly bots: number;
  readonly policy: WebAuthnPolicy;

  constructor(options: LocalLedgerOptions) {
    this.clock = options.clock;
    this.store = options.store;
    this.policy = options.policy;
    this.random =
      options.random ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));
    this.bots = options.bots ?? PRACTICE_BOTS;
    const saved = this.read();
    // 처음 열면 다음 x:55가 1회차 마감(매시 정각 추첨)
    const epoch =
      saved?.epoch ??
      alignedEpoch(Math.floor(this.clock.now() / 1000), PRACTICE_LENGTH);
    this.schedule = practiceSchedule(epoch);
    this.skipped = saved?.skipped ?? 0;
    this.secret = saved?.secret ? dec(saved.secret) : this.random(32);
    this.records = (saved?.records ?? []).map((r) => decodeRecord(dec(r)));
    this.tickets = (saved?.tickets ?? []).map((l) =>
      l.map((t) => decodeTicket(dec(t))),
    );
    this.registrations = (saved?.registrations ?? []).map((l) =>
      l.map((r) => decodeRegistration(dec(r))),
    );
    this.pending = saved
      ? {
          round: saved.pending.round,
          tickets: saved.pending.tickets.map((t) => decodeTicket(dec(t))),
          registrations: saved.pending.registrations.map((r) =>
            decodeRegistration(dec(r)),
          ),
        }
      : { round: 1, tickets: [], registrations: [] };
    for (const list of [...this.registrations, this.pending.registrations])
      for (const r of list) this.keys.add(toHex(entrantId(r.pub)));
    this.seal = saved?.seal;
    this.directorKeys = saved?.directorKeys ?? [];
    this.directorOps = (saved?.directorOps ?? []).map((o) =>
      decodeOperation(dec(o)),
    );
  }

  id(): string {
    return `practice:${toHex(genesisHash(this.schedule))}`;
  }

  /** 지금 시각(초, 건너뛴 시간 포함) */
  now(): number {
    return Math.floor(this.clock.now() / 1000) + this.skipped;
  }

  /** 다음 회차 문제 값 = 마지막 기록 해시(1회차는 처음 일정표 해시) */
  head(): Uint8Array {
    const last = this.records.at(-1);
    return last ? recordHash(last) : genesisHash(this.schedule);
  }

  /** 마감했고 drand 시각이 지난 회차를 모두 추첨한다. 같은 일을 겹쳐 하지 않게 차례로 돈다 */
  settle(): Promise<void> {
    const run = this.busy.then(() => this.settleNow());
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async settleNow(): Promise<void> {
    let changed = false;
    for (;;) {
      const round = this.records.length + 1;
      const times = roundTimes(this.schedule, round);
      const drandRound = drandRoundForClose(times.closesAt);
      if (this.now() < drandTime(drandRound)) break;
      const prev = this.head();
      const mine =
        this.pending.round === round
          ? this.pending
          : { round, tickets: [], registrations: [] };
      const current = roundAt(this.schedule, this.now()) ?? round;
      const bots =
        current - round <= BOT_ROUNDS
          ? await this.botEntries(round, prev)
          : { tickets: [], registrations: [] };
      const tickets = [...mine.tickets, ...bots.tickets];
      const registrations = [...mine.registrations, ...bots.registrations];
      const beacon = this.beaconFor(round);
      // 서버처럼: 설정의 국장 열쇠 지정(데모 관인 서명)과 받아 둔 국장 요청을 같은 규칙으로 골라 싣는다
      const operations = await this.dueOperations(round, prev, registrations);
      const record = closeRound({
        schedule: this.schedule,
        round,
        prev,
        tickets,
        registrations,
        rootLoggedAt: times.closesAt + 60,
        beacon,
        operations,
      });
      this.records.push(record);
      // 장부의 목록은 id 순서(검사기가 정렬을 확인한다)
      this.tickets.push(sortTickets(tickets));
      this.registrations.push(sortRegistrations(registrations));
      for (const r of bots.registrations)
        this.keys.add(toHex(entrantId(r.pub)));
      if (this.pending.round <= round)
        this.pending = { round: round + 1, tickets: [], registrations: [] };
      if (this.ops) await applyRecordOps(this.ops, record, this.opsContext());
      if (operations.length > 0 || this.directorOps.length > 0)
        this.directorOps = [];
      changed = true;
    }
    if (changed) this.write();
  }

  /** 연습 참가자: 회차마다 새 흉내 패스키(UP·UV 켬)를 등록하고 무작위 번호로 한 장씩 낸다 */
  private async botEntries(round: number, challenge: Uint8Array) {
    const tickets: Ticket[] = [];
    const registrations: KeyRegistration[] = [];
    const entry = roundTimes(this.schedule, round).entry;
    for (let i = 0; i < this.bots; i++) {
      const signer = softPasskeySigner(await generateSigner(), {
        policy: this.policy,
      });
      const reg = await makeRegistration(
        signer,
        signer.credentialId,
        challenge,
        entry.registerPowTarget,
        { params: PRACTICE_POW },
      );
      const ticket = await makeTicket(
        signer,
        round,
        randomPick(this.random),
        challenge,
        entry.powTarget,
        { params: PRACTICE_POW },
      );
      if (reg && ticket) {
        registrations.push(reg);
        tickets.push(ticket);
      }
    }
    return { tickets, registrations };
  }

  status(): LedgerStatus {
    const now = this.now();
    const round = roundAt(this.schedule, now) ?? 1;
    const times = roundTimes(this.schedule, round);
    const ready = this.records.length >= round - 1;
    const phase: LedgerPhase = !ready
      ? "waiting"
      : now >= times.entryDeadline
        ? "closing"
        : "open";
    const drawRound = this.records.length + 1;
    const drawTimes = roundTimes(this.schedule, drawRound);
    return {
      round,
      times,
      phase,
      now,
      nextDrawRound: drawRound,
      nextDrawAt: drandTime(drandRoundForClose(drawTimes.closesAt)),
      entries: this.pending.round === round ? this.pending.tickets.length : 0,
    };
  }

  isRegistered(pub: Uint8Array): boolean {
    return this.keys.has(toHex(entrantId(pub)));
  }

  async passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null> {
    const id = toHex(credentialId);
    for (const list of [...this.registrations, this.pending.registrations])
      for (const r of list) if (toHex(r.credentialId) === id) return r.pub;
    if (everDirector(await this.opsState(), new Uint8Array(0), credentialId))
      throw new Error("이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다");
    return null;
  }

  async registeredRound(pub: Uint8Array): Promise<number | null> {
    const who = toHex(entrantId(pub));
    const found = this.registrations.findIndex((list) =>
      list.some((r) => toHex(entrantId(r.pub)) === who),
    );
    if (found >= 0) return found + 1;
    return this.pending.registrations.some(
      (r) => toHex(entrantId(r.pub)) === who,
    )
      ? this.pending.round
      : null;
  }

  /** 등록만 받기(서버 `POST /api/register`와 같은 확인). 등록 회차를 돌려준다 */
  async register(
    registration: KeyRegistration,
    proof: SignatureData,
    challenge: Uint8Array,
  ): Promise<{ round: number }> {
    await this.settle();
    const known = await this.registeredRound(registration.pub);
    if (known !== null) return { round: known };
    const now = this.now();
    const round = roundAt(this.schedule, now);
    if (round === null) throw new RegisterLater();
    const times = roundTimes(this.schedule, round);
    if (this.records.length < round - 1 || now >= times.closesAt)
      throw new RegisterLater();
    if (toHex(challenge) !== toHex(this.head()))
      throw new RegisterLater("회차가 바뀌었습니다. 다시 계산해 주세요");
    const problem = checkRegistration(registration);
    if (problem) throw new Error(problem);
    if (
      everDirector(
        await this.opsState(),
        registration.pub,
        registration.credentialId,
      )
    )
      throw new Error("이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다");
    if (await this.passkeyPub(registration.credentialId))
      throw new Error("이미 다른 열쇠로 등록된 패스키입니다");
    if (!(await verifyRegistrationProof(registration, proof, this.policy)))
      throw new Error("등록 서명이 맞지 않습니다");
    if (
      !(await checkPow(
        challenge,
        registrationContent(registration),
        registration.nonce,
        times.entry.registerPowTarget,
        PRACTICE_POW,
      ))
    )
      throw new Error("열쇠 등록 계산이 맞지 않습니다");
    if (this.pending.round !== round)
      this.pending = { round, tickets: [], registrations: [] };
    this.pending.registrations.push(registration);
    this.keys.add(toHex(entrantId(registration.pub)));
    this.write();
    return { round };
  }

  /** 응모권 받기(서버가 할 확인을 그대로 한다). 받은 시각(초)을 돌려준다 */
  async submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }> {
    await this.settle();
    const now = this.now();
    const round = roundAt(this.schedule, now);
    if (round !== null && ticket.round < round)
      throw new Error(closedMessage(now));
    if (round === null || ticket.round !== round)
      throw new Error("이번 회차 응모권이 아닙니다");
    const times = roundTimes(this.schedule, round);
    if (this.records.length < round - 1)
      throw new Error("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다");
    if (now >= times.closesAt) throw new Error(closedMessage(now));
    if (this.pending.round !== round)
      this.pending = { round, tickets: [], registrations: [] };
    const who = toHex(entrantId(ticket.pub));
    if (this.pending.tickets.some((t) => toHex(entrantId(t.pub)) === who))
      throw new Error("이번 회차에는 이미 응모했습니다");
    const challenge = this.head();
    if (registration) {
      if (toHex(entrantId(registration.pub)) !== who)
        throw new Error("응모권과 다른 열쇠의 등록입니다");
      const problem = checkRegistration(registration);
      if (problem) throw new Error(problem);
      if (
        everDirector(
          await this.opsState(),
          registration.pub,
          registration.credentialId,
        )
      )
        throw new Error("이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다");
      if (
        !this.keys.has(who) &&
        !(await checkPow(
          challenge,
          registrationContent(registration),
          registration.nonce,
          times.entry.registerPowTarget,
          PRACTICE_POW,
        ))
      )
        throw new Error("열쇠 등록 계산이 맞지 않습니다");
    } else if (!this.keys.has(who)) {
      throw new Error("등록되지 않은 열쇠입니다");
    }
    if (
      !(await checkPow(
        challenge,
        ticketContent(ticket),
        ticket.nonce,
        times.entry.powTarget,
        PRACTICE_POW,
      ))
    )
      throw new Error("응모 계산이 맞지 않습니다");
    if (!(await verifyTicketSignature(ticket, this.policy)))
      throw new Error("응모권 서명이 맞지 않습니다");
    this.pending.tickets.push(ticket);
    if (registration && !this.keys.has(who)) {
      this.pending.registrations.push(registration);
      this.keys.add(who);
    }
    this.write();
    return { receivedAt: now };
  }

  /** 닫힌 회차 기록과 응모권 목록 */
  closed(): { record: RoundRecord; tickets: readonly Ticket[] }[] {
    return this.records.map((record, i) => ({
      record,
      tickets: this.tickets[i] ?? [],
    }));
  }

  record(round: number): RoundRecord | undefined {
    return this.records[round - 1];
  }

  ticketsOf(round: number): readonly Ticket[] {
    return this.tickets[round - 1] ?? [];
  }

  /** 장부 전체를 처음부터 다시 계산한다(연습 drand는 서명 확인을 건너뛴다) */
  verify(mine: readonly Uint8Array[] = []): Promise<VerifyReport> {
    return verifyLedger(
      this.schedule,
      this.records,
      this.tickets,
      this.registrations,
      {
        beaconVerifier: () => true,
        powParams: PRACTICE_POW,
        mine,
        webauthnPolicy: this.policy,
      },
    );
  }

  /** 연습 drand 값: 씨앗과 회차로 정한 48바이트(진짜 drand 서명 자리) */
  private beaconFor(round: number): DrandBeacon {
    const { closesAt } = roundTimes(this.schedule, round);
    const tag = (i: number) =>
      taggedHash(
        "stardraw/practice-beacon",
        this.secret,
        new ByteWriter().u32(round).u8(i).done(),
      );
    return {
      round: drandRoundForClose(closesAt),
      signature: concat(tag(0), tag(1).slice(0, 16)),
    };
  }

  /** 데모 전용: 그 회차의 당첨 번호를 미리 본다(진짜 장부에는 없는 기능) */
  peekDraw(round: number): Draw {
    return drawNumbers(drawSeed(round, drandRandomness(this.beaconFor(round))));
  }

  // ── 국장(데모 국장 모드, docs/36 11-12) ──

  private opsContext(): OpsContext {
    return {
      policy: this.policy,
      isEntrant: (pub, credentialId) =>
        this.keys.has(toHex(entrantId(pub))) ||
        (credentialId !== null &&
          [...this.registrations, this.pending.registrations].some((l) =>
            l.some((r) => toHex(r.credentialId) === toHex(credentialId)),
          )),
    };
  }

  /** 운영 기록 상태. 처음 부르면 닫힌 기록을 검사기와 같은 규칙으로 다시 읽는다 */
  private async opsState(): Promise<OpsState> {
    if (!this.ops) {
      const state = newOpsState(this.schedule);
      for (const record of this.records)
        await applyRecordOps(state, record, this.opsContext());
      this.ops = state;
    }
    return this.ops;
  }

  private async sealSigner(): Promise<Signer> {
    const algorithm = { name: "ECDSA", namedCurve: "P-256" };
    if (!this.seal) {
      const pair = await crypto.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ]);
      this.seal = {
        priv: await crypto.subtle.exportKey("jwk", pair.privateKey),
        pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
      };
      this.write();
    }
    return signerFromKeyPair({
      privateKey: await crypto.subtle.importKey(
        "jwk",
        this.seal.priv,
        algorithm,
        false,
        ["sign"],
      ),
      publicKey: await crypto.subtle.importKey(
        "jwk",
        this.seal.pub,
        algorithm,
        true,
        ["verify"],
      ),
    });
  }

  private async dueOperations(
    round: number,
    prev: Uint8Array,
    registrations: readonly KeyRegistration[],
  ): Promise<Operation[]> {
    if (
      this.directorKeys.length === 0 &&
      this.directorOps.length === 0 &&
      !this.ops?.ops.length
    )
      return [];
    const state = await this.opsState();
    const base = this.opsContext();
    // 이 회차에 함께 들어가는 등록도 우주인으로 친다
    const ctx: OpsContext = {
      ...base,
      isEntrant: (pub, cred) =>
        base.isEntrant(pub, cred) ||
        registrations.some(
          (r) => toHex(entrantId(r.pub)) === toHex(entrantId(pub)),
        ),
    };
    const designations = sealDesignations(
      state,
      round,
      prev,
      parseDirectorKeys(this.directorKeys.join(",")),
      ctx,
    );
    const seal =
      designations.bodies.length > 0 ? await this.sealSigner() : null;
    const sealOps = seal
      ? await Promise.all(designations.bodies.map((b) => signAsSeal(b, seal)))
      : [];
    const { accepted } = await selectOperations(
      state,
      round,
      prev,
      [...sealOps, ...this.directorOps],
      ctx,
    );
    return accepted;
  }

  /** 데모의 "서버 설정에 넣기": 다음 기록에 데모 관인이 국장 열쇠 지정을 싣는다 */
  designateDirector(config: string): void {
    parseDirectorKeys(config);
    if (!this.directorKeys.includes(config)) this.directorKeys.push(config);
    this.write();
  }

  /** 관리 화면 상태(서버 /api/director/state와 같은 모양) */
  async directorState(): Promise<DirectorState> {
    await this.settle();
    const state = await this.opsState();
    return {
      now: this.now(),
      records: this.records.length,
      schedule: this.schedule,
      view: operationsView(state, this.records.length, this.head()),
      submitted: this.directorOps.map((op) => ({
        id: toHex(opId(op)),
        summary: OP_NAME[op.kind],
        effectiveRound: op.effectiveRound,
      })),
    };
  }

  /** 국장 운영 기록 받기(서버 POST /api/director/ops와 같은 확인) */
  async submitOperation(
    op: Operation,
  ): Promise<{ id: string; round: number; effectiveRound: number }> {
    await this.settle();
    const state = await this.opsState();
    const round = this.records.length + 1;
    const head = this.head();
    if (op.signer.role !== "director")
      throw new Error("국장 패스키로 서명한 요청만 받습니다");
    if (toHex(op.after) !== toHex(head))
      throw new Error(
        "그사이 장부에 기록이 하나 더 닫혔습니다. 다시 서명해 주세요",
      );
    const id = toHex(opId(op));
    if (this.directorOps.some((o) => toHex(opId(o)) === id))
      throw new Error("이미 받은 요청입니다");
    const { rejected } = await selectOperations(
      state,
      round,
      head,
      [...this.directorOps, op],
      this.opsContext(),
    );
    const mine = rejected.find((r) => toHex(opId(r.op)) === id);
    if (mine)
      throw new Error(
        /국장 열쇠가 아니다/.test(mine.problem)
          ? "국장 열쇠가 아닙니다. 우주국이 지정한 국장 패스키로 서명해 주세요"
          : mine.problem,
      );
    this.directorOps.push(op);
    this.write();
    return { id, round, effectiveRound: op.effectiveRound };
  }

  /** 데모용: n회차만큼 시간을 건너뛰고 추첨한다(「예고 건너뛰기」는 5회차) */
  async skipRounds(n: number): Promise<void> {
    await this.settle();
    const target = this.status().nextDrawAt + (n - 1) * PRACTICE_LENGTH + 1;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  /** 연습용: 이번 회차 마감 시각까지 건너뛴다 */
  async skipToClose(): Promise<void> {
    await this.settle();
    const target = this.status().times.closesAt;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  /** 연습용: 다음 추첨 시각까지 시간을 건너뛰고 추첨한다 */
  async skipToNextDraw(): Promise<void> {
    await this.settle();
    const target = this.status().nextDrawAt + 1;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  private read(): Saved | null {
    try {
      const text = this.store?.load();
      if (!text) return null;
      const saved = JSON.parse(text) as Saved;
      return saved.v === SAVE_VERSION ? saved : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    const saved: Saved = {
      v: SAVE_VERSION,
      epoch: this.schedule.epoch,
      skipped: this.skipped,
      secret: enc(this.secret),
      records: this.records.map((r) => enc(encodeRecord(r))),
      tickets: this.tickets.map((l) => l.map((t) => enc(encodeTicket(t)))),
      registrations: this.registrations.map((l) =>
        l.map((r) => enc(encodeRegistration(r))),
      ),
      pending: {
        round: this.pending.round,
        tickets: this.pending.tickets.map((t) => enc(encodeTicket(t))),
        registrations: this.pending.registrations.map((r) =>
          enc(encodeRegistration(r)),
        ),
      },
      ...(this.seal ? { seal: this.seal } : {}),
      ...(this.directorKeys.length > 0
        ? { directorKeys: this.directorKeys }
        : {}),
      ...(this.directorOps.length > 0
        ? { directorOps: this.directorOps.map((o) => enc(encodeOperation(o))) }
        : {}),
    };
    this.store?.save(JSON.stringify(saved));
  }
}

/** 1~45에서 서로 다른 6개(거절 표본) */
export function randomPick(random: (n: number) => Uint8Array): number[] {
  const picked = new Set<number>();
  while (picked.size < 6) {
    for (const b of random(16)) {
      if (b >= 225) continue;
      picked.add((b % 45) + 1);
      if (picked.size === 6) break;
    }
  }
  return [...picked].sort((a, b) => a - b);
}
