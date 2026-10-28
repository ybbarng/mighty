import type { Card } from "@mighty/engine";
import { cardOf, HWATU_DECK, type PresetDeal } from "@mighty/hwatu";

import { slotOfToken, tokenOf } from "./blind";
import { type Clock, realClock } from "./clock";
import {
  type BusyReason,
  type Incident,
  reportShuffleTamper,
} from "./coordinator";
import { FairDevice, type FairWire, type GroupName } from "./device";
import type { FairControl } from "./messages";
import type { PartySnapshot } from "./protocol";

/*
 * 화투 멘탈 포커(docs/27 3절). 마이티·하트와 같은 섞기·열쇠(device.ts)에 48장 덱을 얹는다.
 * 게임마다 다른 것은 `HwatuFairSpec`으로 받고, 진행은 세 게임(고스톱·민화투·나이롱뽕)이 함께 쓴다.
 *
 * 카드가 움직이는 방법은 넷이다.
 * - 나눠 주기: 손패 자리는 받는 사람만 연다(그 기기를 뺀 모두가 열쇠를 공개한다)
 * - 바닥에 깔기: 바닥 자리는 모두가 열쇠를 공개해 모두가 본다(`PUBLIC`)
 * - 더미에서 뒤집기: 그 순간 모두가 열쇠를 공개한다
 * - 더미에서 한 장 가져오기(나이롱뽕): 가져가는 기기를 뺀 모두가 열쇠를 공개해 그 사람만 본다
 *
 * 방장 엔진은 아직 열리지 않은 카드를 자리 표(`?_12`)로 든다. 화투 카드 조회는 자리 표를 "어느 달과도
 * 맞지 않는 카드"로 본다(@mighty/hwatu `cardOf`). 엔진이 숨은 카드를 알아야 하는 순간은 셋이다.
 * - 손패를 낼 때(흔들기·폭탄·뽕·스톱·약처럼 보여야 하는 카드 포함): 낸 사람이 그 자리 열쇠를 공개한다
 * - 더미를 쓸 때: 방장이 엔진을 한 걸음 미리 돌려 보고(자리 표로) 더미가 몇 장 나가는지 본 뒤,
 *   그 자리를 열라고 모두에게 알린다(`deck`). 판 끝에 진짜 카드로 다시 돌려 그 요청이 맞았는지 본다
 * - 판 점수가 남은 손패에 달린 게임(나이롱뽕): 판이 끝나는 걸음 전에 모두 열쇠를 공개한다(`all`)
 *
 * 다음 판 패는 앞 판이 끝나자마자 섞고 나눈다. 바닥이 열리면 같은 달 넉 장인지(다시 섞기), 손패가 열리면
 * 총통인지(고스톱) 보고 나서 "준비"를 알린다. 방장은 모두 준비되면 그 패로 판을 시작한다.
 */

/** 화투 48장(카드 번호표 순서) */
export const HWATU_CARDS: readonly Card[] = HWATU_DECK.map((c) => c.id as Card);

/** 모두에게 여는 자리(바닥·뒤집기)의 주인 */
const PUBLIC = -1;

export type HwatuStep<State, Event> =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; error: string };

/** 화면에서 함께 쓰는 칸 */
export interface HwatuViewLike {
  hand: string[];
  decision: unknown;
  roundNumber: number;
}

/** 게임마다 다른 것 */
export interface HwatuFairSpec<
  Rules,
  State,
  View extends HwatuViewLike,
  Action,
  Event,
> {
  players(rules: Rules): number;
  /** 판마다 자리별 손패 장수와 바닥 장수(시드는 시작하자마자 공개돼 선을 계산할 수 있다) */
  layout(
    rules: Rules,
    seed: number,
    round: number,
  ): { hands: number[]; floor: number };
  /** 바닥에 같은 달 넉 장이 깔리면 다시 섞는다(고스톱·민화투) */
  redealOnFour: boolean;
  /** 처음 받은 손패에 같은 달 넉 장(총통)이면 그 넉 장을 모두에게 보인다(고스톱) */
  chongtong?: boolean;
  /** 판이 끝나는 걸음 전에 모든 카드를 연다(나이롱뽕: 남은 손패 합이 점수다) */
  revealBeforeEnd?: boolean;
  createMatch(
    rules: Rules,
    seed: number,
    preset: PresetDeal,
  ): { state: State; events: Event[] };
  step(state: State, seat: number, action: Action): HwatuStep<State, Event>;
  viewOf(state: State, seat: number): View;
  pendingSeats(state: State): number[];
  /** 다음 판 패를 넣는다(null이면 지운다) */
  withPreset(state: State, preset: PresetDeal | null): State;
  roundOf(state: State): number;
  deckOf(state: State): readonly string[];
  /** 판이 끝났다(다음 판을 기다리거나 게임이 끝났다) */
  roundOver(state: State): boolean;
  gameOver(state: State): boolean;
  /** 화면 기준: 판이 끝났나·게임이 끝났나(참가자가 다음 판 섞기를 시작한다) */
  viewRoundOver(view: View): boolean;
  viewGameOver(view: View): boolean;
  /** 이 걸음에 더미에서 나간 카드마다 누가 보나: null이면 모두(뒤집기), 자리 번호면 그 자리만(가져오기) */
  deckUses(events: readonly Event[], consumed: number): (number | null)[];
  /** 이 행동으로 모두에게 보일 내 손패(낼 카드, 흔들어 보일 카드, 뽕할 두 장, 스톱·약이면 손패 전부) */
  revealsOf(action: Action, view: View): string[];
  /** 행동이 낸다고 한 카드(열쇠로 연 카드와 맞춰 본다) */
  claimedOf(action: Action): string[];
  /** 진짜 카드 화면을 다시 계산한다(내 패에 따라 달라지는 결정, 손패 정렬). 이미 진짜 화면이면 그대로 */
  refreshView(view: View): View;
}

/** 자리 번호: 자리 번호 순서로 손패, 그다음 바닥, 남은 것은 더미(앞이 맨 위) */
export interface HwatuLayout {
  hands: number[][];
  floor: number[];
  deck: number[];
}

