import type { Card } from "@mighty/engine";
import { type Clock, realClock } from "./clock";
import {
  type KeyProof,
  type KeyStatement,
  proveKeys,
  verifyKeys,
} from "./proof";
import {
  encodedDeck,
  Party,
  type PartySnapshot,
  PublicLedger,
  type RevealReason,
} from "./protocol";
import { loadRistretto255 } from "./ristretto";
import {
  answerShuffle,
  challengeBits,
  commitShuffle,
  nonceCommit,
  type ShuffleAnswer,
  type ShuffleCommit,
  type ShuffleLabel,
  type ShuffleWork,
  shuffleNonce,
  verifyShuffle,
} from "./shuffle-proof";
import { GROUP_1024, GROUP_2048, modInverse, type SraGroup } from "./sra";

/*
 * 메시지로 하는 멘탈 포커. 기기마다 FairDevice 하나가 섞기 사슬에 끼고, 열쇠를 공개하고, 자기 카드를 연다.
 * 메시지는 모두 모두에게 보낸다(공개 정보). 보낸 기기가 정말 그 기기인지는 부르는 쪽이 확인해 넘긴다.
 * 어느 자리를 누구에게 줄지는 부르는 쪽이 공개 정보(엔진 화면)로 정해 `assign`으로 알린다.
 * 기기는 거기에 맞춰서만 남의 자리 열쇠를 내준다.
 */

declare function setTimeout(callback: () => void, ms: number): unknown;

/** 내 카드가 이만큼 안 열리면 섞기 증명을 그냥 만든다(scheduleShuffleProof). 남이 기다리는 시간(proofTimeoutMs)보다 짧아야 한다 */
export const PROOF_DEFER_MS = 10_000;

/** 잠그기 군. r255(타원곡선 ristretto255)가 기본이고, 곱셈군은 예전 방과 시험용이다 */
export type GroupName = "1024" | "2048" | "r255";
const GROUPS: Partial<Record<GroupName, SraGroup>> = {
  "1024": GROUP_1024,
  "2048": GROUP_2048,
};

/** 군을 쓸 수 있게 준비한다(r255는 libsodium을 불러온다). 기기를 만들기 전에 부른다 */
export async function prepareGroup(name: GroupName): Promise<SraGroup> {
  if (name === "r255") GROUPS.r255 ??= await loadRistretto255();
  return groupOf(name);
}

/** 준비한 군. 준비하지 않았으면 던진다 */
export function groupOf(name: GroupName): SraGroup {
  const g = GROUPS[name];
  if (!g) throw new Error(`잠그기 군 ${name}을 준비하지 않았다(prepareGroup)`);
  return g;
}

type Stage = "shuffle" | "relock" | "convert" | "poolShuffle" | "poolRelock";

export type FairWire =
  | {
      t: "fp";
      k: "chain";
      deal: number;
      /** 같은 판의 몇 번째 사슬인가(다시 나누기마다 하나씩 는다) */
      round: number;
      stage: Stage;
      index: number;
      deck: string[];
      /**
       * 다시 잠그는 단계(relock·poolRelock)에서 V = g^u. 공개한 자리 열쇠를 증명할 때 쓴다(proof.ts).
       * 다시 나누기 바꾸기(convert)에서는 V = g^(1/p)(p는 그 단계 섞기 열쇠)
       */
      v?: string;
      /** 섞는 단계(shuffle·poolShuffle)에서 섞기 증명의 nonce 해시(shuffle-proof.ts) */
      nc?: string;
    }
  | {
      t: "fp";
      k: "keys";
      deal: number;
      from: number;
      /**
       * 누구의 열쇠인가(없으면 보낸 기기). 하트에서 넘겨받은 카드를 낼 때 넘겨준 사람 열쇠를 대신 공개한다.
       * 틀린 열쇠면 카드가 열리지 않아 드러난다
       */
      of?: number;
      reason: RevealReason;
      keys: [number, string][];
      /** 열쇠 증명: 이 열쇠들이 다시 잠글 때 쓴 것이다. 사슬(처음 나누기·다시 나누기)마다 하나 */
      proofs?: { round: number; proof: KeyProof }[];
    }
  /** 하트 카드 넘기기: 넘기는 카드의 내 열쇠를 받는 기기에게만 직접 보낸다(방장을 거치지 않는다) */
  | {
      t: "fp";
      k: "handover";
      deal: number;
      from: number;
      to: number;
      keys: [number, string][];
      /** 자리마다 열쇠 증명. 받은 기기가 그 카드를 낼 때 넘겨준 사람 열쇠와 함께 그대로 공개한다 */
      proofs?: [number, KeyProof][];
    }
  /**
   * 섞기 증명(shuffle-proof.ts). 섞은 덱을 넘긴 뒤 따로 보낸다: 약속(중간 덱들) → 모두의 약속이 모이면
   * nonce 공개 → 모두의 nonce로 정한 도전값에 응답. 판 진행은 이것을 기다리지 않는다
   */
  | {
      t: "fp";
      k: "sproof";
      deal: number;
      from: number;
      round: number;
      stage: "shuffle" | "poolShuffle";
      commit?: ShuffleCommit;
      nonce?: string;
      answers?: ShuffleAnswer[];
    }
  /** 6·7마 바꾸기(convert) 증명: 판 끝에 공개한 자리 열쇠로 그 단계를 정직하게 했는지 */
  | {
      t: "fp";
      k: "cproof";
      deal: number;
      from: number;
      proof: KeyProof;
    };

/** 섞는 단계 하나(`${round}:${stage}`)의 섞기 증명 진행 */
interface ShuffleState {
  round: number;
  stage: "shuffle" | "poolShuffle";
  /** 기기 → nonce 해시(사슬 메시지에 걸었다) */
  nc: Map<number, string>;
  commits: Map<number, ShuffleCommit>;
  nonces: Map<number, string>;
  answers: Map<number, ShuffleAnswer[]>;
  bits: number[] | null;
  /** 기기 → 확인 결과 */
  checked: Map<number, Promise<boolean>>;
  work: ShuffleWork | null;
  proving: boolean;
  sentNonce: boolean;
  sentAnswer: boolean;
  /** 도전값이 정해진 뒤 응답 기다리기가 끝났다 */
  timedOut: boolean;
}

export interface DeviceEvents {
  /** 내 자리 카드를 열었다 */
  cards: (deal: number, cards: ReadonlyMap<number, Card>) => void;
  /** 새 자리들이 생겼다(처음 나누기·다시 나누기). 첫 자리 번호와 수 */
  slots: (deal: number, base: number, count: number) => void;
  /** 누가 열쇠를 공개했다 */
  keys: (deal: number, from: number, slots: number[]) => void;
  /**
   * 이상한 일(내 카드가 안 열린다, 같은 자리에 다른 열쇠 등). `pending`이면 부정은 확실하지만
   * 누군지 확인하는 중이라 확정 알림이 뒤따른다
   */
  problem: (
    deal: number,
    reason: string,
    device: number | null,
    pending?: boolean,
  ) => void;
  /** 새 열쇠를 만들었다(새로고침에 대비해 남겨 둘 때) */
  persist: () => void;
  /**
   * 시간 재기(연결 진단). `begin`은 새 판을 시작한 때(ms 0), 그 밖은 이 기기가 한 무거운 계산에
   * 걸린 시간: `compute`(섞기·다시 잠그기 단계), `proof`(섞기 증명 약속), `answer`(섞기 증명 응답)
   */
  timing: (
    deal: number,
    what: "begin" | "compute" | "proof" | "answer",
    ms: number,
    stage?: string,
  ) => void;
}

