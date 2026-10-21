import { type Card, fullDeck } from "@mighty/engine";

import {
  combine,
  encodeIndex,
  modPow,
  newKey,
  randomBelow,
  type SraGroup,
  unlockExponent,
} from "./sra";

/*
 * 멘탈 포커 절차(docs/13-mental-poker.md). 사람마다 Party 하나, 나머지는 모두가 보는 공개 정보다.
 *
 * 1. 섞기: 각자 차례로 덱 전체를 자기 전체 열쇠로 잠그고 섞어 다음 사람에게 넘긴다.
 * 2. 자리마다 다시 잠그기: 각자 전체 열쇠를 풀고 자리마다 다른 열쇠로 잠근다(지수 하나로 한 번에).
 *    한 자리의 열쇠를 공개해도 다른 자리 카드는 드러나지 않는다.
 * 3. 나눠 주기: 자리 s를 j에게 줄 때 j를 뺀 모두가 s의 열쇠를 공개한다. j만 마지막 잠금을 풀어 본다.
 * 4. 내기: 낸 사람이 그 자리의 열쇠를 공개하면 모두가 그 카드를 본다. 자기 자리가 아니면 열쇠가 없다.
 * 5. 판 끝: 모두 남은 열쇠를 공개해 모든 자리를 열고, 53장이 빠짐없이 한 번씩 있는지 확인한다(섞기 조작).
 */

/** 카드 번호(0~52) ↔ 카드. 마이티 덱 순서 */
export const DECK: readonly Card[] = fullDeck();

/** 열쇠를 공개하는 까닭. 정해진 때가 아니면 자기 자리 열쇠를 내주지 않는다 */
export type RevealReason = "deal" | "play" | "kitty" | "audit";

export interface PartySnapshot {
  seat: number;
  global: string;
  slotKeys: string[];
  mySlots: number[];
}

/** 한 사람의 기기. 비밀 열쇠는 여기에만 있다 */
export class Party {
  readonly seat: number;
  private readonly g: SraGroup;
  private globalKey: bigint;
  private slotKeys: bigint[];
  /** 나에게 온 자리(내 손패) */
  readonly mySlots = new Set<number>();
  /** 내가 연 카드 */
  readonly hand = new Map<number, Card>();

  constructor(seat: number, g: SraGroup, size: number) {
    this.seat = seat;
    this.g = g;
    this.globalKey = newKey(g);
    this.slotKeys = Array.from({ length: size }, () => newKey(g));
  }

  /** 1단계: 전체 열쇠로 잠그고 섞는다 */
  shuffleStep(deck: readonly bigint[]): bigint[] {
    const locked = deck.map((c) => modPow(c, this.globalKey, this.g.p));
    for (let i = locked.length - 1; i > 0; i--) {
      const j = Number(randomBelow(BigInt(i + 1)));
      [locked[i], locked[j]] = [locked[j] as bigint, locked[i] as bigint];
    }
    return locked;
  }

  /** 2단계: 전체 열쇠를 풀고 자리마다 다른 열쇠로 잠근다 */
  relockStep(deck: readonly bigint[]): bigint[] {
    const unlock = unlockExponent(this.g, this.globalKey);
    return deck.map((c, slot) =>
      modPow(
        c,
        combine(this.g, [unlock, this.slotKeys[slot] as bigint]),
        this.g.p,
      ),
    );
  }

  /** 자리 열쇠를 공개한다. 내 자리는 카드를 낼 때와 판 끝에만 */
  revealKey(slot: number, reason: RevealReason): bigint {
    if (this.mySlots.has(slot) && reason !== "play" && reason !== "audit")
      throw new Error(
        `${this.seat}번: 내 자리 ${slot}의 열쇠는 낼 때만 공개한다`,
      );
    return this.slotKeys[slot] as bigint;
  }

  /** 3단계: 다른 사람 열쇠를 모두 받으면 내 마지막 잠금을 풀어 카드를 본다 */
  receive(slot: number, cipher: bigint, othersKeys: readonly bigint[]): Card {
    this.mySlots.add(slot);
    const exponent = combine(this.g, [
      ...othersKeys.map((k) => unlockExponent(this.g, k)),
      unlockExponent(this.g, this.slotKeys[slot] as bigint),
    ]);
    const card = decode(this.g, modPow(cipher, exponent, this.g.p));
    if (card === null)
      throw new Error(`${this.seat}번: 자리 ${slot}을 열 수 없다`);
    this.hand.set(slot, card);
    return card;
  }

  /** 재연결용: 열쇠를 브라우저에 남겨 둔다(sessionStorage 등) */
  snapshot(): PartySnapshot {
    return {
      seat: this.seat,
      global: this.globalKey.toString(16),
      slotKeys: this.slotKeys.map((k) => k.toString(16)),
      mySlots: [...this.mySlots],
    };
  }

  static restore(
    g: SraGroup,
    s: PartySnapshot,
    hand: Map<number, Card>,
  ): Party {
    const party = new Party(s.seat, g, s.slotKeys.length);
    party.globalKey = BigInt(`0x${s.global}`);
    party.slotKeys = s.slotKeys.map((k) => BigInt(`0x${k}`));
    for (const slot of s.mySlots) party.mySlots.add(slot);
    for (const [slot, card] of hand) party.hand.set(slot, card);
    return party;
  }
}

const decodeCache = new WeakMap<SraGroup, Map<bigint, Card>>();

