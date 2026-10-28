import {
  type Action,
  type Card,
  countPoints,
  decisionFromView,
  deckFor,
  type GameEvent,
  type MatchState,
  type PlayerView,
  type RuleSet,
  type StepResult,
  viewOf,
} from "@mighty/engine";

import { checkReplay, type FairLogged, type RoundDeal } from "./audit";
import {
  blindStep,
  cardText,
  isToken,
  revealInHand,
  slotOfToken,
  tokenDeal,
  tokenOf,
} from "./blind";
import { type Clock, realClock } from "./clock";
import {
  FairCoordinator,
  type Incident,
  type PublicView,
  roundDealOf,
} from "./coordinator";
import { FairDevice, type FairWire, type GroupName } from "./device";
import type { FairControl, FairQuery } from "./messages";
import type { PartySnapshot } from "./protocol";

/*
 * 방장 기기 쪽 멘탈 포커 진행. 대국 진행(LocalMatch)에 끼워 쓴다.
 * - step: 자리 표를 든 엔진 상태로 한 걸음(blind.ts)
 * - prepare: 엔진에 넣기 전에 필요한 증명을 모은다(낸 카드 열쇠, 죽이기·프렌드 증명, 딜미스 공개)
 * - viewFor: 방장 기기 자리(방장·컴퓨터)의 화면을 내 기기가 연 카드로 바꾼다
 * - after: 판 흐름에 맞춰 섞기·나눠 주기를 이어 가고, 마지막 턴에 판 전체를 진짜 카드로 다시 계산한다
 */

export interface HostTableHooks {
  /** 엔진 상태를 고친다(자리 표 → 진짜 카드, 프렌드 확인, 다시 계산한 상태로 바꾸기) */
  patch(fn: (state: MatchState) => MatchState): void;
  state(): MatchState;
  /** 지금까지 행동 기록 */
  log(): readonly FairLogged[];
  /** 화면을 다시 보내고 컴퓨터를 깨운다(카드를 연 뒤) */
  refresh(): void;
  /** 모두에게 보낸다 */
  broadcast(message: FairWire | FairControl): void;
  onIncident(incident: Incident): void;
}

export interface HostTableOptions {
  rules: RuleSet;
  seed: number;
  /** 사람 참가자 자리(각자 기기). 나머지 자리는 방장 기기 */
  guestSeats: readonly number[];
  group: GroupName;
  hooks: HostTableHooks;
  /** 참가자 답을 기다리는 시간 */
  answerTimeoutMs?: number;
  /** 제한 시간을 재는 시계. 시험은 ManualClock을 넣는다 */
  clock?: Clock;
  /** 새로고침 전에 남겨 둔 방장 기기 열쇠(`snapshot`) */
  restore?: Record<number, PartySnapshot>;
}

/** 방장 새로고침에 대비해 남기는 것: 걸음별 사건과 방장 기기 열쇠 */
export interface HostTableSaved<Pub = PublicView> {
  history: { events: GameEvent[]; pub: Pub }[];
  device: Record<number, PartySnapshot>;
}

type Prepared = { ok: true; action: Action } | { ok: false; error: string };

export class FairHostTable {
  readonly rules: RuleSet;
  readonly seed: number;
  readonly device: FairDevice;
  readonly coordinator: FairCoordinator;
  private readonly guests: Set<number>;
  private readonly hooks: HostTableHooks;
  /** 걸음마다 나온 사건(진짜 카드로 다시 계산할 때 맞춰 본다) */
  private readonly observed: GameEvent[][] = [];
  /** 마지막 턴 검증이 끝나기 전에는 다음 걸음을 미룬다 */
  private gate: Promise<void> = Promise.resolve();
  private openGate: (() => void) | null = null;
  private readonly answers = new Map<
    string,
    Map<number, { have: boolean; slot?: number }>
  >();
  private answerWaiters = new Set<() => void>();
  private queryId = 0;
  private readonly answerTimeoutMs: number;
  private readonly clock: Clock;
  /** 판 번호 → 실제 패 */
  readonly deals = new Map<number, RoundDeal>();

