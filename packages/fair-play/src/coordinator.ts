import {
  type Card,
  deckFor,
  type GameEvent,
  type Kiruda,
  lastTrickIndex,
  type RuleSet,
  type Suit,
} from "@mighty/engine";

import type { RoundDeal } from "./audit";
import { cardText, redealOwners, slotOfToken, tokenDeal } from "./blind";
import type { FairDevice } from "./device";
import { RenegeWatch } from "./renege";

/*
 * 판 흐름에 맞춰 멘탈 포커를 진행한다. 방장과 참가자가 똑같이 돌린다.
 * 누구에게 어느 자리를 줄지는 엔진 사건(공개 정보)만 보고 모든 기기가 같은 값을 계산한다.
 * 그래서 방장이 "이 자리는 내 것"이라고 따로 알릴 일이 없고, 속일 틈도 없다.
 *
 * - 판 시작(roundStarted): 새로 섞고 자리 표 순서대로 나눈다(tokenDeal)
 * - 당선(kittyTaken): 바닥 카드 자리를 주공에게
 * - 6·7마 다시 나누기(redealtForDead): 바닥 카드와 죽은 사람 자리를 다시 섞어 엔진 순서로 나눈다
 * - 카드 내기(played): 낸 사람의 열쇠로 연 카드가 그 카드인지, 무늬 안 따르기가 드러났는지 본다
 * - 마지막 턴 시작: 모두 열쇠를 공개한다(판 전체를 진짜 카드로 다시 계산, audit.ts)
 */

/** 카드를 기다리는 까닭: 판 시작 섞기, 6·7마 다시 섞기, 그 밖(바닥 카드·증명 등) */
export type BusyReason = "deal" | "redeal" | "wait";

export interface Incident {
  /** 탓할 자리. 누군지 가릴 수 없으면 null */
  seat: number | null;
  reason: string;
  /**
   * 부정은 확실하지만 누가 했는지 확인하는 중이다(섞기 증명을 기다린다). 판은 바로 멈추고,
   * 확인되면 이 알림을 바꾸는 알림이 뒤따른다
   */
  pending?: true;
}

/**
 * 섞기 조작이 드러났다(같은 카드가 두 번 등): 섞기·바꾸기 증명으로 누군지 찾아 알린다.
 * 기기 번호는 그 기기 사람의 자리 번호다
 */
export function reportShuffleTamper(
  device: FairDevice,
  deal: number,
  what: string,
  incident: (incident: Incident) => void,
): void {
  // 같은 카드가 두 번 열린 것은 내 기기가 직접 본 사실이라 판을 바로 멈춘다. 누가 했는지는 뒤따라 알린다.
  incident({
    seat: null,
    reason: `${what}: 섞기 조작이다. 누가 했는지 섞기 증명으로 확인하는 중`,
    pending: true,
  });
  void device.shuffleCulprit(deal).then((culprit) =>
    incident(
      culprit
        ? { seat: culprit.device, reason: `${what}: ${culprit.reason}` }
        : {
            seat: null,
            reason: `${what}(섞기를 조작했는데 누군지 가리지 못했다)`,
          },
    ),
  );
}

/** 엔진 사건을 처리할 때 함께 보는 공개 정보 */
export interface PublicView {
  players: readonly number[];
  /** 지금 차례(2마 고르기에서 앞면 카드를 보여 줄 사람) */
  turn: number | null;
  declarer: number | null;
  goal: { kiruda: Kiruda } | null;
}

export interface CoordinatorOptions {
  rules: RuleSet;
  device: FairDevice;
  /** 자리 → 그 자리 카드를 받는 기기(방장 기기는 방장 자리와 컴퓨터 자리) */
  deviceOf: (seat: number) => number;
  /** 섞는 순서(기기 번호) */
  devices: readonly number[];
  onIncident: (incident: Incident) => void;
}

interface PendingPlay {
  seat: number;
  card: Card;
}