interface DealCtx {
  id: number;
  devices: number[];
  party: Party;
  ledger: PublicLedger;
  /** 자리 → 받는 기기 */
  owners: Map<number, number>;
  /** 사슬 결과: `${round}:${stage}:${index}` → 덱 */
  chains: Map<string, bigint[]>;
  /** 진행 중인 사슬 */
  round: number;
  pool: number[] | null;
  /** 내가 이미 공개한 자리 */
  published: Set<number>;
  /** 내가 연 카드 */
  mine: Map<number, Card>;
  initial: Card[];
  done: Set<string>;
  /** 넘겨받은 카드: 자리 → 넘겨준 기기와 그 열쇠, 그 열쇠 증명 */
  handed: Map<number, { of: number; key: bigint; proof?: KeyProof }>;
  /** 다시 잠그는 단계의 V(`${round}:${index}` → V) */
  commitments: Map<string, bigint>;
  /** 남이 공개한 열쇠의 증명(`${slot}:${기기}` → 그 열쇠를 낸 메시지). 카드가 안 열릴 때 누가 틀렸는지 본다 */
  proofs: Map<string, ProofRecord>;
  /** 이미 탓한 자리(같은 자리를 두 번 알리지 않는다) */
  blamed: Set<number>;
  /** 섞는 단계마다 섞기 증명 진행 */
  shuffles: Map<string, ShuffleState>;
  /** 내 카드가 열리기를 기다리는 내 섞기 증명(scheduleShuffleProof) */
  deferredProofs: Set<ShuffleState>;
  /** 기기 → 바꾸기(convert) 증명 */
  cproofs: Map<number, KeyProof>;
  /** 판 끝 공개를 했는데 섞기 사슬이 아직이다(새로고침 뒤 다시 처리할 때). 끝나면 공개한다 */
  auditPending: boolean;
  /** 계산해 보낸 사슬 차례. 새로고침 전 것이 없으면(예전 저장) null */
  sent: Set<string> | null;
}

/** 공개된 열쇠 몇 개와 그 증명. `sender`는 메시지를 보낸 기기(넘겨받은 열쇠를 대신 공개하면 `device`와 다르다) */
interface ProofRecord {
  device: number;
  sender: number;
  round: number;
  keys: [number, bigint][];
  proof: KeyProof;
  /** 확인한 결과(한 번만 계산한다) */
  checked?: Promise<boolean | null>;
}

export interface FairDeviceOptions {
  id: number;
  group: GroupName;
  send: (message: FairWire) => void;
  /** 한 기기에게만 보낸다(하트 카드 넘기기 열쇠) */
  sendTo?: (message: FairWire, device: number) => void;
  /** 새로고침 전에 남겨 둔 열쇠(`snapshotAll`) */
  restore?: Record<number, PartySnapshot>;
  /** 섞기 증명 도전값이 정해진 뒤 응답을 기다리는 시간. 지나도 응답하지 않으면 그 기기를 짚는다 */
  proofTimeoutMs?: number;
  /** 제한 시간을 재는 시계. 시험은 ManualClock을 넣는다 */
  clock?: Clock;
}

/** 다시 잠그는 단계에서 푸는 섞기 열쇠(그 단계의 V를 낸다) */
const RELOCK_PASSES: Partial<Record<Stage, readonly string[]>> = {
  relock: ["shuffle"],
  poolRelock: ["pool", "poolShuffle"],
};

export class FairDevice {
  readonly id: number;
  readonly g: SraGroup;
  private readonly send: (message: FairWire) => void;
  private readonly sendTo: ((message: FairWire, device: number) => void) | null;
  private readonly proofTimeoutMs: number;
  private readonly clock: Clock;
  private readonly deals = new Map<number, DealCtx>();
  private work: Promise<void> = Promise.resolve();
  private readonly listeners: {
    [K in keyof DeviceEvents]: Set<DeviceEvents[K]>;
  } = {
    cards: new Set(),
    slots: new Set(),
    keys: new Set(),
    problem: new Set(),
    persist: new Set(),
    timing: new Set(),
  };
  /** 새로고침 전에 남겨 둔 열쇠(판 번호 → 열쇠) */
  private readonly restored: Map<number, PartySnapshot>;

  constructor(options: FairDeviceOptions) {
    this.id = options.id;
    this.g = groupOf(options.group);
    this.send = options.send;
    this.sendTo = options.sendTo ?? null;
    this.proofTimeoutMs = options.proofTimeoutMs ?? 30_000;
    this.clock = options.clock ?? realClock;
    this.restored = new Map(
      Object.entries(options.restore ?? {}).map(([deal, snap]) => [
        Number(deal),
        snap,
      ]),
    );
  }

  /** 모든 판의 내 열쇠(새로고침에 대비해 남긴다) */
  snapshotAll(): Record<number, PartySnapshot> {
    const out: Record<number, PartySnapshot> = {};
    for (const [deal, ctx] of this.deals)
      out[deal] = {
        ...ctx.party.snapshot(),
        handed: [...ctx.handed].map(([slot, h]) =>
          h.proof
            ? [slot, h.of, h.key.toString(16), h.proof]
            : [slot, h.of, h.key.toString(16)],
        ),
        sent: [...(ctx.sent ?? [])],
      };
    return out;
  }

