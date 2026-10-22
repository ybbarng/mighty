import type { Card } from "@mighty/engine";
import {
  type Action,
  awaitingOpening,
  type GameEvent,
  HAND_SIZE,
  type HeartsRules,
  type MatchState,
  type PassDirection,
  type PlayerView,
  passTarget,
  type StepResult,
  type Trick,
  TWO_OF_CLUBS,
} from "@mighty/hearts-engine";

import { isToken, slotOfToken, tokenOf } from "./blind";
import {
  type BusyReason,
  type Incident,
  reportShuffleTamper,
} from "./coordinator";
import { FairDevice, type FairWire, type GroupName } from "./device";
import {
  checkHeartsReplay,
  HEARTS_DECK,
  type HeartsLogged,
  HeartsRenegeWatch,
  type HeartsRoundDeal,
  heartsBlindStep,
  heartsTokenDeal,
  revealHeartsView,
} from "./hearts";
import type { FairControl } from "./messages";
import type { PartySnapshot } from "./protocol";

declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(timer: unknown): void;

/*
 * 하트 멘탈 포커 진행(마이티의 coordinator·host-table·guest-seat에 해당).
 * 하트는 판마다 섞고 13장씩 나눈 뒤 카드를 넘기고, 마지막 턴에 모두 열쇠를 공개한다.
 * 넘긴 카드는 넘기는 기기가 받는 기기에게만 열쇠를 건넨다. 방장 기기를 거치면 방장이 그 카드를 연다.
 */

/** 사건을 처리할 때 함께 보는 공개 정보 */
export interface HeartsPublic {
  direction: PassDirection;
  /** 이 기기가 맡은 자리들의 넘길 카드(자리 표). 넘기기가 끝나면 열쇠를 건넨다 */
  myPasses: (Card[] | null)[];
}

export class HeartsCoordinator {
  readonly rules: HeartsRules;
  readonly device: FairDevice;
  private readonly deviceOf: (seat: number) => number;
  private readonly devices: readonly number[];
  private readonly onIncident: (incident: Incident) => void;
  deal = 0;
  halted = false;
  readonly playedSlots = new Set<number>();
  readonly revealedDeals = new Set<number>();
  readonly openedDeals = new Map<number, Map<number, Card>>();
  private watch: HeartsRenegeWatch;
  private trick: Trick = { leader: -1, plays: [] };
  private trickIndex = 0;
  private broken = false;
  private pending: { seat: number; card: Card }[] = [];
  /** 이 기기가 넘겨받기를 기다리는 자리 수 */
  private awaitingHandover = 0;