export class FairCoordinator {
  readonly rules: RuleSet;
  readonly device: FairDevice;
  private readonly deviceOf: (seat: number) => number;
  private readonly devices: readonly number[];
  private readonly onIncident: (incident: Incident) => void;
  /** 지금 판(=판 번호) */
  deal = 0;
  /** 자리 → 그 카드를 가진 자리 */
  readonly seatOwners = new Map<number, number>();
  private kitty: number[] = [];
  private dead: number[] = [];
  private pool: number[] | null = null;
  private redealPlan: { players: number[]; declarer: number } | null = null;
  /**
   * 판별 다시 나누기 계획. 새로고침 뒤 사건을 한꺼번에 다시 처리하면 앞 판의 다시 섞기 사슬이
   * 다음 판으로 넘어간 뒤에 끝나므로 판별로 기억한다
   */
  private readonly redealPlans = new Map<
    number,
    { players: number[]; declarer: number }
  >();
  /** 낸 카드 중 아직 열쇠로 확인하지 못한 것 */
  private pendingPlays: PendingPlay[] = [];
  /** 열어서 확인한(이미 낸) 자리 */
  readonly playedSlots = new Set<number>();
  private watch: RenegeWatch | null = null;
  private trickIndex = 0;
  private trickSize = 0;
  private leadInfo: { jokerSuit: Suit | null; jokerCalled: boolean } = {
    jokerSuit: null,
    jokerCalled: false,
  };
  /** 마지막 턴 열쇠 공개를 한 판 */
  readonly revealedDeals = new Set<number>();
  /** 판별로 열쇠를 다 모아 연 자리 → 카드 */
  readonly openedDeals = new Map<number, Map<number, Card>>();
  /** 판별 다시 나눈 순서(새 자리 번호, 엔진 덱 순서) */
  readonly redeals = new Map<number, number[]>();
  /** 판별 자리 표 나누기 */
  readonly tokenDeals = new Map<number, ReturnType<typeof tokenDeal>>();
  halted = false;

  constructor(options: CoordinatorOptions) {
    this.rules = options.rules;
    this.device = options.device;
    this.deviceOf = options.deviceOf;
    this.devices = options.devices;
    this.onIncident = options.onIncident;
    this.device.on("slots", (deal, base, count) => {
      this.onSlots(deal, base, count);
      // 새로고침 뒤에는 카드를 미리 알아서 사슬이 끝나도 새로 여는 카드가 없을 수 있다.
      this.updateBusy();
    });
    this.device.on("keys", (deal) => {
      if (deal === this.deal) this.checkPlays();
      this.tryOpenAll(deal);
    });
    this.device.on("cards", () => this.updateBusy());
    this.device.on("problem", (_deal, reason, device, pending) =>
      this.incident({
        seat: device === null ? null : this.seatOfDevice(device),
        reason,
        ...(pending ? { pending: true as const } : {}),
      }),
    );
  }

  private seatOfDevice(device: number): number {
    // 기기 번호는 그 기기 사람의 자리 번호다.
    return device;
  }

  /** 판을 멈추고 알린다. 누군지 확인하는 중인 알림(`pending`)은 뒤따르는 알림으로 바꾼다 */
  incident(incident: Incident): void {
    if (this.halted && !this.pendingIncident) return;
    this.halted = true;
    this.pendingIncident = incident.pending === true;
    this.onIncident(incident);
  }

  private pendingIncident = false;

  /** 엔진 사건을 받는다. `view`는 사건 뒤의 공개 정보 */
  handle(events: readonly GameEvent[], view: PublicView): void {
    if (this.halted) return;
    const redealt = events.some((e) => e.type === "redealtForDead");
    for (const event of events) {
      switch (event.type) {
        case "roundStarted":
          this.startDeal(event.roundNumber);
          if (this.rules.playerCount === 2) this.offerPick(view.turn);
          break;
        case "picked":
          this.onPicked(event.seat, event.index, view.turn);
          break;
        case "kittyTaken":
          if (!redealt) this.giveSlots(this.kitty, event.seat);
          break;
        case "killAttempt":
          if (event.killed !== null) this.dead.push(event.killed);
          break;
        case "redealtForDead":
          this.startRedeal(view);
          break;
        case "played":
          this.onPlayed(event, view);
          break;
        case "trickWon":
          this.trickIndex = event.trickIndex + 1;
          this.trickSize = 0;
          if (this.trickIndex === lastTrickIndex(this.rules))
            this.revealDeal(this.deal);
          break;
      }
    }
  }