  on<K extends keyof DeviceEvents>(
    event: K,
    listener: DeviceEvents[K],
  ): () => void {
    const set = this.listeners[event] as Set<DeviceEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit<K extends keyof DeviceEvents>(
    event: K,
    ...args: Parameters<DeviceEvents[K]>
  ): void {
    for (const l of this.listeners[event] as Set<
      (...a: Parameters<DeviceEvents[K]>) => void
    >)
      l(...args);
  }

  /** 순서대로 처리한다(계산이 비동기라 메시지가 겹쳐 와도 섞이지 않게) */
  private queue(task: () => Promise<void> | void): Promise<void> {
    this.queued++;
    this.work = this.work
      .then(task)
      .catch((e) => {
        this.emit(
          "problem",
          -1,
          e instanceof Error ? e.message : String(e),
          null,
        );
      })
      .finally(() => {
        this.queued--;
      });
    return this.work;
  }

  /** 작업 줄에 남은 일의 수 */
  private queued = 0;

  /** 지금 할 일(작업 줄·섞기 증명 계산)이 남았나(시험용) */
  busy(): boolean {
    return this.queued > 0 || this.background.size > 0;
  }

  /** 작업 줄 밖에서 도는 계산(섞기 증명). idle이 함께 기다린다 */
  private readonly background = new Set<Promise<unknown>>();
  private track(p: Promise<unknown>): void {
    this.background.add(p);
    const forget = () => this.background.delete(p);
    p.then(forget, forget);
  }

  /** 작업 줄(받은 메시지 처리)이 빌 때까지 기다린다. 섞기 증명 계산은 기다리지 않는다 */
  async settled(): Promise<void> {
    for (;;) {
      const work = this.work;
      await work;
      if (work === this.work) return;
    }
  }

  /** 작업 줄과 섞기 증명 계산이 모두 끝날 때까지 기다린다(시험용) */
  async idle(): Promise<void> {
    for (;;) {
      const work = this.work;
      const background = [...this.background];
      await Promise.all([work, ...background.map((p) => p.catch(() => {}))]);
      if (work === this.work && this.background.size === 0) return;
    }
  }

  ledger(deal: number): PublicLedger | null {
    return this.deals.get(deal)?.ledger ?? null;
  }

  devicesOf(deal: number): readonly number[] {
    return this.deals.get(deal)?.devices ?? [];
  }

  /** 내가 연 카드(자리 → 카드) */
  myCards(deal: number): ReadonlyMap<number, Card> {
    return this.deals.get(deal)?.mine ?? new Map();
  }

  ownerOf(deal: number, slot: number): number | undefined {
    return this.deals.get(deal)?.owners.get(slot);
  }

  /** 새 판을 나눈다. `devices` 순서로 섞고, `cards`는 그 규칙의 덱 */
  start(
    deal: number,
    devices: readonly number[],
    cards: readonly Card[],
  ): void {
    if (this.deals.has(deal)) return;
    const ctx: DealCtx = {
      id: deal,
      devices: [...devices],
      party: this.restored.has(deal)
        ? Party.restore(this.g, this.restored.get(deal) as PartySnapshot)
        : new Party(this.id, this.g),
      ledger: new PublicLedger(this.g),
      owners: new Map(),
      chains: new Map(),
      round: 0,
      pool: null,
      published: new Set(),
      mine: new Map(),
      initial: [...cards],
      done: new Set(),
      handed: new Map(),
      commitments: new Map(),
      proofs: new Map(),
      blamed: new Set(),
      shuffles: new Map(),
      deferredProofs: new Set(),
      cproofs: new Map(),
      auditPending: false,
      sent: this.restored.has(deal)
        ? this.restored.get(deal)?.sent
          ? new Set(this.restored.get(deal)?.sent)
          : null
        : new Set(),
    };
    // 새로고침 전에 넘겨받은 열쇠를 되살린다(장부에 자리가 생기면 들어간다).
    for (const [slot, of, hex, proof] of this.restored.get(deal)?.handed ??
      []) {
      const key = BigInt(`0x${hex}`);
      ctx.handed.set(slot, { of, key, ...(proof ? { proof } : {}) });
      this.pendingKeys.push({ deal, slot, from: of, key });
    }
    this.deals.set(deal, ctx);
    this.emit("timing", deal, "begin", 0);
    // 새로고침 전에 연 카드는 그대로 쓴다. 넘긴 카드(하트)는 이제 남의 자리라 다시 열 수 없지만 화면에는 남는다.
    for (const [slot, card] of ctx.party.hand) ctx.mine.set(slot, card);
    if (ctx.mine.size > 0)
      void this.queue(() => this.emit("cards", deal, ctx.mine));
    // 시작 명령보다 먼저 온 사슬 결과·열쇠를 먼저 넣는다. 새로고침 뒤라면 내가 전에 보낸 결과도
    // 여기 들어 있어서, 내 차례를 다시 계산하지 않는다(다시 섞으면 남들이 쓴 덱과 달라진다).
    const early = this.early.filter((e) => e.message.deal === deal);
    this.early = this.early.filter((e) => e.message.deal !== deal);
    for (const { message, from } of early) this.receive(message, from);
    void this.queue(() => this.advance(ctx));
  }

  /** 6·7마 다시 나누기: `pool` 자리들을 새 자리로 섞는다 */
  reshuffle(deal: number, pool: readonly number[]): void {
    const ctx = this.deals.get(deal);
    if (!ctx || ctx.pool) return;
    ctx.pool = [...pool];
    ctx.round = 1;
    void this.queue(() => this.advance(ctx));
  }

  /** 자리들을 그 기기에게 준다. 내 것이 아니면 내 열쇠를 공개하고, 내 것이면 다 모이는 대로 연다 */
  assign(deal: number, owners: ReadonlyMap<number, number>): void {
    const ctx = this.deals.get(deal);
    if (!ctx) return;
    for (const [slot, device] of owners) {
      const before = ctx.owners.get(slot);
      if (before !== undefined && before !== device) {
        this.emit(
          "problem",
          deal,
          `자리 ${slot}을 두 사람에게 주려 했다`,
          null,
        );
        continue;
      }
      ctx.owners.set(slot, device);
      if (device === this.id) ctx.party.mySlots.add(slot);
    }
    void this.queue(() => this.publishGrants(ctx));
  }

  /**
   * 하트 카드 넘기기: 내 자리 몇 개를 다른 기기에게 넘긴다. 그 자리 내 열쇠를 그 기기에게만 직접 보낸다.
   * 나머지 기기 열쇠는 처음 나눠 줄 때 이미 공개됐으므로 받는 기기만 연다
   */
  handover(deal: number, slots: readonly number[], to: number): void {
    const ctx = this.deals.get(deal);
    // 같은 기기 안에서 넘기면(방장과 컴퓨터 사이) 카드는 그대로 이 기기에 있다.
    if (!ctx || slots.length === 0 || to === this.id) return;
    // 넘긴 카드도 내가 본 카드로 남긴다(화면의 "넘긴 카드"). 낼 수 있는지는 손패 자리 표로 따진다.
    for (const slot of slots) {
      ctx.owners.set(slot, to);
      ctx.party.mySlots.delete(slot);
    }
    const keys: [number, string][] = slots.map((slot) => [
      slot,
      ctx.party.revealKey(slot, "audit").toString(16),
    ]);
    this.sendTo?.(
      { t: "fp", k: "handover", deal, from: this.id, to, keys },
      to,
    );
    // 증명은 계산이 비동기라 뒤따라 보낸다. 받는 기기가 그 카드를 하나씩 낼 때 그대로 옮겨 공개하도록
    // 자리마다 따로 증명한다.
    void this.queue(async () => {
      const proofs: [number, KeyProof][] = [];
      for (const slot of slots) {
        const one = (await this.prove(ctx, [slot]))[0];
        if (one) proofs.push([slot, one.proof]);
      }
      if (proofs.length > 0)
        this.sendTo?.(
          { t: "fp", k: "handover", deal, from: this.id, to, keys, proofs },
          to,
        );
    });
  }

  /** 넘겨받은 열쇠. `from`은 부르는 쪽이 연결로 확인한 기기 */
  receiveHandover(
    message: Extract<FairWire, { k: "handover" }>,
    from: number,
  ): void {
    if (message.to !== this.id || message.from !== from) return;
    void this.queue(() => {
      const ctx = this.deals.get(message.deal);
      if (!ctx) return;
      const proofs = new Map(
        Array.isArray(message.proofs) ? message.proofs : [],
      );
      for (const [slot, hex] of message.keys) {
        let key: bigint;
        try {
          key = BigInt(`0x${hex}`);
        } catch {
          continue;
        }
        const proof = proofs.get(slot) ?? ctx.handed.get(slot)?.proof;
        ctx.handed.set(slot, { of: from, key, ...(proof ? { proof } : {}) });
        if (proof) this.record(ctx, from, from, [[slot, key]], proof);
        ctx.owners.set(slot, this.id);
        ctx.party.mySlots.add(slot);
        if (ctx.ledger.keys.has(slot)) ctx.ledger.publish(slot, from, key);
        else this.pendingKeys.push({ deal: ctx.id, slot, from, key });
      }
      this.emit("persist");
      this.openMine(ctx);
    });
  }

  /** 넘겨받은 자리(하트). 낼 때 넘겨준 사람 열쇠도 함께 공개한다 */
  handedSlots(deal: number): ReadonlySet<number> {
    return new Set(this.deals.get(deal)?.handed.keys() ?? []);
  }

  /** 내 자리 열쇠를 공개한다(낼 때·증명·딜미스·판 끝) */
  reveal(deal: number, slots: readonly number[], reason: RevealReason): void {
    const ctx = this.deals.get(deal);
    if (!ctx) return;
    void this.queue(async () => {
      const keys: [number, string][] = [];
      for (const slot of slots) {
        if (slot >= ctx.ledger.deck.length) continue;
        const key = ctx.party.revealKey(slot, reason);
        ctx.ledger.publish(slot, this.id, key);
        if (reason === "audit" && ctx.published.has(slot)) continue;
        ctx.published.add(slot);
        keys.push([slot, key.toString(16)]);
      }
      if (keys.length > 0)
        this.send({
          t: "fp",
          k: "keys",
          deal,
          from: this.id,
          reason,
          keys,
          proofs: await this.prove(
            ctx,
            keys.map(([s]) => s),
          ),
        });
      // 넘겨받은 카드를 낼 때는 넘겨준 사람 열쇠도 공개해야 모두가 연다. 넘겨준 사람의 증명을 그대로 붙인다.
      if (reason === "play" || reason === "proof") {
        for (const slot of slots) {
          const h = ctx.handed.get(slot);
          if (!h) continue;
          const round = this.roundOf(ctx, slot);
          this.send({
            t: "fp",
            k: "keys",
            deal,
            from: this.id,
            of: h.of,
            reason,
            keys: [[slot, h.key.toString(16)]],
            ...(h.proof && round !== null
              ? { proofs: [{ round, proof: h.proof }] }
              : {}),
          });
        }
      }
      this.checkOpen(
        ctx,
        keys.map(([s]) => s),
      );
      this.emit(
        "keys",
        deal,
        this.id,
        keys.map(([s]) => s),
      );
    });
  }

  /** 판 끝(마지막 턴): 내 열쇠를 모두 공개한다 */
  revealAll(deal: number): void {
    const ctx = this.deals.get(deal);
    if (!ctx) return;
    void this.queue(() => {
      if (!this.chainsDone(ctx)) {
        ctx.auditPending = true;
        return;
      }
      // 다시 섞어 떠난 자리도 연다(처음 나눈 패를 알아야 판을 다시 계산한다).
      this.reveal(
        deal,
        ctx.ledger.deck.map((_, s) => s),
        "audit",
      );
      // 다시 나눈 판이면 바꾸기(convert)를 정직하게 했다는 증명도 낸다.
      void this.queue(async () => {
        const proof = await this.proveConvert(ctx);
        if (proof)
          this.send({ t: "fp", k: "cproof", deal, from: this.id, proof });
      });
    });
  }

  /** 시작한 섞기 사슬(다시 나누기 포함)이 모두 끝났다 */
  private chainsDone(ctx: DealCtx): boolean {
    for (let round = 0; round <= ctx.round; round++)
      if (!ctx.done.has(`${round}`)) return false;
    return true;
  }

  /** 다시 섞어 떠난 자리를 뺀, 지금 쓰는 자리들 */
  liveSlots(deal: number): number[] {
    const ctx = this.deals.get(deal);
    if (!ctx) return [];
    const gone = new Set(ctx.round > 0 && ctx.pool ? ctx.pool : []);
    return ctx.ledger.deck.map((_, s) => s).filter((s) => !gone.has(s));
  }

  /** 모두의 열쇠가 모인 자리를 연다 */
  open(deal: number, slot: number): Card | null {
    const ctx = this.deals.get(deal);
    return ctx ? ctx.ledger.open(slot, ctx.devices) : null;
  }

  /** 열쇠가 모두 공개되면 이 판의 모든 자리(떠난 자리 포함) → 카드. 아직이면 null */
  openAll(deal: number): Map<number, Card> | null {
    const ctx = this.deals.get(deal);
    if (!ctx || !this.chainsDone(ctx)) return null;
    const cards = new Map<number, Card>();
    for (let slot = 0; slot < ctx.ledger.deck.length; slot++) {
      const card = ctx.ledger.open(slot, ctx.devices);
      if (card === null) return null;
      cards.set(slot, card);
    }
    return cards;
  }

  /** 다른 기기의 메시지. `from`은 부르는 쪽이 연결 아이디로 확인한 기기 번호 */
  receive(message: FairWire, from: number): void {
    const ctx = this.deals.get(message.deal);
    if (message.k === "handover") {
      this.receiveHandover(message, from);
      return;
    }
    if (message.k === "keys") {
      if (message.from !== from) return;
      void this.queue(() => this.onKeys(message, from));
      return;
    }
    if (message.k === "sproof" || message.k === "cproof") {
      if (message.from !== from) return;
      if (!ctx) {
        this.early.push({ message, from });
        return;
      }
      if (message.k === "cproof") ctx.cproofs.set(from, message.proof);
      else void this.queue(() => this.onShuffleProof(ctx, message, from));
      return;
    }
    if (!ctx) {
      // 아직 시작 명령을 받기 전에 온 사슬 결과는 잠시 맡아 둔다.
      this.early.push({ message, from });
      return;
    }
    void this.queue(() => this.onChain(ctx, message, from));
  }

  private early: {
    message: Exclude<FairWire, { k: "keys" | "handover" }>;
    from: number;
  }[] = [];

  private onChain(
    ctx: DealCtx,
    message: Exclude<FairWire, { k: "keys" | "handover" }>,
    from: number,
  ): Promise<void> | void {
    if (message.k !== "chain") {
      // 시작 명령보다 먼저 온 증명 메시지
      if (message.k === "cproof") ctx.cproofs.set(from, message.proof);
      else return this.onShuffleProof(ctx, message, from);
      return;
    }
    if (ctx.devices[message.index] !== from) {
      this.emit(
        "problem",
        ctx.id,
        "섞기 차례가 아닌 사람이 섞은 덱을 보냈다",
        from,
      );
      return;
    }
    const key = `${message.round}:${message.stage}:${message.index}`;
    if (ctx.chains.has(key)) return;
    try {
      ctx.chains.set(
        key,
        message.deck.map((h) => BigInt(`0x${h}`)),
      );
      if (typeof message.v === "string")
        ctx.commitments.set(
          commitmentKey(message.round, message.stage, message.index),
          BigInt(`0x${message.v}`),
        );
    } catch {
      this.emit("problem", ctx.id, "덱 값이 숫자가 아니다", from);
      return;
    }
    if (isShuffleStage(message.stage)) {
      const state = this.shuffleState(ctx, message.round, message.stage);
      if (typeof message.nc === "string" && !state.nc.has(from)) {
        state.nc.set(from, message.nc);
        // 섞은 뒤 정한 시간 안에 섞기 증명 약속을 내야 한다.
        if (from !== this.id) this.watch(ctx, state, "commit", from);
      }
      // 새로고침 전에 보낸 내 섞기가 돌아왔으면 증명을 다시 만든다(섞기 열쇠에서 정해져 같다).
      if (from === this.id) this.scheduleShuffleProof(ctx, state);
    }
    return this.advance(ctx);
  }

  private stagesOf(round: number): Stage[] {
    return round === 0
      ? ["shuffle", "relock"]
      : ["convert", "poolShuffle", "poolRelock"];
  }

  /** 내 차례인 사슬이 있으면 계산해 보낸다. 사슬이 끝나면 새 자리를 장부에 올린다 */
  private async advance(ctx: DealCtx): Promise<void> {
    for (let round = 0; round <= ctx.round; round++) {
      const stages = this.stagesOf(round);
      const n = ctx.devices.length;
      for (const [si, stage] of stages.entries()) {
        for (let index = 0; index < n; index++) {
          const key = `${round}:${stage}:${index}`;
          if (ctx.chains.has(key)) continue;
          const input = this.inputOf(ctx, round, stages, si, index);
          if (input === null) return;
          if (ctx.devices[index] !== this.id) return;
          // 새로고침 전에 이미 계산해 보낸 차례면 다시 하지 않고 그 결과가 다시 오기를 기다린다
          // (다시 섞으면 남들이 쓴 덱과 달라진다). 계산만 하고 보내지 못했으면 아무도 못 봤으니 다시 한다.
          if (ctx.sent ? ctx.sent.has(key) : this.alreadyDone(ctx, stage))
            return;
          const started = Date.now();
          const output = await this.compute(ctx, stage, input);
          this.emit("timing", ctx.id, "compute", Date.now() - started, stage);
          ctx.chains.set(key, output);
          const passes = RELOCK_PASSES[stage];
          const v = passes
            ? ctx.party.relockCommitment(passes)
            : stage === "convert"
              ? this.convertCommitment(ctx)
              : null;
          if (v !== null)
            ctx.commitments.set(commitmentKey(round, stage, index), v);
          const state = isShuffleStage(stage)
            ? this.shuffleState(ctx, round, stage)
            : null;
          let nc: string | null = null;
          if (state) {
            nc = await nonceCommit(
              await shuffleNonce(
                ctx.party.passKey(stage) as bigint,
                this.label(ctx, state, this.id),
              ),
            );
            state.nc.set(this.id, nc);
          }
          this.send({
            t: "fp",
            k: "chain",
            deal: ctx.id,
            round,
            stage,
            index,
            deck: output.map((c) => c.toString(16)),
            ...(v !== null ? { v: v.toString(16) } : {}),
            ...(nc !== null ? { nc } : {}),
          });
          ctx.sent?.add(key);
          this.emit("persist");
          if (state) this.scheduleShuffleProof(ctx, state);
        }
      }
      const doneKey = `${round}`;
      if (!ctx.done.has(doneKey)) {
        const last = stages.at(-1) as Stage;
        const final = ctx.chains.get(`${round}:${last}:${n - 1}`);
        if (!final) return;
        ctx.done.add(doneKey);
        const base = ctx.ledger.extend(final);
        this.emit("slots", ctx.id, base, final.length);
        await this.publishGrants(ctx);
        if (ctx.auditPending && this.chainsDone(ctx)) {
          ctx.auditPending = false;
          this.revealAll(ctx.id);
        }
      }
    }
  }

  private alreadyDone(ctx: DealCtx, stage: Stage): boolean {
    const { party } = ctx;
    switch (stage) {
      case "shuffle":
        return party.hasPass("shuffle");
      case "relock":
        return party.hasSlotKey(0);
      case "convert":
        return party.hasPass("pool");
      case "poolShuffle":
        return party.hasPass("poolShuffle");
      case "poolRelock":
        return party.hasSlotKey(ctx.ledger.deck.length);
    }
  }

  /** 사슬 한 칸의 입력. 아직 앞사람 결과가 없으면 null */
  private inputOf(
    ctx: DealCtx,
    round: number,
    stages: Stage[],
    si: number,
    index: number,
  ): bigint[] | null {
    if (index > 0)
      return ctx.chains.get(`${round}:${stages[si]}:${index - 1}`) ?? null;
    if (si > 0)
      return (
        ctx.chains.get(
          `${round}:${stages[si - 1]}:${ctx.devices.length - 1}`,
        ) ?? null
      );
    if (round === 0) return encodedDeck(this.g, ctx.initial);
    if (!ctx.pool || !ctx.done.has("0")) return null;
    return ctx.pool.map((slot) => ctx.ledger.deck[slot] as bigint);
  }

  private compute(
    ctx: DealCtx,
    stage: Stage,
    input: bigint[],
  ): Promise<bigint[]> {
    const { party } = ctx;
    switch (stage) {
      case "shuffle":
        return party.lockAndShuffle(input, "shuffle");
      case "relock":
        return party.relock(
          input,
          input.map((_, i) => i),
          ["shuffle"],
        );
      case "convert":
        return party.convert(input, ctx.pool ?? [], "pool");
      case "poolShuffle":
        return party.lockAndShuffle(input, "poolShuffle");
      case "poolRelock": {
        const base = ctx.ledger.deck.length;
        return party.relock(
          input,
          input.map((_, i) => base + i),
          ["pool", "poolShuffle"],
        );
      }
    }
  }

  /** 남에게 준 자리 중 장부에 있는데 아직 내 열쇠를 안 낸 것을 공개하고, 내 자리를 열어 본다 */
  private async publishGrants(ctx: DealCtx): Promise<void> {
    const keys: [number, string][] = [];
    const reasons = new Set<RevealReason>();
    for (const [slot, device] of ctx.owners) {
      if (slot >= ctx.ledger.deck.length) continue;
      if (device === this.id || ctx.published.has(slot)) continue;
      // 하트에서 넘겨받은 자리는 이제 내 자리다. 새로고침 뒤 처음 나눈 주인으로 다시 처리해도 내 열쇠는 이미 냈다.
      if (ctx.party.mySlots.has(slot)) continue;
      const reason: RevealReason = "deal";
      const key = ctx.party.revealKey(slot, reason);
      reasons.add(reason);
      ctx.ledger.publish(slot, this.id, key);
      ctx.published.add(slot);
      keys.push([slot, key.toString(16)]);
    }
    if (keys.length > 0)
      this.send({
        t: "fp",
        k: "keys",
        deal: ctx.id,
        from: this.id,
        reason: "deal",
        keys,
        proofs: await this.prove(
          ctx,
          keys.map(([s]) => s),
        ),
      });
    this.openMine(ctx);
  }

  private onKeys(
    message: Extract<FairWire, { k: "keys" }>,
    from: number,
  ): void {
    const ctx = this.deals.get(message.deal);
    if (!ctx) {
      this.earlyKeys.push({ message, from });
      return;
    }
    const slots: number[] = [];
    const of = typeof message.of === "number" ? message.of : from;
    for (const [slot, hex] of message.keys) {
      let key: bigint;
      try {
        key = BigInt(`0x${hex}`);
      } catch {
        this.emit("problem", ctx.id, "열쇠 값이 숫자가 아니다", from);
        continue;
      }
      const known = ctx.ledger.keys.get(slot)?.get(of);
      if (known !== undefined && known !== key) {
        this.emit(
          "problem",
          ctx.id,
          `자리 ${slot}에 앞서 낸 것과 다른 열쇠를 냈다`,
          from,
        );
        continue;
      }
      if (!ctx.ledger.keys.has(slot)) {
        // 아직 장부에 없는 자리(사슬이 덜 끝남): 자리를 미리 만들어 둔다.
        this.pendingKeys.push({ deal: ctx.id, slot, from: of, key });
        continue;
      }
      ctx.ledger.publish(slot, of, key);
      slots.push(slot);
    }
    this.recordMessage(ctx, message, from);
    this.openMine(ctx);
    if (slots.length > 0) this.emit("keys", ctx.id, from, slots);
    this.checkOpen(ctx, slots);
  }

  private earlyKeys: {
    message: Extract<FairWire, { k: "keys" }>;
    from: number;
  }[] = [];
  private pendingKeys: {
    deal: number;
    slot: number;
    from: number;
    key: bigint;
  }[] = [];

  /** 장부가 늘었거나 판이 시작되면 맡아 둔 열쇠를 다시 넣는다 */
  private replayPending(ctx: DealCtx): void {
    const waiting = this.pendingKeys.filter(
      (p) => p.deal === ctx.id && ctx.ledger.keys.has(p.slot),
    );
    this.pendingKeys = this.pendingKeys.filter((p) => !waiting.includes(p));
    for (const p of waiting) {
      ctx.ledger.publish(p.slot, p.from, p.key);
      this.emit("keys", ctx.id, p.from, [p.slot]);
    }
    this.checkOpen(
      ctx,
      waiting.map((p) => p.slot),
    );
    const early = this.earlyKeys.filter((e) => e.message.deal === ctx.id);
    this.earlyKeys = this.earlyKeys.filter((e) => !early.includes(e));
    for (const e of early) this.onKeys(e.message, e.from);
  }

  /** 내 자리 중 다른 기기 열쇠가 모두 모인 것을 연다 */
  private openMine(ctx: DealCtx): void {
    this.replayPendingOnce(ctx);
    let opened = false;
    for (const [slot, device] of ctx.owners) {
      if (device !== this.id || ctx.mine.has(slot)) continue;
      const cipher = ctx.ledger.deck[slot];
      if (cipher === undefined) continue;
      const known = ctx.ledger.keys.get(slot);
      const others = ctx.devices.filter((d) => d !== this.id);
      if (!known || others.some((d) => !known.has(d))) continue;
      const card = ctx.party.receive(
        slot,
        cipher,
        others.map((d) => known.get(d) as bigint),
      );
      if (card === null) {
        // 넘겨받은 열쇠의 증명은 뒤따라 온다. 오면 다시 열어 보고 그때 탓한다.
        const handed = ctx.handed.get(slot);
        if (handed && !handed.proof) continue;
        this.report(ctx, slot, `내 자리 ${slot}이 카드로 열리지 않는다`);
        continue;
      }
      ctx.mine.set(slot, card);
      opened = true;
    }
    if (opened) {
      this.emit("cards", ctx.id, ctx.mine);
      this.startDeferredProofs(ctx);
    }
  }

  private replaying = false;
  private replayPendingOnce(ctx: DealCtx): void {
    if (this.replaying) return;
    this.replaying = true;
    try {
      this.replayPending(ctx);
    } finally {
      this.replaying = false;
    }
  }

  /** 자리가 속한 사슬(0: 처음 나누기, 1: 다시 나누기). 아직 장부에 없으면 null */
  private roundOf(ctx: DealCtx, slot: number): number | null {
    if (slot < 0 || slot >= ctx.ledger.deck.length) return null;
    return slot < ctx.initial.length ? 0 : 1;
  }

  /**
   * 그 기기가 그 사슬에서 다시 잠근 자리들의 증명 문장. 잠그기 전·뒤 값은 공개된 사슬 결과에서 꺼낸다.
   * 사슬이나 V가 없으면 null(확인할 수 없다)
   */
  private statement(
    ctx: DealCtx,
    device: number,
    round: number,
    keys: readonly [number, bigint][],
  ): KeyStatement | null {
    const index = ctx.devices.indexOf(device);
    const v = ctx.commitments.get(
      commitmentKey(round, round === 0 ? "relock" : "poolRelock", index),
    );
    if (index < 0 || v === undefined) return null;
    const n = ctx.devices.length;
    const [before, relock] =
      round === 0 ? ["shuffle", "relock"] : ["poolShuffle", "poolRelock"];
    const input =
      index > 0
        ? ctx.chains.get(`${round}:${relock}:${index - 1}`)
        : ctx.chains.get(`${round}:${before}:${n - 1}`);
    const output = ctx.chains.get(`${round}:${relock}:${index}`);
    if (!input || !output) return null;
    const base = round === 0 ? 0 : ctx.initial.length;
    const items: KeyStatement["items"][number][] = [];
    for (const [slot, key] of keys) {
      const i = input[slot - base];
      const o = output[slot - base];
      if (i === undefined || o === undefined) return null;
      items.push({ slot, input: i, output: o, key });
    }
    return { device, v, items };
  }

  /** 내 열쇠들의 증명. 사슬마다 하나 */
  private async prove(
    ctx: DealCtx,
    slots: readonly number[],
  ): Promise<{ round: number; proof: KeyProof }[]> {
    const out: { round: number; proof: KeyProof }[] = [];
    for (const round of [0, 1]) {
      const keys: [number, bigint][] = slots
        .filter((s) => this.roundOf(ctx, s) === round)
        .map((s) => [s, ctx.party.revealKey(s, "audit")]);
      if (keys.length === 0) continue;
      const st = this.statement(ctx, this.id, round, keys);
      const passes =
        round === 0 ? RELOCK_PASSES.relock : RELOCK_PASSES.poolRelock;
      if (!st || !passes) continue;
      out.push({
        round,
        proof: await proveKeys(this.g, st, ctx.party.unlockOf(passes)),
      });
    }
    return out;
  }

  private record(
    ctx: DealCtx,
    device: number,
    sender: number,
    keys: [number, bigint][],
    proof: KeyProof,
    round = this.roundOf(ctx, keys[0]?.[0] ?? -1),
  ): void {
    if (round === null) return;
    const rec: ProofRecord = { device, sender, round, keys, proof };
    for (const [slot] of keys) {
      const id = `${slot}:${device}`;
      // 넘겨받은 열쇠를 대신 공개한 것보다 그 열쇠 주인이 직접 낸 증명을 먼저 본다.
      const before = ctx.proofs.get(id);
      if (before && before.sender === before.device) continue;
      ctx.proofs.set(id, rec);
    }
  }

  /** 받은 열쇠 메시지의 증명을 남겨 둔다(바로 확인하지는 않는다) */
  private recordMessage(
    ctx: DealCtx,
    message: Extract<FairWire, { k: "keys" }>,
    from: number,
  ): void {
    if (!Array.isArray(message.proofs)) return;
    const of = typeof message.of === "number" ? message.of : from;
    for (const { round, proof } of message.proofs) {
      if (round !== 0 && round !== 1) continue;
      const keys: [number, bigint][] = [];
      for (const [slot, hex] of message.keys) {
        if (this.roundOf(ctx, slot) !== round) continue;
        try {
          keys.push([slot, BigInt(`0x${hex}`)]);
        } catch {}
      }
      if (keys.length > 0) this.record(ctx, of, from, keys, proof, round);
    }
  }

  /** 모두의 열쇠가 모인 자리가 카드로 열리지 않으면 누가 틀렸는지 찾아 알린다 */
  private checkOpen(ctx: DealCtx, slots: readonly number[]): void {
    for (const slot of new Set(slots)) {
      const known = ctx.ledger.keys.get(slot);
      if (!known || ctx.devices.some((d) => !known.has(d))) continue;
      if (ctx.ledger.open(slot, ctx.devices) === null)
        this.report(ctx, slot, `자리 ${slot}이 카드로 열리지 않는다`);
    }
  }

  /**
   * 카드가 열리지 않는다: 남이 공개한 그 자리 열쇠의 증명을 확인한다. 틀린 증명이 있으면 그 기기를,
   * 모두 맞으면(섞기 단계를 조작했거나 증명이 없다) 누군지 모른다고 알린다
   */
  private report(ctx: DealCtx, slot: number, what: string): void {
    if (ctx.blamed.has(slot)) return;
    ctx.blamed.add(slot);
    void this.queue(async () => {
      const culprit = await this.blame(ctx, slot);
      if (culprit !== null) {
        this.emit(
          "problem",
          ctx.id,
          `${what}: 공개한 열쇠가 카드를 잠글 때 쓴 열쇠와 다르다(열쇠 증명 실패)`,
          culprit,
        );
        return;
      }
      // 열쇠 증명이 모두 맞으면 섞는 단계를 본다. 섞기 증명이 끝나기를 기다릴 수 있어 판은 바로 멈추고
      // 작업 줄 밖에서 찾아 확정 알림을 보낸다.
      this.emit(
        "problem",
        ctx.id,
        `${what}: 누가 했는지 섞기 증명으로 확인하는 중`,
        null,
        true,
      );
      void this.chainCulprit(ctx).then((chain) =>
        this.emit(
          "problem",
          ctx.id,
          chain
            ? `${what}: ${chain.reason}`
            : `${what}(열쇠·섞기 증명으로 누군지 가리지 못했다)`,
          chain?.device ?? null,
        ),
      );
    });
  }

  /** 그 자리 열쇠 증명이 틀린 기기. 남이 대신 공개한 열쇠가 틀렸으면 대신 공개한 기기를 탓한다 */
  private async blame(ctx: DealCtx, slot: number): Promise<number | null> {
    for (const device of ctx.devices) {
      if (device === this.id) continue;
      const rec = ctx.proofs.get(`${slot}:${device}`);
      if (!rec) continue;
      rec.checked ??= (async () => {
        const st = this.statement(ctx, rec.device, rec.round, rec.keys);
        return st ? verifyKeys(this.g, st, rec.proof) : null;
      })();
      if ((await rec.checked) === false) return rec.sender;
    }
    return null;
  }

  /* ---------- 섞기 증명(shuffle-proof.ts) ---------- */

  private shuffleState(
    ctx: DealCtx,
    round: number,
    stage: "shuffle" | "poolShuffle",
  ): ShuffleState {
    const key = `${round}:${stage}`;
    let state = ctx.shuffles.get(key);
    if (!state) {
      state = {
        round,
        stage,
        nc: new Map(),
        commits: new Map(),
        nonces: new Map(),
        answers: new Map(),
        bits: null,
        checked: new Map(),
        work: null,
        proving: false,
        sentNonce: false,
        sentAnswer: false,
        timedOut: false,
      };
      ctx.shuffles.set(key, state);
    }
    return state;
  }

  private label(
    ctx: DealCtx,
    state: ShuffleState,
    device: number,
  ): ShuffleLabel {
    return { device, deal: ctx.id, round: state.round, stage: state.stage };
  }

  /** 그 기기가 그 단계에서 받은 덱과 넘긴 덱 */
  private shuffleIO(
    ctx: DealCtx,
    state: ShuffleState,
    device: number,
  ): { input: bigint[]; output: bigint[] } | null {
    const index = ctx.devices.indexOf(device);
    const stages = this.stagesOf(state.round);
    const si = stages.indexOf(state.stage);
    if (index < 0 || si < 0) return null;
    const input = this.inputOf(ctx, state.round, stages, si, index);
    const output = ctx.chains.get(`${state.round}:${state.stage}:${index}`);
    return input && output ? { input, output } : null;
  }

  /**
   * 내 섞기 증명을 언제 만들지 정한다. 증명은 크고 무거워(휴대폰에서 1초 넘게 계산하고 약속이 약 150KB)
   * 바로 보내면 나눠 주기에 필요한 메시지가 그 뒤에 줄을 선다. 이미 공개한 섞기 결과에 대한 증명이라
   * 늦게 내도 속일 여지가 없으니, 내 카드가 열린 뒤(사람들이 고민하는 동안) 만든다.
   * 부정으로 내 카드가 안 열려도 내 증명은 나가야 하므로(안 내면 내가 범인으로 몰린다) 정한 시간 뒤에는 그냥 만든다.
   */
  private scheduleShuffleProof(ctx: DealCtx, state: ShuffleState): void {
    if (ctx.mine.size > 0) {
      this.startShuffleProof(ctx, state);
      return;
    }
    ctx.deferredProofs.add(state);
    this.clock.after(PROOF_DEFER_MS, () => this.startDeferredProofs(ctx));
  }

  private startDeferredProofs(ctx: DealCtx): void {
    for (const state of ctx.deferredProofs) this.startShuffleProof(ctx, state);
    ctx.deferredProofs.clear();
  }

  /** 내 섞기의 약속을 만들어 보낸다(판 진행 줄 밖에서 계산한다) */
  private startShuffleProof(ctx: DealCtx, state: ShuffleState): void {
    if (state.proving) return;
    const e = ctx.party.passKey(state.stage);
    const io = this.shuffleIO(ctx, state, this.id);
    if (e === null || !io) return;
    state.proving = true;
    const proving = (async () => {
      const started = Date.now();
      const work = await commitShuffle(
        this.g,
        this.label(ctx, state, this.id),
        io.input,
        e,
      );
      this.emit("timing", ctx.id, "proof", Date.now() - started, state.stage);
      state.work = work;
      state.commits.set(this.id, work.commit);
      this.send({
        t: "fp",
        k: "sproof",
        deal: ctx.id,
        from: this.id,
        round: state.round,
        stage: state.stage,
        commit: work.commit,
      });
      await this.queue(() => this.stepShuffle(ctx, state));
    })().catch(() => {
      // 내 섞기로 증명을 만들 수 없으면 보내지 않는다(남들이 응답 없음으로 알아챈다).
    });
    this.track(proving);
  }

  private onShuffleProof(
    ctx: DealCtx,
    message: Extract<FairWire, { k: "sproof" }>,
    from: number,
  ): Promise<void> {
    if (message.stage !== "shuffle" && message.stage !== "poolShuffle")
      return Promise.resolve();
    const state = this.shuffleState(ctx, message.round, message.stage);
    if (message.commit && !state.commits.has(from))
      state.commits.set(from, message.commit);
    if (typeof message.nonce === "string" && !state.nonces.has(from))
      state.nonces.set(from, message.nonce);
    if (Array.isArray(message.answers) && !state.answers.has(from))
      state.answers.set(from, message.answers);
    return this.stepShuffle(ctx, state);
  }

  /**
   * 섞기 증명을 한 걸음씩: 모두의 약속이 모이면 내 nonce 공개 → 모두의 nonce가 모이면 도전값 →
   * 내 응답 → 남의 응답 확인. 틀린 응답이면 그 기기를 바로 알린다
   */
  private async stepShuffle(ctx: DealCtx, state: ShuffleState): Promise<void> {
    const e = ctx.party.passKey(state.stage);
    const all = (map: Map<number, unknown>) =>
      ctx.devices.every((d) => map.has(d));
    // 모두가 약속한 뒤에야 nonce를 공개한다(도전값을 보고 약속을 고르지 못하게).
    if (
      !state.sentNonce &&
      state.work &&
      e !== null &&
      all(state.commits) &&
      all(state.nc)
    ) {
      state.sentNonce = true;
      const nonce = await shuffleNonce(e, this.label(ctx, state, this.id));
      state.nonces.set(this.id, nonce);
      this.send({
        t: "fp",
        k: "sproof",
        deal: ctx.id,
        from: this.id,
        round: state.round,
        stage: state.stage,
        nonce,
      });
      // 모두의 약속이 모였는데 nonce를 공개하지 않으면(남의 nonce를 보고 도전값이 불리해 멈춘 것) 짚는다.
      this.watch(ctx, state, "nonce");
    }
    if (state.bits === null && all(state.nonces) && all(state.nc)) {
      const nonces: string[] = [];
      for (const d of ctx.devices) {
        const nonce = state.nonces.get(d) as string;
        if ((await nonceCommit(nonce)) !== state.nc.get(d)) {
          this.emit(
            "problem",
            ctx.id,
            "섞을 때 건 값과 다른 nonce를 공개했다(섞기 증명)",
            d,
          );
          return;
        }
        nonces.push(nonce);
      }
      state.bits = await challengeBits(
        { deal: ctx.id, round: state.round, stage: state.stage },
        nonces,
        [],
      );
      // 도전값이 정해진 뒤 오래 응답하지 않으면 그 기기를 짚는다. 속인 덱은 응답을 만들 수 없다.
      this.clock.after(this.proofTimeoutMs, () => {
        // 응답이 늦은 것만으로는 탓하지 않는다(다른 앱으로 넘어가 탭이 느려진 정직한 사람일 수 있다).
        // 조작이 드러나면 그때 증명을 끝내지 않은 기기를 범인으로 본다(chainCulprit).
        state.timedOut = true;
      });
    }
    const bits = state.bits;
    if (bits === null) return;
    if (!state.sentAnswer && state.work && e !== null) {
      const io = this.shuffleIO(ctx, state, this.id);
      if (io) {
        state.sentAnswer = true;
        const work = state.work;
        const answering = (async () => {
          const started = Date.now();
          const answers = await answerShuffle(
            this.g,
            this.label(ctx, state, this.id),
            io.input,
            io.output,
            e,
            work,
            bits,
          );
          this.emit(
            "timing",
            ctx.id,
            "answer",
            Date.now() - started,
            state.stage,
          );
          state.answers.set(this.id, answers);
          this.send({
            t: "fp",
            k: "sproof",
            deal: ctx.id,
            from: this.id,
            round: state.round,
            stage: state.stage,
            answers,
          });
        })().catch(() => {
          // 내 섞기 출력이 입력과 맞지 않으면 응답을 만들 수 없다.
        });
        this.track(answering);
      }
    }
    for (const d of ctx.devices) {
      if (d === this.id || state.checked.has(d)) continue;
      const commit = state.commits.get(d);
      const answers = state.answers.get(d);
      const io = this.shuffleIO(ctx, state, d);
      if (!commit || !answers || !io) continue;
      // 확인은 한 번에 하나씩(계산이 겹쳐 화면이 멈추지 않게).
      const check = this.checking.then(() =>
        verifyShuffle(
          this.g,
          this.label(ctx, state, d),
          io.input,
          io.output,
          commit,
          bits,
          answers,
        ).catch(() => false),
      );
      this.checking = check.then(() => undefined);
      this.track(check);
      state.checked.set(d, check);
      void check.then((ok) => {
        if (!ok)
          this.emit(
            "problem",
            ctx.id,
            "섞기 증명이 맞지 않는다(섞을 때 카드를 바꿨다)",
            d,
          );
      });
    }
  }

  private checking: Promise<void> = Promise.resolve();

  /** 지금 진행 중인 판인가(가장 나중에 시작한 판) */
  private isCurrent(ctx: DealCtx): boolean {
    return Math.max(...this.deals.keys()) === ctx.id;
  }

  /**
   * 섞기 증명 단계마다 시간 제한: 약속(섞은 뒤) → nonce(모두의 약속이 모인 뒤) → 응답(도전값이 정해진 뒤).
   * 정한 시간이 지나면 기다리기를 끝낸 것으로 적는다. 바로 탓하지는 않는다(느린 정직한 기기일 수 있다).
   * 조작이 드러나면 그 단계를 끝내지 않은 기기를 범인으로 본다(chainCulprit). 틀린 증명만 바로 짚는다
   */
  private watch(
    ctx: DealCtx,
    state: ShuffleState,
    step: "commit" | "nonce",
    /** 약속 단계: 그 기기가 섞은 덱을 받은 때부터 잰다 */
    device?: number,
  ): void {
    this.clock.after(this.proofTimeoutMs, () => {
      if (state.bits !== null || !this.isCurrent(ctx)) return;
      const map = step === "commit" ? state.commits : state.nonces;
      // nonce 단계는 모두의 약속이 모였을 때만 따진다(약속이 빠진 것은 약속 단계에서 짚는다).
      if (step === "nonce" && !ctx.devices.every((d) => state.commits.has(d)))
        return;
      const missing = ctx.devices.filter(
        (d) =>
          d !== this.id &&
          !map.has(d) &&
          (device === undefined || d === device),
      );
      // 늦은 것만으로는 탓하지 않고, 조작이 드러날 때 범인을 찾는 데 쓴다(chainCulprit).
      if (missing.length > 0) state.timedOut = true;
    });
  }

  /** 다시 나누기 바꾸기(convert)의 V = g^(1/p) */
  private convertCommitment(ctx: DealCtx): bigint | null {
    const p = ctx.party.passKey("pool");
    return p === null
      ? null
      : this.g.pow(this.g.generator, modInverse(p, this.g.q));
  }

  /**
   * 바꾸기 문장: 그 기기는 떠나는 자리 i를 I_i → O_i = I_i^(p/k_i)로 바꿨다(k_i는 그 기기의 처음 자리 열쇠).
   * O_i^k_i = I_i^p 이므로 열쇠 증명 꼴(입력 O, 출력 I, 열쇠 k, 지수 1/p)로 쓴다
   */
  private convertStatement(
    ctx: DealCtx,
    device: number,
    keyOf: (slot: number) => bigint | undefined,
  ): KeyStatement | null {
    const index = ctx.devices.indexOf(device);
    const pool = ctx.pool;
    const v = ctx.commitments.get(commitmentKey(1, "convert", index));
    if (!pool || index < 0 || v === undefined) return null;
    const input =
      index > 0
        ? ctx.chains.get(`1:convert:${index - 1}`)
        : pool.map((slot) => ctx.ledger.deck[slot] as bigint);
    const output = ctx.chains.get(`1:convert:${index}`);
    if (!input || !output) return null;
    const items: KeyStatement["items"][number][] = [];
    for (const [i, slot] of pool.entries()) {
      const key = keyOf(slot);
      const before = input[i];
      const after = output[i];
      if (key === undefined || before === undefined || after === undefined)
        return null;
      items.push({ slot, input: after, output: before, key });
    }
    // 다른 증명과 섞이지 않게 기기 번호를 크게 바꿔 해시에 넣는다.
    return { device: 900_000 + ctx.id * 10 + device, v, items };
  }

  private async proveConvert(ctx: DealCtx): Promise<KeyProof | null> {
    const p = ctx.party.passKey("pool");
    if (p === null || !ctx.pool) return null;
    const st = this.convertStatement(ctx, this.id, (slot) =>
      ctx.party.revealKey(slot, "audit"),
    );
    return st ? proveKeys(this.g, st, modInverse(p, this.g.q)) : null;
  }

  /**
   * 섞는 단계의 범인: 섞기·바꾸기 증명이 틀린 기기, 없으면 증명을 내지 않은 기기가 하나뿐일 때 그 기기.
   * 정직한 기기는 증명을 낸다(새로고침 등으로 빠질 수는 있다)
   */
  private async chainCulprit(
    ctx: DealCtx,
  ): Promise<{ device: number; reason: string } | null> {
    // 섞기 증명을 주고받는 중이면 끝날 때까지(응답 기다리는 시간까지) 기다린다.
    const settled = () =>
      [...ctx.shuffles.values()].every(
        (state) =>
          state.timedOut ||
          (state.bits !== null &&
            ctx.devices.every((d) => d === this.id || state.checked.has(d))),
      );
    const started = this.clock.now();
    while (!settled() && this.clock.now() - started < this.proofTimeoutMs * 2)
      await new Promise<void>((r) => setTimeout(r, 100));
    for (const state of ctx.shuffles.values())
      for (const [d, check] of state.checked)
        if (!(await check))
          return {
            device: d,
            reason: "섞기 증명이 맞지 않는다(섞을 때 카드를 바꿨다)",
          };
    if (ctx.pool)
      for (const d of ctx.devices) {
        const proof = ctx.cproofs.get(d);
        if (d === this.id || !proof) continue;
        const st = this.convertStatement(ctx, d, (slot) =>
          ctx.ledger.keys.get(slot)?.get(d),
        );
        if (st && !(await verifyKeys(this.g, st, proof)))
          return {
            device: d,
            reason: "다시 섞을 카드를 바꿀 때 값을 바꿨다(바꾸기 증명 실패)",
          };
      }
    const missing = new Map<number, string>();
    for (const state of ctx.shuffles.values()) {
      // 도전값 전: 약속이 다 모였으면 nonce를 공개하지 않은 기기, 아니면 약속을 내지 않은 기기
      const allCommitted = ctx.devices.every((d) => state.commits.has(d));
      const [proved, reason] =
        state.bits !== null
          ? [state.answers, "섞기 증명 도전에 응답하지 않았다"]
          : allCommitted
            ? [
                state.nonces,
                "섞기 증명 nonce를 공개하지 않았다(도전값을 보고 멈췄다)",
              ]
            : [state.commits, "섞기 증명 약속을 내지 않았다"];
      for (const d of ctx.devices)
        if (d !== this.id && !proved.has(d) && !missing.has(d))
          missing.set(d, reason);
    }
    // 정직한 기기는 증명을 끝낸다. 끝내지 않은 기기가 하나뿐이면 그 기기다.
    if (missing.size === 1) {
      const [[device, reason]] = [...missing] as [[number, string]];
      return { device, reason };
    }
    return null;
  }

  /** 판 끝에 같은 카드가 두 번 나오는 등 섞기 조작이 드러났을 때: 증명으로 누군지 찾는다 */
  async shuffleCulprit(
    deal: number,
  ): Promise<{ device: number; reason: string } | null> {
    const ctx = this.deals.get(deal);
    return ctx ? this.chainCulprit(ctx) : null;
  }

  /** 재연결용 */
  snapshot(deal: number): PartySnapshot | null {
    return this.deals.get(deal)?.party.snapshot() ?? null;
  }
}

function isShuffleStage(stage: Stage): stage is "shuffle" | "poolShuffle" {
  return stage === "shuffle" || stage === "poolShuffle";
}

/** 단계별 V 자리. 다시 잠그기는 예전처럼 `${round}:${index}` */
function commitmentKey(round: number, stage: Stage, index: number): string {
  return stage === "convert"
    ? `${round}:convert:${index}`
    : `${round}:${index}`;
}