  constructor(options: {
    rules: HeartsRules;
    device: FairDevice;
    deviceOf: (seat: number) => number;
    devices: readonly number[];
    onIncident: (incident: Incident) => void;
  }) {
    this.rules = options.rules;
    this.device = options.device;
    this.deviceOf = options.deviceOf;
    this.devices = options.devices;
    this.onIncident = options.onIncident;
    this.watch = new HeartsRenegeWatch(this.rules);
    this.device.on("cards", () => this.updateBusy());
    this.device.on("slots", () => this.updateBusy());
    this.device.on("keys", (deal) => {
      if (deal === this.deal) this.checkPlays();
      this.tryOpenAll(deal);
    });
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

  private pendingIncident = false;

  handle(events: readonly GameEvent[], pub: HeartsPublic): void {
    if (this.halted) return;
    for (const event of events) {
      switch (event.type) {
        case "roundStarted":
          this.startDeal(event.roundNumber);
          break;
        case "passed":
          this.handOver(pub);
          break;
        case "played":
          this.onPlayed(event.seat, event.card);
          break;
        case "heartsBroken":
          this.broken = true;
          break;
        case "trickWon":
          this.trickIndex = event.trickIndex + 1;
          this.trick = { leader: event.seat, plays: [] };
          if (this.trickIndex === HAND_SIZE - 1) this.revealDeal(this.deal);
          break;
      }
    }
  }

  private startDeal(deal: number): void {
    if (this.deal > 0 && !this.revealedDeals.has(this.deal))
      this.revealDeal(this.deal);
    this.deal = deal;
    this.playedSlots.clear();
    this.pending = [];
    this.watch = new HeartsRenegeWatch(this.rules);
    this.trick = { leader: -1, plays: [] };
    this.trickIndex = 0;
    this.broken = false;
    this.awaitingHandover = 0;
    const owners = new Map<number, number>();
    heartsTokenDeal().owners.forEach((seat, slot) => {
      owners.set(slot, this.deviceOf(seat));
    });
    this.device.start(deal, this.devices, HEARTS_DECK);
    this.device.assign(deal, owners);
    this.updateBusy();
  }

  /** 넘기기가 끝났다: 내 기기 자리가 넘긴 카드 열쇠를 받는 기기에게만 건넨다 */
  private handOver(pub: HeartsPublic): void {
    const me = this.device.id;
    for (const [seat, cards] of pub.myPasses.entries()) {
      if (!cards || this.deviceOf(seat) !== me) continue;
      const to = this.deviceOf(passTarget(seat, pub.direction));
      const slots = cards
        .map((c) => slotOfToken(c))
        .filter((s): s is number => s !== null);
      this.device.handover(this.deal, slots, to);
    }
    // 다른 기기 자리가 내 기기 자리에게 넘긴 카드는 열쇠를 받을 때까지 기다린다.
    this.awaitingHandover = 0;
    for (let seat = 0; seat < 4; seat++) {
      const from = this.deviceOf(seat);
      const to = this.deviceOf(passTarget(seat, pub.direction));
      if (to === me && from !== me) this.awaitingHandover += 1;
    }
    this.updateBusy();
  }

  /** 넘겨받은 카드를 다 열면 부른다(방장·참가자가 화면을 확인해 알린다) */
  handoverDone(): void {
    this.awaitingHandover = 0;
    this.updateBusy();
  }

  private onPlayed(seat: number, card: Card): void {
    const before: Trick = {
      leader: this.trick.leader < 0 ? seat : this.trick.leader,
      plays: this.trick.plays.map((p) => ({ ...p })),
    };
    if (this.trick.leader < 0) this.trick.leader = seat;
    const violation = this.watch.reveal({
      trickIndex: this.trickIndex,
      seat,
      card,
      before,
      broken: this.broken,
    });
    this.trick.plays.push({ seat, card });
    if (violation?.duplicate) {
      reportShuffleTamper(this.device, this.deal, violation.reason, (i) =>
        this.incident(i),
      );
      return;
    }
    if (violation) {
      this.incident(violation);
      return;
    }
    this.pending.push({ seat, card });
    this.checkPlays();
  }

  /** 낸 카드마다 열쇠가 다 모여 그 카드로 열리는 자리를 찾아 "낸 자리"로 적는다 */
  checkPlays(): void {
    const ledger = this.device.ledger(this.deal);
    if (!ledger || this.pending.length === 0) return;
    const devices = this.device.devicesOf(this.deal);
    const waiting: { seat: number; card: Card }[] = [];
    for (const play of this.pending) {
      let found: number | null = null;
      for (let slot = 0; slot < ledger.deck.length && found === null; slot++) {
        if (this.playedSlots.has(slot)) continue;
        const keys = ledger.keys.get(slot);
        if (!keys || devices.some((d) => !keys.has(d))) continue;
        if (this.device.open(this.deal, slot) === play.card) found = slot;
      }
      if (found === null) waiting.push(play);
      else this.playedSlots.add(found);
    }
    this.pending = waiting;
  }

  revealDeal(deal: number): void {
    if (this.revealedDeals.has(deal)) return;
    this.revealedDeals.add(deal);
    this.device.revealAll(deal);
  }

  private openListeners = new Set<(deal: number) => void>();
  onOpened(listener: (deal: number) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private tryOpenAll(deal: number): void {
    if (!this.revealedDeals.has(deal) || this.openedDeals.has(deal)) return;
    const cards = this.device.openAll(deal);
    if (!cards) return;
    if (new Set(cards.values()).size !== cards.size) {
      reportShuffleTamper(
        this.device,
        deal,
        "열어 보니 같은 카드가 두 번 있다",
        (i) => this.incident(i),
      );
      return;
    }
    this.openedDeals.set(deal, cards);
    for (const l of this.openListeners) l(deal);
  }

  private busy: BusyReason | null = null;
  private busyListeners = new Set<(busy: BusyReason | null) => void>();
  onBusy(listener: (busy: BusyReason | null) => void): () => void {
    this.busyListeners.add(listener);
    listener(this.busy);
    return () => this.busyListeners.delete(listener);
  }

  private updateBusy(): void {
    const me = this.device.id;
    const ledger = this.device.ledger(this.deal);
    let reason: BusyReason | null = null;
    if ((ledger?.deck.length ?? 0) < HEARTS_DECK.length) reason = "deal";
    else {
      const mine = this.device.myCards(this.deal);
      const expected = heartsTokenDeal().owners.filter(
        (seat) => this.deviceOf(seat) === me,
      ).length;
      if (mine.size < expected && this.trickIndex === 0) reason = "deal";
      else if (this.awaitingHandover > 0) reason = "wait";
    }
    if (reason === this.busy) return;
    this.busy = reason;
    for (const l of this.busyListeners) l(reason);
  }

  /** 판 하나의 실제 패 */
  roundDeal(deal: number): HeartsRoundDeal | null {
    const cards = this.openedDeals.get(deal);
    if (!cards) return null;
    const hands = heartsTokenDeal().hands.map((h) =>
      h.map((t) => cards.get(slotOfToken(t) as number) as Card),
    );
    return { hands, cards };
  }
}

/** 기기의 자리 표 손패 중 이 카드를 든 자리(넘겨받은 것 포함) */
function slotInHand(
  hand: readonly Card[],
  cards: ReadonlyMap<number, Card>,
  card: Card,
): number | null {
  for (const token of hand) {
    const slot = slotOfToken(token);
    if (slot !== null && cards.get(slot) === card) return slot;
  }
  return null;
}

type Prepared = { ok: true; action: Action } | { ok: false; error: string };

export interface HeartsHostHooks {
  patch(fn: (state: MatchState) => MatchState): void;
  state(): MatchState;
  log(): readonly HeartsLogged[];
  refresh(): void;
  broadcast(message: FairWire | FairControl): void;
  /** 한 기기에게만(넘긴 카드 열쇠) */
  sendTo(message: FairWire, device: number): void;
  onIncident(incident: Incident): void;
}

/** 방장 기기 쪽 하트 멘탈 포커 진행 */
export class HeartsHostTable {
  readonly rules: HeartsRules;
  readonly seed: number;
  readonly device: FairDevice;
  readonly coordinator: HeartsCoordinator;
  private readonly guests: Set<number>;
  private readonly hooks: HeartsHostHooks;
  private readonly observed: GameEvent[][] = [];
  readonly history: { events: GameEvent[]; pub: HeartsPublic }[] = [];
  readonly deals = new Map<number, HeartsRoundDeal>();
  private gate: Promise<void> = Promise.resolve();
  private openGate: (() => void) | null = null;
  private waiters = new Set<() => void>();

  constructor(options: {
    rules: HeartsRules;
    seed: number;
    guestSeats: readonly number[];
    group: GroupName;
    hooks: HeartsHostHooks;
    /** 새로고침 전에 남겨 둔 방장 기기 열쇠 */
    restore?: Record<number, PartySnapshot>;
  }) {
    this.rules = options.rules;
    this.seed = options.seed;
    this.guests = new Set(options.guestSeats);
    this.hooks = options.hooks;
    this.device = new FairDevice({
      id: 0,
      group: options.group,
      send: (m) => this.hooks.broadcast(m),
      sendTo: (m, device) => this.hooks.sendTo(m, device),
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new HeartsCoordinator({
      rules: this.rules,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: (i) => this.hooks.onIncident(i),
    });
    this.device.on("cards", () => {
      this.checkHandover();
      this.hooks.refresh();
    });
    this.device.on("keys", () => this.wake());
    this.coordinator.onOpened((deal) => this.onOpened(deal));
  }

  deviceOf(seat: number): number {
    return this.guests.has(seat) ? seat : 0;
  }

  get halted(): boolean {
    return this.coordinator.halted;
  }

  presetHands(): Card[][] {
    return heartsTokenDeal().hands;
  }

  private publicOf(state: MatchState): HeartsPublic {
    return {
      direction: state.round.direction,
      myPasses: state.round.passes.map((p, seat) =>
        this.deviceOf(seat) === 0 && p ? [...p] : null,
      ),
    };
  }

  begin(events: readonly GameEvent[]): void {
    const pub = this.publicOf(this.hooks.state());
    this.record(events, pub);
    this.coordinator.handle(events, pub);
  }

  /** 걸음별 사건. 참가자에게 보내는 것에는 방장 기기 자리가 넘긴 카드를 뺀다 */
  private record(events: readonly GameEvent[], pub: HeartsPublic): void {
    this.history.push({ events: [...events], pub: { ...pub, myPasses: [] } });
    this.ownPubs.push(pub);
  }

  /** 방장 기기만 아는 공개 정보(넘긴 카드 포함). 새로고침 뒤 다시 처리할 때 쓴다 */
  private readonly ownPubs: HeartsPublic[] = [];

  /** 새로고침에 대비해 남길 것(이 기기 안에만 남으므로 넘긴 카드도 넣는다) */
  snapshot(): {
    history: { events: GameEvent[]; pub: HeartsPublic }[];
    device: Record<number, PartySnapshot>;
  } {
    return {
      history: this.history.map((h, i) => ({
        events: h.events,
        pub: this.ownPubs[i] ?? h.pub,
      })),
      device: this.device.snapshotAll(),
    };
  }

  /** 새로고침한 방장: 남긴 걸음별 사건을 다시 처리해 되살린다(`FairHostTable.resume`과 같다) */
  resume(saved: ReturnType<HeartsHostTable["snapshot"]>): void {
    for (const [i, item] of saved.history.entries()) {
      this.record(item.events, item.pub);
      if (i > 0) this.observed.push([...item.events]);
      this.coordinator.handle(item.events, item.pub);
    }
    void this.device.idle().then(() => this.resumeGate());
  }

  private resumeGate(): void {
    const state = this.hooks.state();
    const deal = this.coordinator.deal;
    if (
      this.openGate ||
      state.round.phase !== "play" ||
      !this.coordinator.revealedDeals.has(deal) ||
      !state.round.hands.some((h) => h.some(isToken))
    )
      return;
    this.gate = new Promise((resolve) => {
      this.openGate = resolve;
    });
    this.hooks.broadcast({
      t: "fp",
      k: "log",
      deal,
      log: [...this.hooks.log()] as never,
    });
    if (this.coordinator.openedDeals.has(deal)) this.onOpened(deal);
  }

  /** 방장 기기 자리 화면을 내 카드로 바꾼다 */
  viewFor(seat: number, view: PlayerView): PlayerView | null {
    if (this.deviceOf(seat) !== 0) return view;
    return revealHeartsView(view, this.device.myCards(view.roundNumber));
  }

  /**
   * 행동할 자리. 첫 선(♣2)은 엔진이 누구인지 모르므로 방장 기기 자리 중 ♣2를 연 자리를 알려 준다
   * (참가자가 가졌으면 그 기기가 낸다)
   */
  pendingSeats(
    state: MatchState,
    engine: (s: MatchState) => number[],
  ): number[] {
    if (!awaitingOpening(state.round)) return engine(state);
    const cards = this.device.myCards(state.roundNumber);
    for (let seat = 0; seat < 4; seat++) {
      if (this.deviceOf(seat) !== 0) continue;
      if (
        slotInHand(state.round.hands[seat] ?? [], cards, TWO_OF_CLUBS) !== null
      )
        return [seat];
    }
    return [];
  }

  step(input: MatchState, seat: number, action: Action): StepResult {
    const state: MatchState = JSON.parse(JSON.stringify(input));
    state.presetHands = heartsTokenDeal().hands;
    const slot = (action as Action & { deckSlot?: number }).deckSlot;
    // 첫 선: ♣2를 낸 자리를 엔진이 알도록 그 자리 표를 ♣2로 바꿔 둔다.
    if (
      awaitingOpening(state.round) &&
      action.type === "play" &&
      slot !== undefined
    ) {
      const hand = state.round.hands[seat] ?? [];
      state.round.hands[seat] = hand.map((c) =>
        c === tokenOf(slot) ? action.card : c,
      );
    }
    const result = heartsBlindStep(state, seat, action, slot);
    if (result.ok) delete result.state.presetHands;
    return result;
  }

  after(state: MatchState, events: readonly GameEvent[]): void {
    this.observed.push([...events]);
    const pub = this.publicOf(state);
    this.record(events, pub);
    this.coordinator.handle(events, pub);
    const deal = this.coordinator.deal;
    if (
      this.coordinator.revealedDeals.has(deal) &&
      !this.coordinator.openedDeals.has(deal) &&
      state.round.phase === "play" &&
      !this.openGate
    ) {
      this.gate = new Promise((resolve) => {
        this.openGate = resolve;
      });
      this.hooks.broadcast({
        t: "fp",
        k: "log",
        deal,
        log: [...this.hooks.log()] as never,
      });
    }
    this.checkHandover();
  }

  /** 방장 기기 자리가 넘겨받은 카드를 다 열었으면 기다림을 푼다 */
  private checkHandover(): void {
    const state = this.hooks.state();
    if (state.round.phase !== "play") return;
    const cards = this.device.myCards(state.roundNumber);
    const all = [0, 1, 2, 3]
      .filter((s) => this.deviceOf(s) === 0)
      .every((s) =>
        (state.round.hands[s] ?? []).every((c) => {
          const slot = slotOfToken(c);
          return slot === null || cards.has(slot);
        }),
      );
    if (all) this.coordinator.handoverDone();
  }

  private onOpened(deal: number): void {
    const real = this.coordinator.roundDeal(deal);
    if (real) this.deals.set(deal, real);
    if (!this.openGate || !this.deals.has(this.coordinator.deal)) return;
    const checked = checkHeartsReplay(
      this.rules,
      this.seed,
      this.hooks.log(),
      this.deals,
      this.observed,
    );
    if (!checked.ok) {
      this.coordinator.incident({ seat: checked.seat, reason: checked.reason });
      return;
    }
    if (checked.upTo < this.hooks.log().length) return;
    const truth = checked.state;
    this.hooks.patch(() => truth);
    const open = this.openGate;
    this.openGate = null;
    open();
    this.hooks.refresh();
  }

  async prepare(
    _input: MatchState,
    seat: number,
    action: Action,
  ): Promise<Prepared> {
    await this.gate;
    if (this.halted) return { ok: false, error: "판을 멈췄다" };
    const state = this.hooks.state();
    const hand = state.round.hands[seat] ?? [];
    const deal = this.coordinator.deal;
    const cards = this.device.myCards(deal);
    if (action.type === "pass") {
      if (this.deviceOf(seat) !== 0) return { ok: true, action };
      const tokens: Card[] = [];
      for (const card of action.cards) {
        if (hand.includes(card)) {
          tokens.push(card);
          continue;
        }
        const slot = slotInHand(hand, cards, card);
        if (slot === null) return { ok: false, error: "손에 없는 카드다" };
        tokens.push(tokenOf(slot));
      }
      return { ok: true, action: { ...action, cards: tokens } };
    }
    if (action.type !== "play") return { ok: true, action };
    if (this.deviceOf(seat) === 0) {
      if (hand.includes(action.card)) return { ok: true, action };
      const slot = slotInHand(hand, cards, action.card);
      if (slot === null) return { ok: false, error: "손에 없는 카드다" };
      this.device.reveal(deal, [slot], "play");
      return { ok: true, action: { ...action, deckSlot: slot } as Action };
    }
    const slot = (action as { deckSlot?: number }).deckSlot ?? null;
    if (slot === null || !hand.includes(tokenOf(slot))) {
      if (hand.includes(action.card)) return { ok: true, action };
      this.coordinator.incident({
        seat,
        reason: "자기 손에 없는 자리의 카드를 내려 했다",
      });
      return { ok: false, error: "자기 손에 없는 자리의 카드다" };
    }
    const opened = await this.waitFor(
      () => this.device.open(deal, slot) ?? undefined,
    );
    if (opened === undefined)
      return { ok: false, error: "카드 열쇠가 오지 않았다" };
    if (opened !== action.card) {
      const reason = `낸다고 한 카드와 열쇠로 연 카드가 다르다`;
      this.coordinator.incident({ seat, reason });
      return { ok: false, error: reason };
    }
    return { ok: true, action };
  }

  receive(message: FairWire, from: number): void {
    this.device.receive(message, from);
  }

  private wake(): void {
    for (const w of [...this.waiters]) w();
  }

  private waitFor<T>(
    probe: () => T | undefined,
    ms = 15_000,
  ): Promise<T | undefined> {
    return new Promise((resolve) => {
      const tryNow = () => {
        if (this.halted) return done(undefined);
        const value = probe();
        if (value !== undefined) done(value);
      };
      const timer = setTimeout(() => done(undefined), ms);
      const done = (value: T | undefined) => {
        clearTimeout(timer);
        this.waiters.delete(tryNow);
        resolve(value);
      };
      this.waiters.add(tryNow);
      tryNow();
    });
  }
}

/** 참가자 기기 쪽 하트 멘탈 포커 진행 */
export class HeartsGuestSeat {
  readonly seat: number;
  readonly rules: HeartsRules;
  readonly device: FairDevice;
  readonly coordinator: HeartsCoordinator;
  readonly deals = new Map<number, HeartsRoundDeal>();
  private readonly guests: Set<number>;
  private readonly queue: { view: PlayerView; events: GameEvent[] }[] = [];
  private last: PlayerView | null = null;
  private readonly logs = new Map<number, HeartsLogged[]>();
  private steps = 0;
  private readonly verified = new Set<number>();

  constructor(
    private readonly options: {
      rules: HeartsRules;
      seat: number;
      guestSeats: readonly number[];
      group: GroupName;
      broadcast: (message: FairWire | FairControl) => void;
      sendTo: (message: FairWire, device: number) => void;
      onIncident: (incident: Incident) => void;
      onSnapshot: (view: PlayerView, events: GameEvent[]) => void;
      onVerify: (deal: number, log: HeartsLogged[]) => void;
      restore?: Record<number, PartySnapshot>;
    },
  ) {
    this.seat = options.seat;
    this.rules = options.rules;
    this.guests = new Set(options.guestSeats);
    this.device = new FairDevice({
      id: options.seat,
      group: options.group,
      send: (m) => options.broadcast(m),
      sendTo: (m, device) => options.sendTo(m, device),
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new HeartsCoordinator({
      rules: options.rules,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: options.onIncident,
    });
    this.device.on("cards", () => this.flush());
    this.coordinator.onOpened((deal) => {
      const real = this.coordinator.roundDeal(deal);
      if (real) this.deals.set(deal, real);
      this.tryVerify(deal);
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

  private publicOf(view: PlayerView): HeartsPublic {
    return {
      direction: view.direction,
      myPasses: [0, 1, 2, 3].map((s) => (s === this.seat ? view.myPass : null)),
    };
  }

  history(items: readonly { events: GameEvent[]; pub: HeartsPublic }[]): void {
    for (let i = this.steps; i < items.length; i++) {
      const item = items[i] as { events: GameEvent[]; pub: HeartsPublic };
      // 방장 기록에는 내 넘길 카드가 없으므로, 내가 넘긴 카드는 남겨 둔 화면에서 찾는다.
      this.coordinator.handle(item.events, {
        direction: item.pub.direction,
        myPasses: this.last ? this.publicOf(this.last).myPasses : [],
      });
    }
    this.steps = Math.max(this.steps, items.length);
  }

  snapshot(view: PlayerView, events: GameEvent[], resync = false): void {
    this.last = view;
    if (!resync) {
      this.steps++;
      this.coordinator.handle(events, this.publicOf(view));
    }
    this.queue.push({ view, events: resync ? [] : events });
    this.flush();
  }

  private flush(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0] as { view: PlayerView; events: GameEvent[] };
      const real = revealHeartsView(
        next.view,
        this.device.myCards(next.view.roundNumber),
      );
      if (!real) return;
      this.queue.shift();
      if (real.phase === "play") this.coordinator.handoverDone();
      this.options.onSnapshot(real, next.events);
    }
  }

  outgoing(action: Action): Action | null {
    if (this.waiting) return null;
    const hand = this.last?.hand ?? [];
    const cards = this.device.myCards(this.coordinator.deal);
    if (action.type === "pass") {
      const tokens: Card[] = [];
      for (const card of action.cards) {
        const slot = slotInHand(hand, cards, card);
        if (slot === null) return null;
        tokens.push(tokenOf(slot));
      }
      return { ...action, cards: tokens };
    }
    if (action.type === "play") {
      if (hand.includes(action.card)) return action;
      const slot = slotInHand(hand, cards, action.card);
      if (slot === null) return null;
      this.device.reveal(this.coordinator.deal, [slot], "play");
      return { ...action, deckSlot: slot } as Action;
    }
    return action;
  }

  receive(message: FairWire | FairControl, from: number): void {
    // 판을 멈추면 게임을 진행시키는 메시지(판 기록·물음)만 받지 않는다. 섞은 덱·열쇠·증명은 끝까지 받는다
    // (누가 조작했는지 확인하는 데 쓴다).
    if (this.halted && (message.k === "log" || message.k === "query")) return;
    switch (message.k) {
      case "chain":
      case "keys":
      case "handover":
      case "sproof":
      case "cproof":
        this.device.receive(message, from);
        break;
      case "log":
        if (from === 0) {
          this.logs.set(message.deal, message.log as unknown as HeartsLogged[]);
          this.tryVerify(message.deal);
        }
        break;
    }
  }

  private tryVerify(deal: number): void {
    const log = this.logs.get(deal);
    if (!log || !this.deals.has(deal) || this.verified.has(deal)) return;
    this.verified.add(deal);
    this.options.onVerify(deal, log);
  }
}
