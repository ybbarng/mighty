import {
  type Action,
  type Card,
  countPoints,
  type GameEvent,
  type PlayerView,
  type RuleSet,
  trickWinnerIndex,
} from "@mighty/engine";

import type { FairLogged, RoundDeal } from "./audit";
import { cardText, tokenOf } from "./blind";
import {
  FairCoordinator,
  type Incident,
  type PublicView,
  roundDealOf,
} from "./coordinator";
import { FairDevice, type FairWire, type GroupName } from "./device";
import { revealSeatView } from "./host-table";
import type { FairControl, FairQuery } from "./messages";
import type { PartySnapshot } from "./protocol";

/*
 * 참가자 기기 쪽 멘탈 포커 진행.
 * - 방장이 보낸 화면(자리 표)을 내가 연 카드로 바꿔 보여 준다. 아직 못 열었으면 열 때까지 기다린다.
 * - 내 행동을 방장에게 보내기 전에 필요한 열쇠를 공개한다(낼 카드, 딜미스 패 전부).
 * - 방장의 물음(죽이기·프렌드)에 답한다. 물음이 진짜 판 흐름에 맞는지 확인한다(방장이 남의 카드를 떠보지 못하게).
 * - 마지막 턴에 모든 카드가 열리면 행동 기록을 받아 판 전체를 직접 다시 계산한다(검증은 부르는 쪽).
 */

declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(timer: unknown): void;

export interface GuestSeatOptions {
  rules: RuleSet;
  seat: number;
  /** 사람 참가자 자리(각자 기기) */
  guestSeats: readonly number[];
  group: GroupName;
  broadcast: (message: FairWire | FairControl) => void;
  onIncident: (incident: Incident) => void;
  /** 화면을 내 카드로 바꿔 넘긴다 */
  onSnapshot: (view: PlayerView, events: GameEvent[]) => void;
  /** 판의 모든 카드가 열리고 기록이 왔다: 다시 계산해 검증할 때 */
  onVerify: (deal: number, log: FairLogged[]) => void;
  /** 새로고침 전에 남겨 둔 열쇠 */
  restore?: Record<number, PartySnapshot>;
}

export class FairGuestSeat {
  readonly seat: number;
  readonly rules: RuleSet;
  readonly device: FairDevice;
  readonly coordinator: FairCoordinator;
  private readonly guests: Set<number>;
  private readonly options: GuestSeatOptions;
  private readonly queue: { view: PlayerView; events: GameEvent[] }[] = [];
  /** 마지막으로 받은 방장 화면(자리 표 그대로) */
  private last: PlayerView | null = null;
  /** 답한 죽이기 물음: 다음 화면에 그 카드로 죽이기를 했어야 한다 */
  private expectKill: Card | null = null;
  private readonly logs = new Map<number, FairLogged[]>();
  readonly deals = new Map<number, RoundDeal>();