  private startDeal(deal: number): void {
    // 앞 판이 끝까지 가지 못했으면(모두 포기·딜미스) 그 판 열쇠도 공개해 검증에 쓴다.
    if (this.deal > 0 && !this.revealedDeals.has(this.deal))
      this.revealDeal(this.deal);
    this.deal = deal;
    this.seatOwners.clear();
    this.dead = [];
    this.pool = null;
    this.redealPlan = null;
    this.pendingPlays = [];
    this.playedSlots.clear();
    this.watch = null;
    this.trickIndex = 0;
    this.trickSize = 0;
    const plan = tokenDeal(this.rules);
    this.tokenDeals.set(deal, plan);
    this.kitty = [];
    this.pick = { count: 0, faceUp: -1, faceDown: -1, seat: -1 };
    const owners = new Map<number, number>();
    // 2마는 26번 고르고 남는 맨 아래 한 장이 바닥 카드다.
    if (this.rules.playerCount === 2) this.kitty = [0];
    plan.owners.forEach((seat, slot) => {
      if (seat < 0) {
        if (this.rules.playerCount !== 2) this.kitty.push(slot);
        return;
      }
      this.seatOwners.set(slot, seat);
      owners.set(slot, this.deviceOf(seat));
    });
    this.device.start(deal, this.devices, deckFor(this.rules));
    this.device.assign(deal, owners);
    this.updateBusy();
  }

  /** 2마: 지금 보여 준 두 장(덱 맨 뒤부터)과 몇 번째 고르기인지 */
  private pick = { count: 0, faceUp: -1, faceDown: -1, seat: -1 };

  /** 2마: 다음 두 장을 내놓고, 앞면 카드는 차례인 사람만 열게 한다 */
  private offerPick(turn: number | null): void {
    const size = this.tokenDeals.get(this.deal)?.size ?? 0;
    const top = size - 1 - this.pick.count * 2;
    if (turn === null || top < 1) return;
    this.pick = { ...this.pick, faceUp: top, faceDown: top - 1, seat: turn };
    this.device.assign(this.deal, new Map([[top, this.deviceOf(turn)]]));
    this.updateBusy();
  }

  private onPicked(seat: number, index: 0 | 1, turn: number | null): void {
    const { faceUp, faceDown } = this.pick;
    const slot = index === 0 ? faceUp : faceDown;
    this.seatOwners.set(slot, seat);
    if (index === 1)
      this.device.assign(this.deal, new Map([[slot, this.deviceOf(seat)]]));
    this.pick.count++;
    if (this.pick.count < 26) this.offerPick(turn);
    else this.pick.seat = -1;
  }

  private busy: BusyReason | null = null;
  private busyListeners = new Set<(busy: BusyReason | null) => void>();
  /** 내 기기가 받을 카드를 아직 다 열지 못했다. 왜 기다리는지(처음 섞기, 다시 섞기, 그 밖) */
  onBusy(listener: (busy: BusyReason | null) => void): () => void {
    this.busyListeners.add(listener);
    listener(this.busy);
    return () => this.busyListeners.delete(listener);
  }