/** 다 푼 값 → 카드. 카드 값이 아니면 null */
export function decode(g: SraGroup, value: bigint): Card | null {
  let table = decodeCache.get(g);
  if (!table) {
    table = new Map(DECK.map((card, i) => [encodeIndex(g, i), card]));
    decodeCache.set(g, table);
  }
  return table.get(value) ?? null;
}

/** 모두가 보는 공개 기록: 마지막 덱(암호문)과 지금까지 공개된 자리 열쇠 */
export class PublicLedger {
  readonly keys: Map<number, Map<number, bigint>>;
  constructor(
    readonly g: SraGroup,
    readonly deck: readonly bigint[],
  ) {
    this.keys = new Map(deck.map((_, slot) => [slot, new Map()]));
  }

  publish(slot: number, seat: number, key: bigint): void {
    this.keys.get(slot)?.set(seat, key);
  }

  /** 모든 사람의 열쇠가 공개된 자리만 열 수 있다. 아니면 null(방장도 마찬가지) */
  open(slot: number, seats: readonly number[]): Card | null {
    const known = this.keys.get(slot);
    if (!known || seats.some((s) => !known.has(s))) return null;
    const exponent = combine(
      this.g,
      seats.map((s) => unlockExponent(this.g, known.get(s) as bigint)),
    );
    return decode(
      this.g,
      modPow(this.deck[slot] as bigint, exponent, this.g.p),
    );
  }
}

export interface DealResult {
  ledger: PublicLedger;
  /** 자리 번호 → 받은 사람(바닥 카드는 −1) */
  owners: number[];
}

/**
 * 섞고 나눠 준다. `owners[s]`가 자리 s를 받을 사람(−1이면 바닥 카드로 남겨 둔다).
 * 실제로는 메시지가 오가지만 여기서는 차례대로 부른다. 누구도 남의 비밀 열쇠를 쓰지 않는다.
 */
export function shuffleAndDeal(
  g: SraGroup,
  parties: readonly Party[],
  owners: readonly number[],
  tamper?: (seat: number, deck: bigint[]) => bigint[],
): DealResult {
  let deck = DECK.map((_, i) => encodeIndex(g, i));
  for (const party of parties) {
    deck = party.shuffleStep(deck);
    if (tamper) deck = tamper(party.seat, deck);
  }
  for (const party of parties) deck = party.relockStep(deck);
  const ledger = new PublicLedger(g, deck);
  const seats = parties.map((p) => p.seat);
  owners.forEach((owner, slot) => {
    if (owner < 0) return;
    for (const other of parties) {
      if (other.seat === owner) continue;
      ledger.publish(slot, other.seat, other.revealKey(slot, "deal"));
    }
    const party = parties.find((p) => p.seat === owner) as Party;
    party.receive(
      slot,
      deck[slot] as bigint,
      seats
        .filter((s) => s !== owner)
        .map((s) => ledger.keys.get(slot)?.get(s) as bigint),
    );
  });
  return { ledger, owners: [...owners] };
}

/** 바닥 카드를 주공에게 준다(나머지가 열쇠를 공개) */
export function giveSlots(
  deal: DealResult,
  parties: readonly Party[],
  slots: readonly number[],
  to: number,
): Card[] {
  const party = parties.find((p) => p.seat === to) as Party;
  return slots.map((slot) => {
    for (const other of parties)
      if (other.seat !== to)
        deal.ledger.publish(slot, other.seat, other.revealKey(slot, "kitty"));
    deal.owners[slot] = to;
    return party.receive(
      slot,
      deal.ledger.deck[slot] as bigint,
      parties
        .filter((p) => p.seat !== to)
        .map((p) => deal.ledger.keys.get(slot)?.get(p.seat) as bigint),
    );
  });
}

/** 카드를 낸다: 낸 사람이 자기 열쇠를 공개하고 모두가 연다 */
export function playSlot(
  deal: DealResult,
  parties: readonly Party[],
  seat: number,
  slot: number,
): Card {
  if (deal.owners[slot] !== seat)
    throw new Error(`${seat}번이 남의 자리 ${slot}을 내려 했다`);
  const party = parties.find((p) => p.seat === seat) as Party;
  deal.ledger.publish(slot, seat, party.revealKey(slot, "play"));
  const card = deal.ledger.open(
    slot,
    parties.map((p) => p.seat),
  );
  if (card === null)
    throw new Error(`자리 ${slot}을 열 수 없다(열쇠가 틀렸다)`);
  return card;
}

/**
 * 판 끝 확인: 모두 남은 열쇠를 공개해 모든 자리를 열고, 53장이 한 번씩 있는지 본다.
 * 섞을 때 카드를 바꿔치기했다면 여기서(또는 그 전에 같은 카드가 두 번 나올 때) 드러난다.
 */
export function finalAudit(
  deal: DealResult,
  parties: readonly Party[],
): { ok: true; cards: Card[] } | { ok: false; reason: string } {
  const seats = parties.map((p) => p.seat);
  for (const party of parties)
    for (let slot = 0; slot < deal.ledger.deck.length; slot++)
      deal.ledger.publish(slot, party.seat, party.revealKey(slot, "audit"));
  const cards: Card[] = [];
  for (let slot = 0; slot < deal.ledger.deck.length; slot++) {
    const card = deal.ledger.open(slot, seats);
    if (card === null)
      return { ok: false, reason: `자리 ${slot}이 카드가 아니다(섞기 조작)` };
    cards.push(card);
  }
  if (new Set(cards).size !== DECK.length)
    return { ok: false, reason: "같은 카드가 두 번 있다(섞기 조작)" };
  return { ok: true, cards };
}