export function hwatuLayout(
  handSizes: readonly number[],
  floor: number,
): HwatuLayout {
  let next = 0;
  const take = (n: number) => Array.from({ length: n }, () => next++);
  const hands = handSizes.map(take);
  const floorSlots = take(floor);
  return { hands, floor: floorSlots, deck: take(HWATU_CARDS.length - next) };
}

/** 판 번호와 다시 섞은 횟수로 기기의 판 번호(섞기 한 번) */
export function hwatuDealId(round: number, attempt: number): number {
  return round * 64 + attempt;
}

/** 판 하나의 진짜 패: 엔진에 넣는 패와 자리 → 카드 */
export interface HwatuRoundDeal {
  preset: PresetDeal;
  cards: ReadonlyMap<number, Card>;
}

/** 방장이 연 더미 자리(`to`: −1이면 모두, 아니면 그 기기) */
export interface DeckRequest {
  slot: number;
  to: number;
}

export interface HwatuLogged<Action = unknown> {
  seat: number;
  action: Action;
  bot?: true;
}

/** 기록 속 행동에서 멘탈 포커 칸(연 자리)을 뺀다 */
export function realHwatuAction<Action>(action: Action): Action {
  if (typeof action !== "object" || action === null) return action;
  const { fairSlots: _, ...rest } = action as Action & { fairSlots?: unknown };
  return rest as Action;
}

/** 값 안의 자리 표를 아는 카드로 바꾼다. 모르는 자리 표 수도 센다 */
export function swapTokens<T>(
  value: T,
  cards: ReadonlyMap<number, Card>,
): { value: T; missing: number } {
  let missing = 0;
  const text = JSON.stringify(value).replace(
    /"\?_(\d+)"/g,
    (whole, slot: string) => {
      const card = cards.get(Number(slot));
      if (card === undefined) {
        missing++;
        return whole;
      }
      return JSON.stringify(card);
    },
  );
  return { value: JSON.parse(text) as T, missing };
}

/** 같은 달 넉 장이 있는 달 */
function fourMonth(cards: readonly string[]): number | null {
  const count = new Map<number, number>();
  for (const id of cards) {
    const m = cardOf(id).month;
    count.set(m, (count.get(m) ?? 0) + 1);
  }
  for (const [m, n] of count) if (n >= 4) return m;
  return null;
}

interface RoundCtx {
  round: number;
  attempt: number;
  dealId: number;
  layout: HwatuLayout;
  /** 바닥이 열렸고 다시 섞을 일이 없다 */
  floorOk: boolean;
  /** 내 패를 다 열어 준비를 알렸다 */
  readySent: boolean;
  /** 준비를 알린 기기와 그 기기가 먼저 보인 자리(총통). 방장이 센다 */
  ready: Map<number, number[]>;
  /** 다음에 열 더미 자리(layout.deck의 몇 번째) */
  deckNext: number;
  requests: DeckRequest[];
  allRevealed: boolean;
  /** 판이 끝나 모든 카드를 열었다 */
  opened: Map<number, Card> | null;
}

/** 방장·참가자가 똑같이 돌리는 진행: 판마다 섞고 나누기, 바닥 열기, 더미 요청, 판 끝 열기 */
export class HwatuCoordinator<
  Rules,
  State,
  View extends HwatuViewLike,
  Action,
  Event,