  constructor(options: HostTableOptions) {
    this.rules = options.rules;
    this.seed = options.seed;
    this.guests = new Set(options.guestSeats);
    this.hooks = options.hooks;
    this.answerTimeoutMs = options.answerTimeoutMs ?? 15_000;
    this.clock = options.clock ?? realClock;
    this.device = new FairDevice({
      id: 0,
      group: options.group,
      send: (m) => this.hooks.broadcast(m),
      clock: this.clock,
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new FairCoordinator({
      rules: this.rules,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: (i) => this.hooks.onIncident(i),
    });
    this.device.on("cards", () => this.hooks.refresh());
    this.device.on("keys", () => this.wakeAnswers());
    this.coordinator.onOpened((deal) => this.onOpened(deal));
  }

  deviceOf(seat: number): number {
    return this.guests.has(seat) ? seat : 0;
  }

  /** 첫 판 패(자리 표) */
  presetDeal() {
    return tokenDeal(this.rules).deal;
  }

  /** 걸음마다의 사건과 공개 정보(첫 항목은 대국을 만들 때). 새로고침한 참가자에게 다시 보낸다 */
  readonly history: { events: GameEvent[]; pub: PublicView }[] = [];

  /** 대국을 만든 직후: 첫 판 사건으로 섞기를 시작한다 */
  begin(events: readonly GameEvent[]): void {
    const pub = this.publicOf(this.hooks.state());
    this.history.push({ events: [...events], pub });
    this.coordinator.handle(events, pub);
  }

  get halted(): boolean {
    return this.coordinator.halted;
  }

  /** 새로고침에 대비해 남길 것 */
  snapshot(): HostTableSaved {
    return { history: [...this.history], device: this.device.snapshotAll() };
  }

  /**
   * 새로고침한 방장: 남긴 걸음별 사건을 처음부터 다시 처리해 자리 주인·카드·검증 상태를 되살린다.
   * 다른 기기 메시지(`receive`)를 먼저 넣고 부른다. 열쇠는 되살린 것을 쓰므로 섞기를 다시 하지 않는다
   */
  resume(saved: HostTableSaved): void {
    for (const [i, item] of saved.history.entries()) {
      this.history.push(item);
      if (i > 0) this.observed.push([...item.events]);
      this.coordinator.handle(item.events, item.pub);
    }
    void this.device.idle().then(() => this.resumeGate());
  }

  /** 마지막 턴 검증을 기다리던 중에 새로고침했으면 다시 기다린다 */
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
      log: [...this.hooks.log()],
    });
    if (this.coordinator.openedDeals.has(deal)) this.onOpened(deal);
  }

  private publicOf(state: MatchState): PublicView {
    return {
      players: [...state.round.players],
      turn: state.round.turn,
      declarer: state.round.declarer,
      goal: state.round.goal,
    };
  }

  /** 방장 기기 자리의 화면. 내가 연 카드로 바꾼다. 아직 못 열었으면 null */
  viewFor(seat: number, view: PlayerView): PlayerView | null {
    if (this.deviceOf(seat) !== 0) return view;
    return revealSeatView(view, this.device.myCards(view.roundNumber));
  }

  /** 엔진 한 걸음(자리 표 상태) */
  step(input: MatchState, seat: number, action: Action): StepResult {
    const state: MatchState = JSON.parse(JSON.stringify(input));
    state.presetDeal ??= tokenDeal(this.rules).deal;
    if (state.round.phase === "kill" && action.type === "kill") {
      const target = state.round.players.find(
        (s) => s !== seat && state.round.hands[s]?.includes(action.card),
      );
      if (target !== undefined && state.round.kill.remaining === 1) {
        const count =
          state.round.deck.length + (state.round.hands[target]?.length ?? 0);
        const base = deckFor(this.rules).length;
        state.presetRedeal = Array.from({ length: count }, (_, i) =>
          tokenOf(base + i),
        );
      }
    }
    const slot = (action as Action & { deckSlot?: number }).deckSlot;
    const result = blindStep(state, seat, action, slot);
    if (result.ok) delete result.state.presetRedeal;
    return result;
  }

  /** 엔진 걸음 뒤 */
  after(state: MatchState, events: readonly GameEvent[]): void {
    this.observed.push([...events]);
    const pub = this.publicOf(state);
    this.history.push({ events: [...events], pub });
    this.coordinator.handle(events, pub);
    // 마지막 턴 열쇠 공개를 시작했으면 검증이 끝날 때까지 다음 걸음을 미룬다.
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
        log: [...this.hooks.log()],
      });
    }
  }

  private onOpened(deal: number): void {
    const real = roundDealOf(this.coordinator, deal);
    if (real) this.deals.set(deal, real);
    if (!this.openGate || !this.deals.has(this.coordinator.deal)) return;
    // 판 전체를 진짜 카드로 다시 계산해 자리 표로 진행한 것과 맞춰 본다.
    const checked = checkReplay(
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
    // 앞 판(모두 포기 등) 패가 아직 다 열리지 않았으면 열릴 때 다시 한다.
    if (checked.upTo < this.hooks.log().length) return;
    const truth = checked.state;
    this.hooks.patch(() => truth);
    const open = this.openGate;
    this.openGate = null;
    open();
    this.hooks.refresh();
  }

  /** 엔진에 넣기 전에 필요한 증명을 모은다 */
  async prepare(
    _input: MatchState,
    seat: number,
    action: Action,
  ): Promise<Prepared> {
    await this.gate;
    if (this.halted) return { ok: false, error: "판을 멈췄다" };
    const state = this.hooks.state();
    switch (action.type) {
      case "play":
        return this.preparePlay(state, seat, action);
      case "dealMiss":
        return this.prepareDealMiss(seat, action);
      case "kill":
        return this.prepareKill(state, seat, action);
      case "exchange": {
        // 방장 기기 자리는 진짜 카드로 고르므로, 엔진에 넣을 때 자리 표로 바꾼다.
        if (this.deviceOf(seat) !== 0) return { ok: true, action };
        const hand = state.round.hands[seat] ?? [];
        const discard: Card[] = [];
        for (const card of action.discard) {
          if (hand.includes(card)) {
            discard.push(card);
            continue;
          }
          const slot = this.mySlotOf(card, seat);
          if (slot === null) return { ok: false, error: "손에 없는 카드다" };
          discard.push(tokenOf(slot));
        }
        return { ok: true, action: { ...action, discard } };
      }
      default:
        return { ok: true, action };
    }
  }

  /** 방장 기기가 연 카드 중 지금 `seat`가 든 자리. 다시 섞어 떠난 자리와 이미 낸 자리는 뺀다 */
  private mySlotOf(card: Card, seat: number): number | null {
    for (const [slot, c] of this.device.myCards(this.coordinator.deal))
      if (
        c === card &&
        this.coordinator.seatOwners.get(slot) === seat &&
        !this.coordinator.playedSlots.has(slot)
      )
        return slot;
    return null;
  }

  private async preparePlay(
    state: MatchState,
    seat: number,
    action: Extract<Action, { type: "play" }>,
  ): Promise<Prepared> {
    const deal = this.coordinator.deal;
    let slot: number | null;
    if (this.deviceOf(seat) === 0) {
      slot = this.mySlotOf(action.card, seat);
      if (slot === null) return { ok: false, error: "손에 없는 카드다" };
      // 다시 계산한 뒤(마지막 턴)에는 손패가 진짜 카드라 자리 표가 없다.
      this.device.reveal(deal, [slot], "play");
    } else {
      slot = (action as { deckSlot?: number }).deckSlot ?? null;
      if (slot === null || this.coordinator.seatOwners.get(slot) !== seat)
        return this.cheat(seat, "자기 자리가 아닌 카드를 내려 했다");
      const opened = await this.waitFor(() =>
        this.device.ledger(deal)?.has(slot as number, seat)
          ? this.device.open(deal, slot as number)
          : undefined,
      );
      if (opened === undefined)
        return { ok: false, error: "카드 열쇠가 오지 않았다" };
      if (opened !== action.card)
        return this.cheat(
          seat,
          `낸다고 한 카드(${cardText(action.card)})와 열쇠로 연 카드(${opened ? cardText(opened) : "카드 아님"})가 다르다`,
        );
    }
    const withSlot = { ...action, deckSlot: slot } as Action;
    await this.checkFriendOnScore(state, seat, withSlot, slot);
    return { ok: true, action: withSlot };
  }

  private cheat(seat: number, reason: string): Prepared {
    this.coordinator.incident({ seat, reason });
    return { ok: false, error: reason };
  }

  /** 이 카드로 턴이 끝나 점수를 딴 사람이 숨은 프렌드인지 확인한다(`revealFriendOnScore`) */
  private async checkFriendOnScore(
    state: MatchState,
    seat: number,
    action: Action,
    slot: number,
  ): Promise<void> {
    const { round } = state;
    const declaration = round.friendDeclaration;
    if (
      !this.rules.revealFriendOnScore ||
      declaration?.kind !== "card" ||
      round.friendRevealed ||
      round.friend !== null
    )
      return;
    const trial = this.step(state, seat, action);
    if (!trial.ok) return;
    const won = trial.events.find((e) => e.type === "trickWon");
    if (won?.type !== "trickWon" || won.points === 0) return;
    if (won.seat === round.declarer) return;
    if (trial.events.some((e) => e.type === "friendRevealed")) return;
    const winner = won.seat;
    const friendSlot = await this.holderSlot(winner, declaration.card, {
      kind: "friend",
      deal: this.coordinator.deal,
      seat: winner,
      slot,
    });
    if (friendSlot === null) return;
    this.hooks.patch((s) => {
      const next: MatchState = JSON.parse(JSON.stringify(s));
      next.round.friend = winner;
      return next;
    });
  }

  private async prepareDealMiss(
    seat: number,
    action: Action,
  ): Promise<Prepared> {
    const deal = this.coordinator.deal;
    const slots = [...this.coordinator.seatOwners]
      .filter(([, owner]) => owner === seat)
      .map(([slot]) => slot);
    if (this.deviceOf(seat) === 0) this.device.reveal(deal, slots, "dealMiss");
    const cards = await this.waitFor(() => {
      const map = new Map<number, Card>();
      for (const slot of slots) {
        const card = this.device.open(deal, slot);
        if (card === null) return undefined;
        map.set(slot, card);
      }
      return map;
    });
    if (!cards) return { ok: false, error: "패를 공개하지 않았다" };
    this.hooks.patch((s) => revealInHand(s, seat, cards));
    return { ok: true, action };
  }

  private async prepareKill(
    state: MatchState,
    seat: number,
    action: Extract<Action, { type: "kill" }>,
  ): Promise<Prepared> {
    const deal = this.coordinator.deal;
    const candidates = state.round.players.filter((s) => s !== seat);
    // 방장 기기 자리부터 본다.
    for (const s of candidates) {
      if (this.deviceOf(s) !== 0) continue;
      const slot = this.mySlotOf(action.card, s);
      if (slot !== null) {
        this.device.reveal(deal, [slot], "proof");
        this.hooks.patch((st) =>
          revealInHand(st, s, new Map([[slot, action.card]])),
        );
        return { ok: true, action };
      }
    }
    const query: FairQuery = { kind: "kill", deal, card: action.card };
    const guestSeats = candidates.filter((s) => this.deviceOf(s) !== 0);
    const found = await this.ask(query, guestSeats, action.card);
    if (found) {
      const { seat: holder, slot } = found;
      this.hooks.patch((st) =>
        revealInHand(st, holder, new Map([[slot, action.card]])),
      );
    }
    return { ok: true, action };
  }

  /** 그 자리가 카드를 가졌으면 그 자리 번호(증명 확인). 방장 기기 자리는 바로 안다 */
  private async holderSlot(
    seat: number,
    card: Card,
    query: FairQuery,
  ): Promise<number | null> {
    if (this.deviceOf(seat) === 0) {
      const slot = this.mySlotOf(card, seat);
      if (slot === null) return null;
      this.device.reveal(this.coordinator.deal, [slot], "proof");
      return slot;
    }
    const found = await this.ask(query, [seat], card);
    return found?.slot ?? null;
  }

  /** 참가자들에게 묻고, "있다"는 답은 공개한 열쇠로 연 카드로 확인한다 */
  private async ask(
    query: FairQuery,
    seats: readonly number[],
    card: Card,
  ): Promise<{ seat: number; slot: number } | null> {
    const id = `${++this.queryId}`;
    this.answers.set(id, new Map());
    this.hooks.broadcast({ t: "fp", k: "query", id, query });
    const deal = this.coordinator.deal;
    const result = await this.waitFor(() => {
      const got = this.answers.get(id) as Map<
        number,
        { have: boolean; slot?: number }
      >;
      for (const s of seats) {
        const answer = got.get(s);
        if (!answer) return undefined;
        if (!answer.have) continue;
        const slot = answer.slot;
        if (slot === undefined || this.coordinator.seatOwners.get(slot) !== s)
          return { problem: s };
        if (!this.device.ledger(deal)?.has(slot, s)) return undefined;
        if (this.device.open(deal, slot) !== card) return { problem: s };
        return { seat: s, slot };
      }
      return null;
    });
    this.answers.delete(id);
    if (result && "problem" in result) {
      this.coordinator.incident({
        seat: result.problem,
        reason: "가졌다고 한 카드가 열쇠로 연 카드와 다르다",
      });
      return null;
    }
    return result ?? null;
  }

  /** 참가자의 답 */
  answer(from: number, id: string, have: boolean, slot?: number): void {
    const got = this.answers.get(id);
    if (!got || got.has(from)) return;
    got.set(from, slot === undefined ? { have } : { have, slot });
    this.wakeAnswers();
  }

  /** 다른 기기 메시지 */
  receive(message: FairWire, from: number): void {
    this.device.receive(message, from);
  }

  private wakeAnswers(): void {
    for (const w of [...this.answerWaiters]) w();
  }

  /** 조건이 값을 돌려줄 때까지 기다린다. 시간이 지나면 undefined */
  private waitFor<T>(probe: () => T | undefined): Promise<T | undefined> {
    return new Promise((resolve) => {
      const tryNow = () => {
        if (this.halted) {
          done(undefined);
          return;
        }
        const value = probe();
        if (value !== undefined) done(value);
      };
      const cancel = this.clock.after(this.answerTimeoutMs, () =>
        done(undefined),
      );
      const done = (value: T | undefined) => {
        cancel();
        this.answerWaiters.delete(tryNow);
        resolve(value);
      };
      this.answerWaiters.add(tryNow);
      tryNow();
    });
  }
}

