import type { Card } from "@mighty/engine";

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
    }
  /** 하트 카드 넘기기: 넘기는 카드의 내 열쇠를 받는 기기에게만 직접 보낸다(방장을 거치지 않는다) */
  | {
      t: "fp";
      k: "handover";
      deal: number;
      from: number;
      to: number;
      keys: [number, string][];
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
  /** 넘겨받은 카드: 자리 → 넘겨준 기기와 그 열쇠 */
  handed: Map<number, { of: number; key: bigint }>;
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
        handed: [...ctx.handed].map(([slot, h]) => [
          slot,
          h.of,
          h.key.toString(16),
        ]),
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
    };
    // 새로고침 전에 넘겨받은 열쇠를 되살린다(장부에 자리가 생기면 들어간다).
    for (const [slot, of, hex] of this.restored.get(deal)?.handed ?? []) {
      const key = BigInt(`0x${hex}`);
      ctx.handed.set(slot, { of, key });
      this.pendingKeys.push({ deal, slot, from: of, key });
    }
    this.deals.set(deal, ctx);
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
      for (const [slot, hex] of message.keys) {
        let key: bigint;
        try {
          key = BigInt(`0x${hex}`);
        } catch {
          continue;
        }
        ctx.handed.set(slot, { of: from, key });
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
    void this.queue(() => {
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
        this.send({ t: "fp", k: "keys", deal, from: this.id, reason, keys });
      // 넘겨받은 카드를 낼 때는 넘겨준 사람 열쇠도 공개해야 모두가 연다.
      if (reason === "play" || reason === "proof") {
        const byOwner = new Map<number, [number, string][]>();
        for (const slot of slots) {
          const h = ctx.handed.get(slot);
          if (!h) continue;
          const list = byOwner.get(h.of) ?? [];
          list.push([slot, h.key.toString(16)]);
          byOwner.set(h.of, list);
        }
        for (const [of, list] of byOwner)
          this.send({
            t: "fp",
            k: "keys",
            deal,
            from: this.id,
            of,
            reason,
            keys: list,
          });
      }
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
      // 다시 섞어 떠난 자리도 연다(처음 나눈 패를 알아야 판을 다시 계산한다).
      this.reveal(
        deal,
        ctx.ledger.deck.map((_, s) => s),
        "audit",
      );
    });
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
    if (!ctx) return null;
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
          // 새로고침 전에 이미 계산해 보낸 차례면 다시 하지 않고 그 결과가 다시 오기를 기다린다.
          if (this.alreadyDone(ctx, stage)) return;
          const output = await this.compute(ctx, stage, input);
          ctx.chains.set(key, output);
          this.emit("persist");
          this.send({
            t: "fp",
            k: "chain",
            deal: ctx.id,
            round,
            stage,
            index,
            deck: output.map((c) => c.toString(16)),
          });
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
    this.openMine(ctx);
    if (slots.length > 0) this.emit("keys", ctx.id, from, slots);
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
        this.emit(
          "problem",
          ctx.id,
          `내 자리 ${slot}이 카드로 열리지 않는다(섞기나 열쇠가 잘못됐다)`,
          null,
        );
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

  /** 재연결용 */
  snapshot(deal: number): PartySnapshot | null {
    return this.deals.get(deal)?.party.snapshot() ?? null;
  }
}