  constructor(options: GuestSeatOptions) {
    this.options = options;
    this.seat = options.seat;
    this.rules = options.rules;
    this.guests = new Set(options.guestSeats);
    this.device = new FairDevice({
      id: options.seat,
      group: options.group,
      send: (m) => options.broadcast(m),
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.coordinator = new FairCoordinator({
      rules: options.rules,
      device: this.device,
      deviceOf: (seat) => this.deviceOf(seat),
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      onIncident: options.onIncident,
    });
    this.device.on("cards", () => this.flush());
    this.coordinator.onOpened((deal) => {
      const real = roundDealOf(this.coordinator, deal);
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

  /** 방장 진행 중 사건을 처리한 걸음 수(첫 화면 포함) */
  private steps = 0;

  /**
   * 다시 연결했을 때 방장이 보낸 걸음별 사건. 아직 처리하지 않은 걸음부터 이어서 처리한다
   * (새로고침했으면 처음부터 다시 처리해 자리 주인과 카드를 되살린다)
   */
  history(items: readonly { events: GameEvent[]; pub: PublicView }[]): void {
    for (let i = this.steps; i < items.length; i++) {
      const item = items[i] as { events: GameEvent[]; pub: PublicView };
      this.coordinator.handle(item.events, item.pub);
    }
    this.steps = Math.max(this.steps, items.length);
  }

  /** 방장 화면. `resync`면 다시 연결할 때 보낸 지금 화면(사건 없음) */
  snapshot(view: PlayerView, events: GameEvent[], resync = false): void {
    if (resync) {
      this.last = view;
      this.queue.push({ view, events: [] });
      this.flush();
      return;
    }
    this.steps++;
    if (this.expectKill !== null) {
      const card = this.expectKill;
      this.expectKill = null;
      if (!events.some((e) => e.type === "killAttempt" && e.card === card))
        this.coordinator.incident({
          seat: 0,
          reason: `방장이 죽이기 없이 ${cardText(card)}의 주인을 물었다(남의 카드 떠보기)`,
        });
    }
    this.last = view;
    this.coordinator.handle(events, view);
    this.queue.push({ view, events });
    this.flush();
  }

  /** 열 수 있는 화면부터 차례대로 넘긴다 */
  private flush(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0] as { view: PlayerView; events: GameEvent[] };
      const real = revealSeatView(
        next.view,
        this.device.myCards(next.view.roundNumber),
      );
      if (!real) return;
      this.queue.shift();
      this.options.onSnapshot(real, next.events);
    }
  }

  /** 내가 연 카드 중 지금 내 손에 있는 자리. 다시 섞어 떠난 자리와 이미 낸 자리는 뺀다 */
  private mySlotOf(card: Card): number | null {
    for (const [slot, c] of this.device.myCards(this.coordinator.deal))
      if (
        c === card &&
        this.coordinator.seatOwners.get(slot) === this.seat &&
        !this.coordinator.playedSlots.has(slot)
      )
        return slot;
    return null;
  }

  private mySlots(): number[] {
    return [...this.coordinator.seatOwners]
      .filter(([, seat]) => seat === this.seat)
      .map(([slot]) => slot);
  }

  /** 아직 카드를 열지 못해 보여 주지 못한 화면이 있다(섞고 나누는 중) */
  get waiting(): boolean {
    return this.queue.length > 0;
  }

  /** 방장에게 보낼 행동으로 바꾸고, 필요한 열쇠를 공개한다. 낼 수 없으면 null */
  outgoing(action: Action): Action | null {
    if (this.waiting) return null;
    const deal = this.coordinator.deal;
    switch (action.type) {
      case "play": {
        const slot = this.mySlotOf(action.card);
        if (slot === null) return null;
        this.device.reveal(deal, [slot], "play");
        return { ...action, deckSlot: slot } as Action;
      }
      case "dealMiss":
        this.device.reveal(deal, this.mySlots(), "dealMiss");
        return action;
      case "exchange": {
        const discard: Card[] = [];
        for (const card of action.discard) {
          const slot = this.mySlotOf(card);
          if (slot === null) return null;
          discard.push(tokenOf(slot));
        }
        return { ...action, discard };
      }
      default:
        return action;
    }
  }

  /** 다른 기기의 멘탈 포커 메시지. `from`은 연결 아이디로 확인한 자리 */
  receive(message: FairWire | FairControl, from: number): void {
    if (this.halted) return;
    switch (message.k) {
      case "chain":
      case "keys":
      case "sproof":
      case "cproof":
        this.device.receive(message, from);
        break;
      case "query":
        if (from === 0) this.onQuery(message.id, message.query);
        break;
      case "log":
        if (from === 0) {
          this.logs.set(message.deal, message.log);
          this.tryVerify(message.deal);
        }
        break;
      case "answer":
        break;
    }
  }

  private answer(id: string, have: boolean, slot?: number): void {
    this.options.broadcast({
      t: "fp",
      k: "answer",
      id,
      from: this.seat,
      have,
      ...(slot === undefined ? {} : { slot }),
    });
  }

  private onQuery(id: string, query: FairQuery): void {
    const view = this.last;
    if (!view || query.deal !== this.coordinator.deal) return;
    if (query.kind === "kill") {
      // 죽이기 차례에만, 주공이 아닌 사람으로서 답한다.
      if (view.phase !== "kill" || view.declarer === this.seat) {
        this.answer(id, false);
        return;
      }
      this.expectKill = query.card;
      const slot = this.mySlotOf(query.card);
      if (slot === null) {
        this.answer(id, false);
        return;
      }
      this.device.reveal(query.deal, [slot], "proof");
      this.answer(id, true, slot);
      return;
    }
    if (query.seat !== this.seat) return;
    // 방금 낸 카드의 열쇠가 아직 안 왔으면 올 때까지 기다린다.
    void this.whenOpen(query.slot).then(() =>
      this.answerFriend(id, query, view),
    );
  }

  private whenOpen(slot: number): Promise<void> {
    return new Promise((resolve) => {
      const deal = this.coordinator.deal;
      if (this.device.open(deal, slot) !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        off();
        resolve();
      }, 10_000);
      const off = this.device.on("keys", () => {
        if (this.device.open(deal, slot) === null) return;
        clearTimeout(timer);
        off();
        resolve();
      });
    });
  }

  private answerFriend(
    id: string,
    query: Extract<FairQuery, { kind: "friend" }>,
    view: PlayerView,
  ): void {
    // 프렌드: 내가 정말 방금 점수를 딴 사람인지 판에서 직접 확인한다.
    if (!this.wonPointTrick(view, query.slot)) {
      this.answer(id, false);
      return;
    }
    const declaration = view.friendDeclaration;
    const slot =
      declaration?.kind === "card" ? this.mySlotOf(declaration.card) : null;
    if (slot === null) {
      this.answer(id, false);
      return;
    }
    this.device.reveal(query.deal, [slot], "proof");
    this.answer(id, true, slot);
  }

  /** 지금 턴에 `slot`의 카드(방금 낸 것)를 더하면 내가 이기고 점수가 있나 */
  private wonPointTrick(view: PlayerView, slot: number): boolean {
    const trick = view.trick;
    if (!trick || view.turn === null) return false;
    const card = this.device.open(this.coordinator.deal, slot);
    if (card === null) return false;
    const plays = [...trick.plays, { seat: view.turn, card }];
    if (plays.length !== view.players.length) return false;
    const winner = trickWinnerIndex(
      {
        rules: view.rules,
        kiruda: view.goal?.kiruda ?? "NT",
        trickIndex: view.trickIndex,
      },
      {
        cards: plays.map((p) => p.card),
        jokerSuit: trick.jokerSuit,
        jokerCalled: trick.jokerCalled,
      },
    );
    return (
      plays[winner]?.seat === this.seat &&
      countPoints(plays.map((p) => p.card)) > 0
    );
  }

  private verified = new Set<number>();
  private tryVerify(deal: number): void {
    const log = this.logs.get(deal);
    if (!log || !this.deals.has(deal) || this.verified.has(deal)) return;
    this.verified.add(deal);
    this.options.onVerify(deal, log);
  }
}