> {
  readonly device: FairDevice;
  readonly spec: HwatuFairSpec<Rules, State, View, Action, Event>;
  readonly rules: Rules;
  readonly seed: number;
  private readonly deviceOf: (seat: number) => number;
  readonly devices: readonly number[];
  private readonly onIncident: (incident: Incident) => void;
  private readonly onReady: (deal: number, shown: number[]) => void;
  halted = false;
  private pendingIncident = false;
  readonly rounds = new Map<number, RoundCtx>();
  private readonly byDeal = new Map<number, RoundCtx>();
  /** 판을 시작하기 전에 온 더미 요청(다시 들어온 기기가 기록을 다시 받을 때) */
  private early: { deal: number; slot: number; to: number }[] = [];
  private earlyAll = new Set<number>();
  latest = 0;

  constructor(options: {
    spec: HwatuFairSpec<Rules, State, View, Action, Event>;
    rules: Rules;
    seed: number;
    device: FairDevice;
    deviceOf: (seat: number) => number;
    devices: readonly number[];
    onIncident: (incident: Incident) => void;
    /** 내 패를 다 열었다(참가자는 방장에게 알린다). `shown`은 먼저 보인 자리(총통) */
    onReady: (deal: number, shown: number[]) => void;
  }) {
    this.spec = options.spec;
    this.rules = options.rules;
    this.seed = options.seed;
    this.device = options.device;
    this.deviceOf = options.deviceOf;
    this.devices = options.devices;
    this.onIncident = options.onIncident;
    this.onReady = options.onReady;
    this.device.on("cards", () => this.check());
    this.device.on("slots", () => this.check());
    this.device.on("keys", () => this.check());
    this.device.on("problem", (_deal, reason, device, pending) =>
      this.incident({
        seat: device,
        reason,
        ...(pending ? { pending: true as const } : {}),
      }),
    );
  }

  /** 판을 멈추고 알린다. 누군지 확인하는 중인 알림(`pending`)은 뒤따르는 알림으로 바꾼다 */
  incident(incident: Incident): void {
    if (this.halted && !this.pendingIncident) return;
    this.halted = true;
    this.pendingIncident = incident.pending === true;
    this.onIncident(incident);
  }

  /** 판을 섞고 나눈다(이미 시작했으면 그대로) */
  beginRound(round: number): void {
    if (this.rounds.has(round)) return;
    const shape = this.spec.layout(this.rules, this.seed, round);
    const ctx: RoundCtx = {
      round,
      attempt: 0,
      dealId: hwatuDealId(round, 0),
      layout: hwatuLayout(shape.hands, shape.floor),
      floorOk: false,
      readySent: false,
      ready: new Map(),
      deckNext: 0,
      requests: [],
      allRevealed: false,
      opened: null,
    };
    this.rounds.set(round, ctx);
    this.latest = Math.max(this.latest, round);
    this.startAttempt(ctx);
  }

  private startAttempt(ctx: RoundCtx): void {
    ctx.dealId = hwatuDealId(ctx.round, ctx.attempt);
    ctx.floorOk = false;
    ctx.readySent = false;
    ctx.ready = new Map();
    this.byDeal.set(ctx.dealId, ctx);
    const owners = new Map<number, number>();
    ctx.layout.hands.forEach((slots, seat) => {
      for (const slot of slots) owners.set(slot, this.deviceOf(seat));
    });
    for (const slot of ctx.layout.floor) owners.set(slot, PUBLIC);
    this.device.start(ctx.dealId, this.devices, HWATU_CARDS);
    this.device.assign(ctx.dealId, owners);
    this.replayEarly(ctx);
    this.updateBusy();
  }

  ctxOf(round: number): RoundCtx | undefined {
    return this.rounds.get(round);
  }

  dealOf(round: number): number | null {
    return this.rounds.get(round)?.dealId ?? null;
  }

  /** 이 판에서 이 기기가 아는 카드: 내 카드와 모두에게 열린 카드 */
  knownCards(round: number): Map<number, Card> {
    const ctx = this.rounds.get(round);
    const out = new Map<number, Card>();
    if (!ctx) return out;
    for (const [slot, card] of this.device.myCards(ctx.dealId))
      out.set(slot, card);
    const ledger = this.device.ledger(ctx.dealId);
    if (!ledger) return out;
    for (let slot = 0; slot < ledger.deck.length; slot++) {
      if (out.has(slot)) continue;
      const card = this.device.open(ctx.dealId, slot);
      if (card !== null) out.set(slot, card);
    }
    return out;
  }

  /** 모두에게 열린 카드(내 카드 빼고) */
  publicCards(round: number): Map<number, Card> {
    const ctx = this.rounds.get(round);
    const out = new Map<number, Card>();
    if (!ctx) return out;
    const ledger = this.device.ledger(ctx.dealId);
    if (!ledger) return out;
    for (let slot = 0; slot < ledger.deck.length; slot++) {
      const card = this.device.open(ctx.dealId, slot);
      if (card !== null) out.set(slot, card);
    }
    return out;
  }

  /** 이 판을 엔진에 넣는 패: 아직 모르는 카드는 자리 표, 모두에게 열린 카드는 진짜 카드 */
  presetFor(round: number): PresetDeal | null {
    const ctx = this.rounds.get(round);
    if (!ctx?.floorOk) return null;
    const known = this.publicCards(round);
    const card = (slot: number) => (known.get(slot) ?? tokenOf(slot)) as string;
    return {
      hands: ctx.layout.hands.map((slots) => slots.map(card)),
      floor: ctx.layout.floor.map(card),
      deck: ctx.layout.deck.map(card),
      redeals: ctx.attempt,
    };
  }

  /** 바닥이 열리고(다시 섞을 일이 없고) 내 패를 다 열었다 */
  readyHere(round: number): boolean {
    const ctx = this.rounds.get(round);
    return ctx?.readySent === true;
  }

  /**
   * 모두 준비됐다(방장이 본다): 내 준비 + 참가자 기기 모두의 준비, 그리고 그 기기들이 먼저 보인
   * 자리(총통)가 다 열렸다(열쇠 메시지가 준비 알림보다 늦게 처리될 수 있다)
   */
  readyAll(round: number): boolean {
    const ctx = this.rounds.get(round);
    if (!ctx?.readySent) return false;
    for (const d of this.devices) {
      const shown = ctx.ready.get(d);
      if (!shown) return false;
      if (shown.some((s) => this.device.open(ctx.dealId, s) === null))
        return false;
    }
    return true;
  }

  /** 다른 기기가 준비를 알렸다(`shown`: 먼저 보인 자리) */
  receiveReady(deal: number, from: number, shown: readonly number[]): void {
    const slots = shown.filter((s) => Number.isInteger(s) && s >= 0 && s < 48);
    const ctx = this.byDeal.get(deal);
    if (!ctx || ctx.dealId !== deal || !ctx.readySent) {
      this.earlyReady.push({ deal, from, shown: slots });
      return;
    }
    ctx.ready.set(from, slots);
    this.notify();
  }

  private earlyReady: { deal: number; from: number; shown: number[] }[] = [];

  private check(): void {
    for (const ctx of this.rounds.values()) this.checkRound(ctx);
    this.notify();
  }

  private checkRound(ctx: RoundCtx): void {
    if (this.halted) return;
    const { dealId } = ctx;
    if (!ctx.floorOk) {
      const floor = ctx.layout.floor.map((s) => this.device.open(dealId, s));
      if (floor.some((c) => c === null)) return;
      const cards = floor as Card[];
      if (new Set(cards).size !== cards.length) {
        reportShuffleTamper(
          this.device,
          dealId,
          "바닥에 같은 카드가 두 번 있다",
          (i) => this.incident(i),
        );
        return;
      }
      if (this.spec.redealOnFour && fourMonth(cards) !== null) {
        // 바닥에 같은 달 넉 장: 모두가 같은 바닥을 보므로 똑같이 다시 섞는다.
        ctx.attempt += 1;
        this.startAttempt(ctx);
        return;
      }
      ctx.floorOk = true;
      this.updateBusy();
    }
    if (!ctx.readySent) {
      const me = this.device.id;
      const mine = this.device.myCards(dealId);
      const mySeats = ctx.layout.hands
        .map((slots, seat) => ({ slots, seat }))
        .filter((h) => this.deviceOf(h.seat) === me);
      if (mySeats.some((h) => h.slots.some((s) => !mine.has(s)))) return;
      const shown: number[] = [];
      if (this.spec.chongtong) {
        // 총통: 같은 달 넉 장을 받았으면 모두에게 보인다(엔진이 판을 바로 끝낸다).
        for (const { slots } of mySeats) {
          const cards = slots.map((s) => mine.get(s) as Card);
          const month = fourMonth(cards);
          if (month === null) continue;
          shown.push(
            ...slots.filter(
              (s) => cardOf(mine.get(s) as string).month === month,
            ),
          );
        }
        if (shown.length > 0) this.device.reveal(dealId, shown, "proof");
      }
      ctx.readySent = true;
      ctx.ready.set(this.device.id, shown);
      for (const r of this.earlyReady.filter((e) => e.deal === dealId))
        ctx.ready.set(r.from, r.shown);
      this.earlyReady = this.earlyReady.filter((e) => e.deal !== dealId);
      this.onReady(dealId, shown);
      this.updateBusy();
    }
    if (ctx.allRevealed && !ctx.opened) {
      const cards = this.device.openAll(dealId);
      if (cards) {
        if (new Set(cards.values()).size !== cards.size) {
          reportShuffleTamper(
            this.device,
            dealId,
            "열어 보니 같은 카드가 두 번 있다",
            (i) => this.incident(i),
          );
          return;
        }
        ctx.opened = cards;
        for (const l of this.openListeners) l(ctx.round);
      }
    }
  }

  /**
   * 방장이 더미 자리를 열라고 했다. 더미는 순서대로만 연다(앞에서부터). 맞았는지는 판 끝에
   * 진짜 카드로 다시 돌려 본다(`checkHwatuReplay`)
   */
  request(deal: number, slot: number, to: number): void {
    const ctx = this.byDeal.get(deal);
    if (!ctx || ctx.dealId !== deal) {
      this.early.push({ deal, slot, to });
      return;
    }
    if (ctx.requests.some((r) => r.slot === slot)) return;
    const expected = ctx.layout.deck[ctx.deckNext];
    if (slot !== expected || (to !== PUBLIC && !this.devices.includes(to))) {
      this.incident({
        seat: 0,
        reason: "방장이 더미를 순서와 다르게 열라고 했다",
      });
      return;
    }
    ctx.deckNext += 1;
    ctx.requests.push({ slot, to });
    this.device.assign(deal, new Map([[slot, to]]));
    this.updateBusy();
  }

  /** 판 끝(또는 판이 끝나는 걸음 전): 내 열쇠를 모두 공개한다 */
  revealAll(deal: number): void {
    const ctx = this.byDeal.get(deal);
    if (!ctx || ctx.dealId !== deal) {
      this.earlyAll.add(deal);
      return;
    }
    if (ctx.allRevealed) return;
    ctx.allRevealed = true;
    this.device.revealAll(deal);
    this.check();
  }

  private replayEarly(ctx: RoundCtx): void {
    const mine = this.early.filter((e) => e.deal === ctx.dealId);
    this.early = this.early.filter((e) => e.deal !== ctx.dealId);
    for (const e of mine) this.request(e.deal, e.slot, e.to);
    if (this.earlyAll.delete(ctx.dealId)) this.revealAll(ctx.dealId);
  }

  /** 이 판에서 방장이 연 더미 자리들 */
  requestsOf(round: number): readonly DeckRequest[] {
    return this.rounds.get(round)?.requests ?? [];
  }

  /** 판이 끝났다: 판 끝 확인을 위해 모두 열고, 게임이 이어지면 다음 판을 섞는다 */
  roundEnded(round: number, gameOver: boolean): void {
    const ctx = this.rounds.get(round);
    if (ctx) this.revealAll(ctx.dealId);
    if (!gameOver) this.beginRound(round + 1);
  }

  /** 판 하나의 진짜 패(모두 열린 판) */
  roundDeal(round: number): HwatuRoundDeal | null {
    const ctx = this.rounds.get(round);
    const cards = ctx?.opened;
    if (!ctx || !cards) return null;
    const card = (slot: number) => cards.get(slot) as string;
    return {
      preset: {
        hands: ctx.layout.hands.map((slots) => slots.map(card)),
        floor: ctx.layout.floor.map(card),
        deck: ctx.layout.deck.map(card),
        redeals: ctx.attempt,
      },
      cards,
    };
  }

  private openListeners = new Set<(round: number) => void>();
  onOpened(listener: (round: number) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private waiters = new Set<() => void>();
  /** 상태가 바뀔 때마다 부를 함수(기다리는 쪽이 조건을 다시 본다) */
  watch(fn: () => void): () => void {
    this.waiters.add(fn);
    return () => this.waiters.delete(fn);
  }
  private notify(): void {
    for (const w of [...this.waiters]) w();
  }

  private busy: BusyReason | null = null;
  private busyListeners = new Set<(busy: BusyReason | null) => void>();
  onBusy(listener: (busy: BusyReason | null) => void): () => void {
    this.busyListeners.add(listener);
    listener(this.busy);
    return () => this.busyListeners.delete(listener);
  }

  /** 섞고 나누는 중이면 "deal"(화면이 섞는 모습을 보인다) */
  private updateBusy(): void {
    const ctx = this.rounds.get(this.latest);
    const reason: BusyReason | null =
      ctx && !ctx.readySent ? (ctx.attempt > 0 ? "redeal" : "deal") : null;
    if (reason === this.busy) return;
    this.busy = reason;
    for (const l of this.busyListeners) l(reason);
  }
}

export type HwatuReplayCheck<State> =
  | { ok: true; state: State; states: State[]; upTo: number }
  | { ok: false; index: number; seat: number; reason: string };

/**
 * 판마다의 진짜 패로 기록을 처음부터 다시 돌린다. 아직 패를 모르는 판에 들어서면 거기서 멈춘다.
 * `requests`(판 → 방장이 연 더미 자리)가 있으면 더미를 엔진이 쓴 대로만 열었는지도 본다
 * (방장이 더미를 미리 열어 보거나, 남이 가져갈 카드를 자기 기기로 열지 않았는지)
 */
export function checkHwatuReplay<
  Rules,
  State,
  View extends HwatuViewLike,
  Action,
  Event,
>(
  spec: HwatuFairSpec<Rules, State, View, Action, Event>,
  rules: Rules,
  seed: number,
  log: readonly HwatuLogged<Action>[],
  deals: ReadonlyMap<number, { preset: PresetDeal }>,
  requests?: {
    of(round: number): readonly DeckRequest[];
    deviceOf(seat: number): number;
  },
): HwatuReplayCheck<State> {
  const first = deals.get(1);
  if (!first)
    return { ok: false, index: -1, seat: 0, reason: "첫 판 패가 없다" };
  let state = spec.createMatch(rules, seed, first.preset).state;
  const states = [state];
  let used = 0;
  const finish = (
    round: number,
    index: number,
  ): HwatuReplayCheck<State> | null => {
    if (!requests) return null;
    if (requests.of(round).length > used)
      return {
        ok: false,
        index,
        seat: 0,
        reason: "방장이 엔진이 쓰지 않은 더미 카드를 열었다",
      };
    return null;
  };
  for (const [index, entry] of log.entries()) {
    const round = spec.roundOf(state);
    if (!deals.has(round)) return { ok: true, state, states, upTo: index };
    const next = deals.get(round + 1);
    const input = spec.withPreset(state, next?.preset ?? null);
    let result: HwatuStep<State, Event>;
    try {
      result = spec.step(input, entry.seat, realHwatuAction(entry.action));
    } catch {
      // 다음 판 패를 아직 모른다(그 판을 시작하는 걸음).
      return { ok: true, state, states, upTo: index };
    }
    if (!result.ok)
      return {
        ok: false,
        index,
        seat: entry.seat,
        reason: `진짜 카드로 다시 계산하니 규칙에 맞지 않는 행동이었다(${result.error})`,
      };
    const after = result.state;
    if (spec.roundOf(after) === round) {
      const consumed = spec.deckOf(state).length - spec.deckOf(after).length;
      if (requests && consumed > 0) {
        const asked = requests.of(round);
        for (const use of spec.deckUses(result.events, consumed)) {
          const want = use === null ? PUBLIC : requests.deviceOf(use);
          const got = asked[used];
          if (!got || got.to !== want)
            return {
              ok: false,
              index,
              seat: 0,
              reason: "방장이 더미 카드를 엔진과 다르게 열었다",
            };
          used += 1;
        }
      }
    } else {
      const wrong = finish(round, index);
      if (wrong) return wrong;
      used = 0;
    }
    state = spec.withPreset(after, null);
    states.push(state);
  }
  return { ok: true, state, states, upTo: log.length };
}

type Prepared<Action> =
  | { ok: true; action: Action }
  | { ok: false; error: string };

export interface HwatuHostHooks<State, Action> {
  patch(fn: (state: State) => State): void;
  state(): State;
  log(): readonly HwatuLogged<Action>[];
  refresh(): void;
  broadcast(message: FairWire | FairControl): void;
  onIncident(incident: Incident): void;
}

/** 방장 기기 쪽 화투 멘탈 포커 진행 */
export class HwatuHostTable<
  Rules,
  State,
  View extends HwatuViewLike,
  Action,
  Event,
> {
  readonly spec: HwatuFairSpec<Rules, State, View, Action, Event>;
  readonly rules: Rules;
  readonly seed: number;
  readonly device: FairDevice;
  readonly coordinator: HwatuCoordinator<Rules, State, View, Action, Event>;
  readonly deals = new Map<number, HwatuRoundDeal>();
  readonly history: { events: Event[] }[] = [];
  private readonly guests: Set<number>;
  private readonly hooks: HwatuHostHooks<State, Action>;
  private readonly clock: Clock;
  private readonly ended = new Set<number>();
  private readonly checked = new Set<number>();

  constructor(options: {
    spec: HwatuFairSpec<Rules, State, View, Action, Event>;
    rules: Rules;
    seed: number;
    guestSeats: readonly number[];
    group: GroupName;
    hooks: HwatuHostHooks<State, Action>;
    restore?: Record<number, PartySnapshot>;
    clock?: Clock;
  }) {
    this.spec = options.spec;
    this.rules = options.rules;
    this.seed = options.seed;
    this.guests = new Set(options.guestSeats);
    this.hooks = options.hooks;
    this.clock = options.clock ?? realClock;
    this.device = new FairDevice({
      id: 0,
      group: options.group,
      send: (m) => this.hooks.broadcast(m),
      clock: this.clock,
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new HwatuCoordinator({
      spec: this.spec,
      rules: this.rules,
      seed: this.seed,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: (i) => this.hooks.onIncident(i),
      onReady: () => this.hooks.refresh(),
    });
    this.device.on("cards", () => this.hooks.refresh());
    this.coordinator.watch(() => this.hooks.refresh());
    this.coordinator.onOpened((round) => this.onOpened(round));
  }

  deviceOf(seat: number): number {
    return this.guests.has(seat) ? seat : 0;
  }

  get halted(): boolean {
    return this.coordinator.halted;
  }

  /** 첫 판을 섞고 나눈다. 모두 준비되면 그 판 패(엔진에 넣는 것)를 돌려준다 */
  async firstDeal(): Promise<PresetDeal | null> {
    this.coordinator.beginRound(1);
    const ok = await this.until(() => this.coordinator.readyAll(1), null);
    return ok ? this.coordinator.presetFor(1) : null;
  }

  /** 조건이 맞을 때까지 기다린다. 판을 멈추면 false. `ms`가 있으면 그만큼만 */
  private until(cond: () => boolean, ms: number | null): Promise<boolean> {
    return new Promise((resolve) => {
      let cancelTimer: (() => void) | null = null;
      let stop: (() => void) | null = null;
      const done = (ok: boolean) => {
        stop?.();
        cancelTimer?.();
        resolve(ok);
      };
      const probe = () => {
        if (this.halted) done(false);
        else if (cond()) done(true);
      };
      stop = this.coordinator.watch(probe);
      if (ms !== null) cancelTimer = this.clock.after(ms, () => done(false));
      probe();
    });
  }

  /** 상태 속 자리 표 가운데 모두에게 열린 것을 진짜 카드로 */
  private opened(state: State): State {
    const round = this.spec.roundOf(state);
    return swapTokens(state, this.coordinator.publicCards(round)).value;
  }

  /** 엔진 한 걸음: 열린 카드를 넣고, 다음 판을 시작하는 걸음이면 다음 판 패를 넣는다 */
  step(input: State, seat: number, action: Action): HwatuStep<State, Event> {
    let state = this.opened(input);
    const round = this.spec.roundOf(state);
    const next = this.coordinator.readyAll(round + 1)
      ? this.coordinator.presetFor(round + 1)
      : null;
    state = this.spec.withPreset(state, next);
    let result: HwatuStep<State, Event>;
    try {
      result = this.spec.step(state, seat, action);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!result.ok) return result;
    return { ...result, state: this.spec.withPreset(result.state, null) };
  }

  after(state: State, events: readonly Event[]): void {
    this.history.push({ events: [...events] });
    this.handleRound(state);
  }

  private handleRound(state: State): void {
    const round = this.spec.roundOf(state);
    if (this.spec.roundOver(state) && !this.ended.has(round)) {
      this.ended.add(round);
      // 끝내기(retire)로 끝난 게임은 열지 않는다(끊긴 사람 열쇠가 없다).
      const retired = (state as { retired?: boolean }).retired === true;
      if (!retired)
        this.coordinator.roundEnded(round, this.spec.gameOver(state));
      if (this.awaitingEnd.delete(round)) this.verifyRound(round);
    }
  }

  /** 새로고침에 대비해 남길 것 */
  snapshot(): {
    history: { events: Event[] }[];
    device: Record<number, PartySnapshot>;
    requests: { deal: number; slot: number; to: number }[];
    all: number[];
  } {
    const requests: { deal: number; slot: number; to: number }[] = [];
    const all: number[] = [];
    for (const ctx of this.coordinator.rounds.values()) {
      for (const r of ctx.requests) requests.push({ deal: ctx.dealId, ...r });
      if (ctx.allRevealed) all.push(ctx.dealId);
    }
    return {
      history: this.history.map((h) => ({ events: h.events })),
      device: this.device.snapshotAll(),
      requests,
      all,
    };
  }

  /** 새로고침한 방장: 판을 다시 시작하고(같은 열쇠) 연 더미 자리를 되살린다 */
  resume(
    saved: ReturnType<
      HwatuHostTable<Rules, State, View, Action, Event>["snapshot"]
    >,
  ): void {
    this.history.push(...saved.history);
    this.coordinator.beginRound(1);
    const state = this.hooks.state();
    for (let r = 2; r <= this.spec.roundOf(state); r++)
      this.coordinator.beginRound(r);
    for (let r = 1; r < this.spec.roundOf(state); r++) this.ended.add(r);
    for (const req of saved.requests)
      this.coordinator.request(req.deal, req.slot, req.to);
    for (const deal of saved.all) this.coordinator.revealAll(deal);
    this.handleRound(state);
  }

  /** 방장 기기 자리(방장·컴퓨터) 화면을 내 카드로 바꾼다. 아직 못 연 카드가 있으면 null */
  viewFor(seat: number, view: View): View | null {
    if (this.deviceOf(seat) !== 0) return view;
    const swapped = swapTokens(
      view,
      this.coordinator.knownCards(view.roundNumber),
    );
    if (swapped.missing > 0) return null;
    return this.spec.refreshView(swapped.value);
  }

  /**
   * 행동할 자리. 방장 기기 자리 가운데 할 일이 없는 자리(뽕할 패가 없는 컴퓨터)는 뺀다
   * (자리 표로 계산한 엔진은 누가 뽕할 수 있는지 모른다)
   */
  pendingSeats(state: State): number[] {
    return this.spec.pendingSeats(state).filter((seat) => {
      if (this.deviceOf(seat) !== 0) return true;
      const view = this.viewFor(seat, this.spec.viewOf(state, seat));
      return view === null || view.decision !== null;
    });
  }

  private waitOpen(round: number, slots: readonly number[]): Promise<boolean> {
    const deal = this.coordinator.dealOf(round);
    if (deal === null) return Promise.resolve(false);
    return this.until(
      () => slots.every((s) => this.device.open(deal, s) !== null),
      15_000,
    );
  }

  async prepare(
    _input: State,
    seat: number,
    action: Action,
  ): Promise<Prepared<Action>> {
    if (this.halted) return { ok: false, error: "판을 멈췄다" };
    const round = this.spec.roundOf(this.hooks.state());
    if (!(await this.until(() => this.coordinator.readyAll(round), null)))
      return { ok: false, error: "판을 멈췄다" };
    const deal = this.coordinator.dealOf(round) as number;
    const state = this.hooks.state();
    const hand = this.spec.viewOf(state, seat).hand;
    let out = action;
    let slots: number[] = [];
    if (this.deviceOf(seat) === 0) {
      const view = this.viewFor(seat, this.spec.viewOf(state, seat));
      if (!view) return { ok: false, error: "카드를 여는 중입니다" };
      const mine = this.device.myCards(deal);
      for (const card of this.spec.revealsOf(action, view)) {
        if (hand.includes(card)) continue;
        const slot = hand
          .map((t) => slotOfToken(t))
          .find((s) => s !== null && mine.get(s) === card);
        if (slot === undefined || slot === null)
          return { ok: false, error: "손에 없는 카드다" };
        slots.push(slot);
      }
      if (slots.length > 0) {
        this.device.reveal(deal, slots, "play");
        out = { ...action, fairSlots: slots } as Action;
      }
    } else {
      const claimed = (action as { fairSlots?: unknown }).fairSlots;
      slots = Array.isArray(claimed)
        ? claimed.filter((s): s is number => Number.isInteger(s))
        : [];
      if (slots.some((s) => !hand.includes(tokenOf(s)))) {
        this.coordinator.incident({
          seat,
          reason: "자기 손에 없는 자리의 카드를 내려 했다",
        });
        return { ok: false, error: "자기 손에 없는 자리의 카드다" };
      }
    }
    if (slots.length > 0) {
      if (!(await this.waitOpen(round, slots)))
        return { ok: false, error: "카드 열쇠가 오지 않았다" };
      const opened = slots.map((s) => this.device.open(deal, s) as string);
      const known = new Set([...opened, ...hand]);
      if (this.spec.claimedOf(action).some((c) => !known.has(c))) {
        const reason = "낸다고 한 카드와 열쇠로 연 카드가 다르다";
        this.coordinator.incident({ seat, reason });
        return { ok: false, error: reason };
      }
    }
    // 엔진을 한 걸음 미리 돌려 보고 더미를 몇 장 쓰는지, 판이 끝나는지 본다.
    for (let guard = 0; guard < 8; guard++) {
      if (this.halted) return { ok: false, error: "판을 멈췄다" };
      const current = this.opened(this.hooks.state());
      const r = this.spec.roundOf(current);
      const ready = this.coordinator.readyAll(r + 1);
      const trial = this.spec.withPreset(
        current,
        ready ? this.coordinator.presetFor(r + 1) : this.dummyPreset(r + 1),
      );
      let dry: HwatuStep<State, Event>;
      try {
        dry = this.spec.step(trial, seat, out);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!dry.ok) return dry;
      if (this.spec.roundOf(dry.state) !== r) {
        if (ready) break;
        // 다음 판을 시작하는 걸음: 다음 판 패가 준비될 때까지 기다린다.
        this.coordinator.beginRound(r + 1);
        if (!(await this.until(() => this.coordinator.readyAll(r + 1), null)))
          return { ok: false, error: "판을 멈췄다" };
        continue;
      }
      const ctx = this.coordinator.ctxOf(r);
      if (!ctx) return { ok: false, error: "판을 찾지 못했다" };
      const deck = this.spec.deckOf(current);
      const consumed = deck.length - this.spec.deckOf(dry.state).length;
      if (consumed > 0) {
        const usedBefore = ctx.layout.deck.length - deck.length;
        const uses = this.spec.deckUses(dry.events, consumed);
        const publicSlots: number[] = [];
        for (const [k, use] of uses.entries()) {
          const index = usedBefore + k;
          const slot = ctx.layout.deck[index] as number;
          if (index >= ctx.deckNext) {
            const to = use === null ? PUBLIC : this.deviceOf(use);
            this.hooks.broadcast({
              t: "fp",
              k: "deck",
              deal: ctx.dealId,
              slot,
              to,
            });
            this.coordinator.request(ctx.dealId, slot, to);
          }
          if (use === null && this.device.open(ctx.dealId, slot) === null)
            publicSlots.push(slot);
        }
        if (publicSlots.length > 0) {
          if (!(await this.waitOpen(r, publicSlots)))
            return { ok: false, error: "뒤집을 카드 열쇠가 오지 않았다" };
          continue;
        }
      }
      if (
        this.spec.revealBeforeEnd &&
        this.spec.roundOver(dry.state) &&
        !ctx.allRevealed
      ) {
        this.hooks.broadcast({ t: "fp", k: "all", deal: ctx.dealId });
        this.coordinator.revealAll(ctx.dealId);
        if (
          !(await this.until(
            () => this.device.openAll(ctx.dealId) !== null,
            15_000,
          ))
        )
          return { ok: false, error: "판 끝 열쇠가 오지 않았다" };
        continue;
      }
      break;
    }
    return { ok: true, action: out };
  }

  /** 아직 섞지 않은 다음 판 자리(미리 돌려 보기에서 판이 바뀌는지만 본다) */
  private dummyPreset(round: number): PresetDeal {
    const shape = this.spec.layout(this.rules, this.seed, round);
    const layout = hwatuLayout(shape.hands, shape.floor);
    return {
      hands: layout.hands.map((s) => s.map(tokenOf)),
      floor: layout.floor.map(tokenOf),
      deck: layout.deck.map(tokenOf),
    };
  }

  receive(message: FairWire | FairControl, from: number): void {
    switch (message.k) {
      case "ready":
        if (message.from === from)
          this.coordinator.receiveReady(
            message.deal,
            from,
            Array.isArray(message.shown) ? message.shown : [],
          );
        break;
      case "chain":
      case "keys":
      case "sproof":
      case "cproof":
      case "handover":
        this.device.receive(message, from);
        break;
    }
  }

  private onOpened(round: number): void {
    const real = this.coordinator.roundDeal(round);
    if (!real) return;
    this.deals.set(round, real);
    // 판이 끝나는 걸음 전에 연 판(나이롱뽕)은 그 걸음이 기록에 들어간 뒤에 확인한다.
    if (!this.ended.has(round)) {
      this.awaitingEnd.add(round);
      return;
    }
    this.verifyRound(round);
  }

  private readonly awaitingEnd = new Set<number>();

  /** 판 끝 확인: 참가자에게 기록을 보내고, 방장 기기도 진짜 카드로 다시 계산해 본다 */
  private verifyRound(round: number): void {
    this.hooks.broadcast({
      t: "fp",
      k: "log",
      deal: round,
      log: [...this.hooks.log()] as never,
    });
    if (this.checked.has(round)) return;
    this.checked.add(round);
    const checked = checkHwatuReplay(
      this.spec,
      this.rules,
      this.seed,
      this.hooks.log(),
      this.deals,
      {
        of: (r) => this.coordinator.requestsOf(r),
        deviceOf: (seat) => this.deviceOf(seat),
      },
    );
    if (!checked.ok)
      this.coordinator.incident({ seat: checked.seat, reason: checked.reason });
  }
}

/** 참가자 기기 쪽 화투 멘탈 포커 진행 */
export class HwatuGuestSeat<
  Rules,
  State,
  View extends HwatuViewLike,
  Action,
  Event,
> {
  readonly seat: number;
  readonly spec: HwatuFairSpec<Rules, State, View, Action, Event>;
  readonly device: FairDevice;
  readonly coordinator: HwatuCoordinator<Rules, State, View, Action, Event>;
  readonly deals = new Map<number, HwatuRoundDeal>();
  private readonly guests: Set<number>;
  private readonly queue: { view: View; events: Event[] }[] = [];
  private last: View | null = null;
  private lastReal: View | null = null;
  private readonly logs = new Map<number, HwatuLogged<Action>[]>();
  private readonly verified = new Set<number>();
  private steps = 0;
  private readonly ended = new Set<number>();

  constructor(
    private readonly options: {
      spec: HwatuFairSpec<Rules, State, View, Action, Event>;
      rules: Rules;
      seed: number;
      seat: number;
      guestSeats: readonly number[];
      group: GroupName;
      broadcast: (message: FairWire | FairControl) => void;
      onIncident: (incident: Incident) => void;
      onSnapshot: (view: View, events: Event[]) => void;
      onVerify: (round: number, log: HwatuLogged<Action>[]) => void;
      restore?: Record<number, PartySnapshot>;
      clock?: Clock;
    },
  ) {
    this.seat = options.seat;
    this.spec = options.spec;
    this.guests = new Set(options.guestSeats);
    this.device = new FairDevice({
      id: options.seat,
      group: options.group,
      send: (m) => options.broadcast(m),
      clock: options.clock ?? realClock,
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new HwatuCoordinator({
      spec: options.spec,
      rules: options.rules,
      seed: options.seed,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: options.onIncident,
      onReady: (deal, shown) =>
        options.broadcast({
          t: "fp",
          k: "ready",
          deal,
          from: this.seat,
          ...(shown.length > 0 ? { shown } : {}),
        }),
    });
    this.coordinator.watch(() => this.flush());
    this.device.on("cards", () => this.flush());
    this.coordinator.onOpened((round) => {
      const real = this.coordinator.roundDeal(round);
      if (real) this.deals.set(round, real);
      this.tryVerify(round);
    });
  }

  deviceOf(seat: number): number {
    return this.guests.has(seat) ? seat : 0;
  }

  get halted(): boolean {
    return this.coordinator.halted;
  }

  get waiting(): boolean {
    return this.queue.length > 0;
  }

  /** 게임이 시작했다(시드가 공개됐다): 첫 판을 함께 섞는다 */
  start(): void {
    this.coordinator.beginRound(1);
  }

  /** 다시 들어온 기기: 방장이 보낸 걸음별 사건으로 판 진행(다음 판 섞기)을 되살린다 */
  history(items: readonly { events: Event[] }[]): void {
    this.start();
    for (let i = this.steps; i < items.length; i++)
      this.handleEvents((items[i] as { events: Event[] }).events);
    this.steps = Math.max(this.steps, items.length);
  }

  /** 판 끝 사건이 있으면 다음 판을 섞는다(방장의 `after`와 같은 판단) */
  private handleEvents(events: readonly Event[]): void {
    for (const e of events) {
      const type = (e as { type?: string }).type;
      if (type !== "roundEnded") continue;
      const round = this.roundFromEvent(e);
      if (round === null || this.ended.has(round)) continue;
      this.ended.add(round);
      const over = events.some(
        (x) =>
          (x as { type?: string }).type === "gameEnded" &&
          !(x as { retired?: boolean }).retired,
      );
      this.coordinator.roundEnded(round, over);
    }
  }

  /** 판 끝 사건의 판 번호: 사건에 없으면 지금까지 끝난 판 다음 */
  private roundFromEvent(e: Event): number | null {
    const r =
      (e as { result?: { roundNumber?: number } }).result?.roundNumber ??
      (e as { roundNumber?: number }).roundNumber;
    if (typeof r === "number") return r;
    return this.ended.size + 1;
  }

  snapshot(view: View, events: Event[], resync = false): void {
    this.last = view;
    if (!resync) {
      this.steps++;
      this.handleEvents(events);
    }
    // 화면으로도 판 끝을 본다(첫 판이 총통으로 바로 끝나면 판 끝 사건 없이 첫 화면이 온다).
    if (this.spec.viewRoundOver(view) && !this.ended.has(view.roundNumber)) {
      this.ended.add(view.roundNumber);
      const retired = (view as { retired?: boolean }).retired === true;
      if (!retired)
        this.coordinator.roundEnded(
          view.roundNumber,
          this.spec.viewGameOver(view),
        );
    }
    this.queue.push({ view, events: resync ? [] : events });
    this.flush();
  }

  private flush(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0] as { view: View; events: Event[] };
      const swapped = swapTokens(
        next.view,
        this.coordinator.knownCards(next.view.roundNumber),
      );
      if (swapped.missing > 0) return;
      this.queue.shift();
      const real = this.spec.refreshView(swapped.value);
      this.lastReal = real;
      this.options.onSnapshot(real, next.events);
    }
  }

  /** 보내기 전에: 보일 카드의 열쇠를 공개하고 그 자리를 행동에 싣는다 */
  outgoing(action: Action): Action | null {
    if (this.waiting || !this.last || !this.lastReal) return null;
    const round = this.last.roundNumber;
    const deal = this.coordinator.dealOf(round);
    if (deal === null) return null;
    const mine = this.device.myCards(deal);
    const tokens = this.last.hand;
    const slots: number[] = [];
    for (const card of this.spec.revealsOf(action, this.lastReal)) {
      if (tokens.includes(card)) continue;
      const slot = tokens
        .map((t) => slotOfToken(t))
        .find((s) => s !== null && mine.get(s) === card);
      if (slot === undefined || slot === null) return null;
      slots.push(slot);
    }
    if (slots.length === 0) return action;
    this.device.reveal(deal, slots, "play");
    return { ...action, fairSlots: slots } as Action;
  }

  receive(message: FairWire | FairControl, from: number): void {
    if (this.halted && message.k === "log") return;
    switch (message.k) {
      case "chain":
      case "keys":
      case "sproof":
      case "cproof":
      case "handover":
        this.device.receive(message, from);
        break;
      case "deck":
        if (from === 0)
          this.coordinator.request(message.deal, message.slot, message.to);
        break;
      case "all":
        if (from === 0) this.coordinator.revealAll(message.deal);
        break;
      case "log":
        if (from === 0) {
          this.logs.set(message.deal, message.log as never);
          this.tryVerify(message.deal);
        }
        break;
    }
  }

  private tryVerify(round: number): void {
    const log = this.logs.get(round);
    if (!log || !this.deals.has(round) || this.verified.has(round)) return;
    this.verified.add(round);
    this.options.onVerify(round, log);
  }
}