  private updateBusy(): void {
    const me = this.device.id;
    const mine = this.device.myCards(this.deal);
    const initial = this.tokenDeals.get(this.deal)?.owners;
    let reason: BusyReason | null =
      this.redealPlan !== null && !this.redeals.has(this.deal)
        ? "redeal"
        : null;
    // 아직 섞기 사슬이 끝나지 않았다.
    const ledger = this.device.ledger(this.deal);
    if (
      (ledger?.deck.length ?? 0) < (this.tokenDeals.get(this.deal)?.size ?? 0)
    )
      reason ??= "deal";
    // 2마: 내가 볼 앞면 카드를 아직 못 열었다.
    if (
      this.pick.seat >= 0 &&
      this.deviceOf(this.pick.seat) === me &&
      !mine.has(this.pick.faceUp)
    )
      reason ??= "wait";
    for (const [slot, seat] of this.seatOwners) {
      if (this.deviceOf(seat) !== me || mine.has(slot)) continue;
      const dealt =
        (initial?.[slot] ?? -1) >= 0 && slot < (initial?.length ?? 0);
      reason ??= dealt
        ? "deal"
        : this.redeals.get(this.deal)?.includes(slot)
          ? "redeal"
          : "wait";
    }
    if (reason === this.busy) return;
    this.busy = reason;
    for (const l of this.busyListeners) l(reason);
  }

  private giveSlots(slots: readonly number[], seat: number): void {
    const owners = new Map<number, number>();
    for (const slot of slots) {
      this.seatOwners.set(slot, seat);
      owners.set(slot, this.deviceOf(seat));
    }
    this.device.assign(this.deal, owners);
    this.updateBusy();
  }

  /** 다시 섞을 자리: 바닥 카드, 죽은 순서대로 그 사람 자리(엔진의 덱 순서와 같다) */
  poolSlots(): number[] {
    const slots = [...this.kitty];
    for (const seat of this.dead)
      for (const [slot, owner] of this.seatOwners)
        if (owner === seat) slots.push(slot);
    return slots;
  }

  private startRedeal(view: PublicView): void {
    if (view.declarer === null) return;
    this.pool = this.poolSlots();
    this.redealPlan = { players: [...view.players], declarer: view.declarer };
    this.redealPlans.set(this.deal, this.redealPlan);
    for (const slot of this.pool) this.seatOwners.delete(slot);
    this.device.reshuffle(this.deal, this.pool);
    this.updateBusy();
  }

  /** 다시 나누기에 쓸 새 자리 번호(엔진 덱 순서). 방장이 엔진에 넣을 자리 표를 만들 때도 쓴다 */
  newSlotsFor(base: number, count: number): number[] {
    return Array.from({ length: count }, (_, i) => base + i);
  }

  private onSlots(deal: number, base: number, count: number): void {
    const redealPlan = this.redealPlans.get(deal);
    if (base === 0 || !redealPlan) return;
    const slots = this.newSlotsFor(base, count);
    this.redeals.set(deal, slots);
    const plan = redealOwners(redealPlan.players, redealPlan.declarer, slots);
    const owners = new Map<number, number>();
    for (const [slot, seat] of plan) {
      if (deal === this.deal) this.seatOwners.set(slot, seat);
      owners.set(slot, this.deviceOf(seat));
    }
    this.device.assign(deal, owners);
    if (this.revealedDeals.has(deal)) this.device.revealAll(deal);
    this.updateBusy();
  }

  private onPlayed(
    event: Extract<GameEvent, { type: "played" }>,
    view: PublicView,
  ): void {
    if (this.trickSize === 0) {
      this.leadInfo = {
        jokerSuit: event.jokerSuit,
        jokerCalled: event.jokerCall,
      };
    }
    this.trickSize++;
    this.watch ??= new RenegeWatch(this.rules, view.goal?.kiruda ?? "NT");
    const violation = this.watch.reveal(
      this.trickIndex,
      event.seat,
      event.card,
      {
        jokerSuit: this.leadInfo.jokerSuit,
        jokerCalled: this.leadInfo.jokerCalled,
      },
    );
    if (violation && "duplicate" in violation) {
      reportShuffleTamper(this.device, this.deal, violation.reason, (i) =>
        this.incident(i),
      );
      return;
    }
    if (violation) {
      const detail =
        "heldCard" in violation
          ? `${violation.trickIndex + 1}번째 턴에 ${cardText(violation.played)}를 냈는데, 그때 ${cardText(violation.heldCard)}가 손에 있었다: ${violation.reason}`
          : violation.reason;
      this.incident({ seat: violation.seat, reason: detail });
      return;
    }
    this.pendingPlays.push({ seat: event.seat, card: event.card });
    this.checkPlays();
  }

