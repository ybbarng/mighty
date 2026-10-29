import type { Clock } from "@mighty/fair-play";
import {
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRoundForClose,
  drandTime,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  fromHex,
  type KeyRegistration,
  POW_PARAMS,
  type PowParams,
  type RoundRecord,
  roundAt,
  roundTimes,
  type Schedule,
  type Ticket,
  toBase64Url,
  type VerifyOptions,
  type VerifyReport,
  verifyLedger,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import type { Ledger } from "./ledger";
import type { LedgerPhase, LedgerStatus } from "./local-ledger";

/**
 * 서버 장부(docs/36 11-5 3번). 같은 출처 `/stardraw-api`(apps/stardraw-server)를 부른다.
 * - 상태(`/api/state`)는 10초마다, 추첨 시각 무렵에는 3초마다 묻는다(1초마다 부르는 화면이 서버를 두드리지 않게)
 * - 닫힌 회차 파일(`/ledger/rounds/…`)은 바뀌지 않으므로 한 번만 받는다
 * - 기기 시계가 틀려도 되게 서버 시각과의 차이를 재 둔다(마감은 서버가 받은 시각으로 정한다)
 * 장부 검사는 받은 파일만으로 처음부터 다시 한다(drand 서명도 실제로 확인한다).
 */

interface StateJson {
  now: number;
  round: number;
  records: number;
  sealed: number;
  head: string;
  entries: number;
  serverKey: string;
}

export interface RemoteLedgerOptions {
  /** 예: "/stardraw-api" */
  base: string;
  clock: Clock;
  policy: WebAuthnPolicy;
  fetch?: typeof fetch;
  /** 작업 증명 세기(기본은 규칙의 16MB. 시험 서버는 가볍게 돈다) */
  powParams?: PowParams;
  /** 장부 검사 옵션 덧붙이기(시험은 가짜 drand 서명을 받는다) */
  verifyOptions?: Partial<VerifyOptions>;
}

const STATE_EVERY = 10;
const STATE_EVERY_NEAR_DRAW = 3;

export class RemoteLedger implements Ledger {
  readonly powParams: PowParams;
  private genesis: Schedule | null = null;
  private state: StateJson | null = null;
  /** 서버 시각 - 기기 시각(초) */
  private offset = 0;
  private lastState = -Infinity;
  private records: RoundRecord[] = [];
  private tickets: Ticket[][] = [];
  private registrations: KeyRegistration[][] = [];
  private registered = new Set<string>();
  private busy: Promise<unknown> = Promise.resolve();
  private readonly f: typeof fetch;

  constructor(private readonly o: RemoteLedgerOptions) {
    this.f = o.fetch ?? ((...args) => fetch(...args));
    this.powParams = o.powParams ?? POW_PARAMS;
  }

  get schedule(): Schedule {
    if (!this.genesis) throw new Error("장부를 아직 받지 못했습니다");
    return this.genesis;
  }

  now(): number {
    return Math.floor(this.o.clock.now() / 1000) + this.offset;
  }

  head(): Uint8Array {
    if (!this.state) throw new Error("장부를 아직 받지 못했습니다");
    return fromHex(this.state.head);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.f(`${this.o.base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`장부를 받지 못했습니다(${res.status})`);
    return (await res.json()) as T;
  }

  settle(force = false): Promise<void> {
    const run = this.busy.then(() => this.settleNow(force));
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async settleNow(force: boolean): Promise<void> {
    if (!this.genesis) {
      const g = await this.get<{ schedule: Schedule }>("/ledger/genesis.json");
      this.genesis = g.schedule;
    }
    const local = Math.floor(this.o.clock.now() / 1000);
    const nearDraw = this.state && this.now() >= this.status().nextDrawAt;
    const every = nearDraw ? STATE_EVERY_NEAR_DRAW : STATE_EVERY;
    if (force || !this.state || local - this.lastState >= every) {
      this.state = await this.get<StateJson>("/api/state");
      this.lastState = local;
      this.offset = this.state.now - local;
    }
    // 닫힌 회차 파일을 차례로 받는다
    while (this.records.length < this.state.records) {
      const round = this.records.length + 1;
      const file = await this.get<{
        record: string;
        tickets: string[];
        registrations: string[];
      }>(`/ledger/rounds/${String(round).padStart(6, "0")}.json`);
      this.records.push(decodeRecord(fromBase64Url(file.record)));
      this.tickets.push(
        file.tickets.map((t) => decodeTicket(fromBase64Url(t))),
      );
      const regs = file.registrations.map((r) =>
        decodeRegistration(fromBase64Url(r)),
      );
      this.registrations.push(regs);
      for (const r of regs) this.registered.add(toBase64Url(r.pub));
    }
  }

  status(): LedgerStatus {
    const now = this.now();
    const schedule = this.schedule;
    const round = roundAt(schedule, now) ?? 1;
    const times = roundTimes(schedule, round);
    const closedCount = this.state?.records ?? this.records.length;
    const ready = closedCount >= round - 1;
    const phase: LedgerPhase = !ready
      ? "waiting"
      : now >= times.entryDeadline
        ? "closing"
        : "open";
    const drawRound = closedCount + 1;
    const drawTimes = roundTimes(schedule, drawRound);
    return {
      round,
      times,
      phase,
      now,
      nextDrawRound: drawRound,
      nextDrawAt: drandTime(drandRoundForClose(drawTimes.closesAt)),
      entries: this.state?.round === round ? this.state.entries : 0,
    };
  }

  async isRegistered(pub: Uint8Array): Promise<boolean> {
    const key = toBase64Url(pub);
    if (this.registered.has(key)) return true;
    const { registered } = await this.get<{ registered: boolean }>(
      `/api/keys/${key}`,
    );
    if (registered) this.registered.add(key);
    return registered;
  }

  async passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null> {
    const res = await this.f(
      `${this.o.base}/api/passkeys/${toBase64Url(credentialId)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`장부에 묻지 못했습니다(${res.status})`);
    const { pub } = (await res.json()) as { pub: string };
    return fromBase64Url(pub);
  }

  async submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }> {
    const res = await this.f(`${this.o.base}/api/enter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket: toBase64Url(encodeTicket(ticket)),
        ...(registration
          ? { registration: toBase64Url(encodeRegistration(registration)) }
          : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      receivedAt?: number;
    };
    if (!res.ok || body.receivedAt === undefined)
      throw new Error(body.error ?? `응모를 내지 못했습니다(${res.status})`);
    this.registered.add(toBase64Url(ticket.pub));
    await this.settle(true);
    return { receivedAt: body.receivedAt };
  }

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

  verify(mine: readonly Uint8Array[] = []): Promise<VerifyReport> {
    return verifyLedger(
      this.schedule,
      this.records,
      this.tickets,
      this.registrations,
      {
        powParams: this.powParams,
        mine,
        webauthnPolicy: this.o.policy,
        ...this.o.verifyOptions,
      },
    );
  }
}
