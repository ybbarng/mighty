import type { Card } from "@mighty/engine";

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
import { GROUP_1024, GROUP_2048, type SraGroup } from "./sra";

/*
 * 메시지로 하는 멘탈 포커. 기기마다 FairDevice 하나가 섞기 사슬에 끼고, 열쇠를 공개하고, 자기 카드를 연다.
 * 메시지는 모두 모두에게 보낸다(공개 정보). 보낸 기기가 정말 그 기기인지는 부르는 쪽이 확인해 넘긴다.
 * 어느 자리를 누구에게 줄지는 부르는 쪽이 공개 정보(엔진 화면)로 정해 `assign`으로 알린다.
 * 기기는 거기에 맞춰서만 남의 자리 열쇠를 내준다.
 */

export type GroupName = "1024" | "2048";
export const GROUPS: Record<GroupName, SraGroup> = {
  "1024": GROUP_1024,
  "2048": GROUP_2048,
};

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
      /** 다시 잠그는 단계(relock·poolRelock)에서 V = g^u. 공개한 자리 열쇠를 증명할 때 쓴다(proof.ts) */
      v?: string;
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
    };

export interface DeviceEvents {
  /** 내 자리 카드를 열었다 */
  cards: (deal: number, cards: ReadonlyMap<number, Card>) => void;
  /** 새 자리들이 생겼다(처음 나누기·다시 나누기). 첫 자리 번호와 수 */
  slots: (deal: number, base: number, count: number) => void;
  /** 누가 열쇠를 공개했다 */
  keys: (deal: number, from: number, slots: number[]) => void;
  /** 이상한 일(내 카드가 안 열린다, 같은 자리에 다른 열쇠 등) */
  problem: (deal: number, reason: string, device: number | null) => void;
  /** 새 열쇠를 만들었다(새로고침에 대비해 남겨 둘 때) */
  persist: () => void;
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
  };
  /** 새로고침 전에 남겨 둔 열쇠(판 번호 → 열쇠) */
  private readonly restored: Map<number, PartySnapshot>;

  constructor(options: FairDeviceOptions) {
    this.id = options.id;
    this.g = GROUPS[options.group];
    this.send = options.send;
    this.sendTo = options.sendTo ?? null;
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
    this.work = this.work.then(task).catch((e) => {
      this.emit(
        "problem",
        -1,
        e instanceof Error ? e.message : String(e),
        null,
      );
    });
    return this.work;
  }

  /** 모든 일이 끝날 때까지 기다린다(시험용) */
  idle(): Promise<void> {
    return this.work;
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
    if (!ctx) {
      // 아직 시작 명령을 받기 전에 온 사슬 결과는 잠시 맡아 둔다.
      this.early.push({ message, from });
      return;
    }
    void this.queue(() => this.onChain(ctx, message, from));
  }

  private early: { message: FairWire; from: number }[] = [];

  private onChain(
    ctx: DealCtx,
    message: Extract<FairWire, { k: "chain" }>,
    from: number,
  ): Promise<void> | void {
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
          `${message.round}:${message.index}`,
          BigInt(`0x${message.v}`),
        );
    } catch {
      this.emit("problem", ctx.id, "덱 값이 숫자가 아니다", from);
      return;
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
          const output = await this.compute(ctx, stage, input);
          ctx.chains.set(key, output);
          const passes = RELOCK_PASSES[stage];
          const v = passes ? ctx.party.relockCommitment(passes) : null;
          if (v !== null) ctx.commitments.set(`${round}:${index}`, v);
          this.send({
            t: "fp",
            k: "chain",
            deal: ctx.id,
            round,
            stage,
            index,
            deck: output.map((c) => c.toString(16)),
            ...(v !== null ? { v: v.toString(16) } : {}),
          });
          ctx.sent?.add(key);
          this.emit("persist");
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
    if (opened) this.emit("cards", ctx.id, ctx.mine);
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
    const v = ctx.commitments.get(`${round}:${index}`);
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
      this.emit(
        "problem",
        ctx.id,
        culprit === null
          ? `${what}(공개한 열쇠의 증명은 모두 맞다: 섞는 단계에서 조작했을 수 있다)`
          : `${what}: 공개한 열쇠가 카드를 잠글 때 쓴 열쇠와 다르다(열쇠 증명 실패)`,
        culprit,
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

  /** 재연결용 */
  snapshot(deal: number): PartySnapshot | null {
    return this.deals.get(deal)?.party.snapshot() ?? null;
  }
}