  /** 낸 카드마다 그 사람 자리 중 열쇠가 다 모여 그 카드로 열리는 자리가 있는지 본다 */
  checkPlays(): void {
    if (this.pendingPlays.length === 0) return;
    const waiting: PendingPlay[] = [];
    for (const play of this.pendingPlays) {
      const slot = this.findPlayed(play);
      if (slot === null) waiting.push(play);
      else this.playedSlots.add(slot);
    }
    this.pendingPlays = waiting;
  }

  private findPlayed(play: PendingPlay): number | null {
    for (const [slot, seat] of this.seatOwners) {
      if (seat !== play.seat || this.playedSlots.has(slot)) continue;
      const card = this.device.open(this.deal, slot);
      if (card === play.card) return slot;
    }
    return null;
  }

  /** 아직 열쇠로 확인하지 못한 낸 카드 */
  unconfirmedPlays(): readonly PendingPlay[] {
    return this.pendingPlays;
  }

  /** 이 판 열쇠를 모두 공개한다(마지막 턴 또는 끝나지 못한 판) */
  revealDeal(deal: number): void {
    if (this.revealedDeals.has(deal)) return;
    this.revealedDeals.add(deal);
    // 다시 섞기 사슬이 아직이면(새로고침 뒤 다시 처리할 때) 새 자리까지 생긴 뒤에 공개한다.
    if (this.redealPending(deal)) return;
    this.device.revealAll(deal);
  }

  /** 다시 나누기를 시작했는데 새 자리가 아직 생기지 않았다 */
  private redealPending(deal: number): boolean {
    return this.redealPlans.has(deal) && !this.redeals.has(deal);
  }

  private openListeners = new Set<(deal: number) => void>();
  /** 판의 모든 자리가 열리면 */
  onOpened(listener: (deal: number) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private tryOpenAll(deal: number): void {
    if (
      !this.revealedDeals.has(deal) ||
      this.openedDeals.has(deal) ||
      this.redealPending(deal)
    )
      return;
    const cards = this.device.openAll(deal);
    if (!cards) return;
    const values = this.device
      .liveSlots(deal)
      .map((slot) => cards.get(slot) as Card);
    if (new Set(values).size !== values.length) {
      reportShuffleTamper(
        this.device,
        deal,
        "열어 보니 같은 카드가 두 번 있다",
        (i) => this.incident(i),
      );
      return;
    }
    this.openedDeals.set(deal, cards);
    if (deal === this.deal) this.checkPlays();
    for (const l of this.openListeners) l(deal);
  }
}

/** 판 하나의 실제 패(진짜 카드로 다시 계산할 때). 아직 다 열지 못했으면 null */
export function roundDealOf(
  coordinator: FairCoordinator,
  deal: number,
): RoundDeal | null {
  const cards = coordinator.openedDeals.get(deal);
  const plan = coordinator.tokenDeals.get(deal);
  if (!cards || !plan) return null;
  const real = (c: Card) => {
    const slot = slotOfToken(c);
    return slot === null ? c : (cards.get(slot) as Card);
  };
  const redeal = coordinator.redeals.get(deal);
  return {
    deal: {
      hands: plan.deal.hands.map((h) => h.map(real)),
      kitty: plan.deal.kitty.map(real),
      ...(plan.deal.deck ? { deck: plan.deal.deck.map(real) } : {}),
    },
    ...(redeal ? { redeal: redeal.map((s) => cards.get(s) as Card) } : {}),
    cards,
  };
}