/**
 * 화면의 자리 표를 내 카드로 바꾸고, 내 패에 따라 달라지는 것(숨은 프렌드인지, 낼 수 있는 카드)을 다시 계산한다.
 * 다 바꾸면 진짜 카드로 진행한 엔진의 화면과 같다. 아직 못 연 자리 표가 있으면 null
 */
export function revealSeatView(
  view: PlayerView,
  cards: ReadonlyMap<number, Card>,
): PlayerView | null {
  const swap = (c: Card): Card | null => {
    const slot = slotOfToken(c);
    if (slot === null) return c;
    return cards.get(slot) ?? null;
  };
  const hand = view.hand.map(swap);
  const discarded = view.discarded?.map(swap) ?? null;
  // 2마: 차례인 사람에게 보여 주는 앞면 카드
  const faceUp = view.pickFaceUp === null ? null : swap(view.pickFaceUp);
  if (
    hand.includes(null) ||
    discarded?.includes(null) ||
    (view.pickFaceUp !== null && faceUp === null)
  )
    return null;
  const real: PlayerView = {
    ...view,
    hand: hand as Card[],
    discarded: discarded as Card[] | null,
    pickFaceUp: faceUp,
  };
  if (real.decision?.kind === "pick" && faceUp !== null)
    real.decision = { ...real.decision, faceUp };
  const declaration = view.friendDeclaration;
  if (
    declaration?.kind === "card" &&
    !view.friendRevealed &&
    real.hand.includes(declaration.card)
  )
    real.friend = view.seat;
  real.decision = decisionFromView(real);
  return real;
}

/** 시험·디버깅용: 엔진 상태에서 바로 한 자리 화면을 만든다 */
export function seatView(
  state: MatchState,
  seat: number,
  cards: ReadonlyMap<number, Card>,
): PlayerView | null {
  return revealSeatView(viewOf(state, seat), cards);
}

export { countPoints };
