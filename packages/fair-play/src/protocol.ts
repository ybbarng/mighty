import { type Card, fullDeck } from "@mighty/engine";

import {
  combine,
  encodeIndex,
  modPow,
  newKey,
  newShortKey,
  randomBelow,
  type SraGroup,
  unlockExponent,
} from "./sra";

/*
 * 멘탈 포커 절차(docs/13-mental-poker.md). 기기마다 Party 하나, 나머지는 모두가 보는 공개 정보다.
 * 한 번 나눌 때마다(판마다) 새 Party를 만든다. 열쇠는 그 판에서만 쓴다.
 *
 * 1. 섞기: 각자 차례로 덱 전체를 자기 섞기 열쇠로 잠그고 섞어 다음 사람에게 넘긴다.
 * 2. 자리마다 다시 잠그기: 각자 섞기 열쇠를 풀고 자리마다 다른 열쇠로 잠근다(지수 하나로 한 번에).
 *    한 자리의 열쇠를 공개해도 다른 자리 카드는 드러나지 않는다.
 * 3. 나눠 주기: 자리 s를 j에게 줄 때 j를 뺀 모두가 s의 열쇠를 공개한다. j만 마지막 잠금을 풀어 본다.
 * 4. 내기: 낸 사람이 그 자리의 열쇠를 공개하면 모두가 그 카드를 본다. 자기 자리가 아니면 열쇠가 없다.
 * 5. 판 끝: 모두 남은 열쇠를 공개해 모든 자리를 열고, 카드가 빠짐없이 한 번씩 있는지 확인한다(섞기 조작).
 *
 * 6·7마 다시 나누기: 바닥 카드와 죽은 사람 카드(몇몇 열쇠는 이미 공개됨)를 새 자리로 다시 섞는다.
 *    a. 바꾸기: 각자 그 자리들의 자리 열쇠를 풀고 새 열쇠 하나로 잠근다(자리는 그대로).
 *    b. 섞기: 각자 또 다른 새 열쇠로 잠그고 섞는다. a만으로는 값이 그대로라 누가 어디로 갔는지 보인다.
 *    c. 새 자리마다 다시 잠그기: a·b 열쇠를 풀고 새 자리 열쇠로 잠근다.
 */

/** 카드 번호(0~52) ↔ 카드. 마이티 덱 순서 */
export const DECK: readonly Card[] = fullDeck();

/** 열쇠를 공개하는 까닭. 정해진 때가 아니면 자기 자리 열쇠를 내주지 않는다 */
export type RevealReason =
  | "deal"
  | "kitty"
  | "play"
  /** 6마 죽이기·프렌드처럼 그 카드가 내 손에 있다는 것을 보일 때 */
  | "proof"
  | "dealMiss"
  | "audit";

const OWN_SLOT_REASONS: readonly RevealReason[] = [
  "play",
  "proof",
  "dealMiss",
  "audit",
];

export interface PartySnapshot {
  id: number;
  passes: [string, string][];
  slotKeys: [number, string][];
  mySlots: number[];
  hand: [number, Card][];
}

declare function setTimeout(callback: () => void, ms: number): unknown;

/** 화면이 멈추지 않게 거듭제곱 몇 번마다 차례를 넘긴다 */
const YIELD_EVERY = 4;
function yieldNow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function powEach(
  values: readonly bigint[],
  exponent: (index: number) => bigint,
  p: bigint,
): Promise<bigint[]> {
  const out: bigint[] = [];
  for (const [i, value] of values.entries()) {
    out.push(modPow(value, exponent(i), p));
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await yieldNow();
  }
  return out;
}

/** 한 기기의 한 판 열쇠. 비밀 열쇠는 여기에만 있다 */
export class Party {
  readonly id: number;
  private readonly g: SraGroup;
  /** 섞기 열쇠(이름별). 짧은 열쇠를 쓴다 */
  private readonly passes = new Map<string, bigint>();
  private readonly slotKeys = new Map<number, bigint>();
  /** 나에게 온 자리(내 손패) */
  readonly mySlots = new Set<number>();
  /** 내가 연 카드 */
  readonly hand = new Map<number, Card>();

  constructor(id: number, g: SraGroup) {
    this.id = id;
    this.g = g;
  }

  private pass(name: string): bigint {
    let key = this.passes.get(name);
    if (key === undefined) {
      key = newShortKey();
      this.passes.set(name, key);
    }
    return key;
  }

  private slotKey(slot: number): bigint {
    let key = this.slotKeys.get(slot);
    if (key === undefined) {
      key = newKey(this.g);
      this.slotKeys.set(slot, key);
    }
    return key;
  }

  /** 이 섞기 열쇠를 이미 만들었나(새로고침 뒤: 이미 계산해 보낸 차례인지) */
  hasPass(name: string): boolean {
    return this.passes.has(name);
  }

  hasSlotKey(slot: number): boolean {
    return this.slotKeys.has(slot);
  }

  /** 섞기: 섞기 열쇠 `pass`로 잠그고 섞는다 */
  async lockAndShuffle(
    deck: readonly bigint[],
    pass: string,
  ): Promise<bigint[]> {
    const key = this.pass(pass);
    const locked = await powEach(deck, () => key, this.g.p);
    for (let i = locked.length - 1; i > 0; i--) {
      const j = Number(randomBelow(BigInt(i + 1)));
      [locked[i], locked[j]] = [locked[j] as bigint, locked[i] as bigint];
    }
    return locked;
  }

  /** 다시 잠그기: 섞기 열쇠들을 풀고 `slots[i]`의 자리 열쇠로 잠근다. `deck[i]`가 새 자리 `slots[i]`다 */
  async relock(
    deck: readonly bigint[],
    slots: readonly number[],
    passes: readonly string[],
  ): Promise<bigint[]> {
    const unlock = combine(
      this.g,
      passes.map((name) => unlockExponent(this.g, this.pass(name))),
    );
    return powEach(
      deck,
      (i) => combine(this.g, [unlock, this.slotKey(slots[i] as number)]),
      this.g.p,
    );
  }

  /** 다시 나누기 a: `fromSlots[i]`의 자리 열쇠를 풀고 섞기 열쇠 `pass`로 잠근다(자리는 그대로) */
  async convert(
    deck: readonly bigint[],
    fromSlots: readonly number[],
    pass: string,
  ): Promise<bigint[]> {
    const key = this.pass(pass);
    return powEach(
      deck,
      (i) =>
        combine(this.g, [
          unlockExponent(this.g, this.slotKey(fromSlots[i] as number)),
          key,
        ]),
      this.g.p,
    );
  }

  /** 자리 열쇠를 공개한다. 내 자리는 낼 때, 증명할 때, 판 끝에만 */
  revealKey(slot: number, reason: RevealReason): bigint {
    if (this.mySlots.has(slot) && !OWN_SLOT_REASONS.includes(reason))
      throw new Error(
        `${this.id}번: 내 자리 ${slot}의 열쇠는 낼 때만 공개한다`,
      );
    return this.slotKey(slot);
  }

  /** 나눠 주기: 다른 사람 열쇠를 모두 받으면 내 마지막 잠금을 풀어 카드를 본다. 못 열면 null */
  receive(
    slot: number,
    cipher: bigint,
    othersKeys: readonly bigint[],
  ): Card | null {
    this.mySlots.add(slot);
    const exponent = combine(this.g, [
      ...othersKeys.map((k) => unlockExponent(this.g, k)),
      unlockExponent(this.g, this.slotKey(slot)),
    ]);
    const card = decode(this.g, modPow(cipher, exponent, this.g.p));
    if (card !== null) this.hand.set(slot, card);
    return card;
  }

  /** 재연결용: 열쇠를 브라우저에 남겨 둔다(sessionStorage) */
  snapshot(): PartySnapshot {
    return {
      id: this.id,
      passes: [...this.passes].map(([n, k]) => [n, k.toString(16)]),
      slotKeys: [...this.slotKeys].map(([s, k]) => [s, k.toString(16)]),
      mySlots: [...this.mySlots],
      hand: [...this.hand],
    };
  }

  static restore(g: SraGroup, s: PartySnapshot): Party {
    const party = new Party(s.id, g);
    for (const [n, k] of s.passes) party.passes.set(n, BigInt(`0x${k}`));
    for (const [slot, k] of s.slotKeys)
      party.slotKeys.set(slot, BigInt(`0x${k}`));
    for (const slot of s.mySlots) party.mySlots.add(slot);
    for (const [slot, card] of s.hand) party.hand.set(slot, card);
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

/** 처음 덱: 카드 번호를 이차잉여로 */
export function encodedDeck(g: SraGroup, cards: readonly Card[]): bigint[] {
  return cards.map((card) => encodeIndex(g, DECK.indexOf(card)));
}

/** 모두가 보는 공개 기록: 자리별 암호문과 지금까지 공개된 자리 열쇠 */
export class PublicLedger {
  readonly deck: bigint[] = [];
  /** 자리 → (기기 → 열쇠) */
  readonly keys = new Map<number, Map<number, bigint>>();

  constructor(readonly g: SraGroup) {}

  /** 새 자리들을 덧붙이고 첫 자리 번호를 돌려준다 */
  extend(ciphers: readonly bigint[]): number {
    const base = this.deck.length;
    for (const [i, c] of ciphers.entries()) {
      this.deck.push(c);
      this.keys.set(base + i, new Map());
    }
    return base;
  }

  publish(slot: number, party: number, key: bigint): void {
    this.keys.get(slot)?.set(party, key);
  }

  has(slot: number, party: number): boolean {
    return this.keys.get(slot)?.has(party) ?? false;
  }

  /** 이 기기들의 열쇠가 모두 공개된 자리만 열 수 있다. 아니면 null(방장도 마찬가지) */
  open(slot: number, parties: readonly number[]): Card | null {
    const known = this.keys.get(slot);
    const cipher = this.deck[slot];
    if (!known || cipher === undefined || parties.some((s) => !known.has(s)))
      return null;
    const exponent = combine(
      this.g,
      parties.map((s) => unlockExponent(this.g, known.get(s) as bigint)),
    );
    return decode(this.g, modPow(cipher, exponent, this.g.p));
  }
}

/* ---------- 시험용: 메시지 없이 한 기기에서 차례대로 부르는 절차 ---------- */

export interface DealResult {
  ledger: PublicLedger;
  /** 자리 번호 → 받은 기기(바닥 카드는 −1) */
  owners: number[];
}

/**
 * 섞고 나눠 준다. `owners[s]`가 자리 s를 받을 기기(−1이면 바닥 카드로 남겨 둔다).
 * 실제로는 메시지가 오가지만(device.ts) 여기서는 차례대로 부른다. 누구도 남의 비밀 열쇠를 쓰지 않는다.
 */
export async function shuffleAndDeal(
  g: SraGroup,
  parties: readonly Party[],
  owners: readonly number[],
  tamper?: (party: number, deck: bigint[]) => bigint[],
): Promise<DealResult> {
  let deck = encodedDeck(g, DECK);
  for (const party of parties) {
    deck = await party.lockAndShuffle(deck, "shuffle");
    if (tamper) deck = tamper(party.id, deck);
  }
  const slots = deck.map((_, i) => i);
  for (const party of parties)
    deck = await party.relock(deck, slots, ["shuffle"]);
  const ledger = new PublicLedger(g);
  ledger.extend(deck);
  const deal = { ledger, owners: [...owners] };
  owners.forEach((owner, slot) => {
    if (owner >= 0) giveSlot(deal, parties, slot, owner, "deal");
  });
  return deal;
}

function giveSlot(
  deal: DealResult,
  parties: readonly Party[],
  slot: number,
  to: number,
  reason: RevealReason,
): Card | null {
  for (const other of parties)
    if (other.id !== to)
      deal.ledger.publish(slot, other.id, other.revealKey(slot, reason));
  deal.owners[slot] = to;
  const party = parties.find((p) => p.id === to) as Party;
  return party.receive(
    slot,
    deal.ledger.deck[slot] as bigint,
    parties
      .filter((p) => p.id !== to)
      .map((p) => deal.ledger.keys.get(slot)?.get(p.id) as bigint),
  );
}

/** 바닥 카드를 주공에게 준다(나머지가 열쇠를 공개) */
export function giveSlots(
  deal: DealResult,
  parties: readonly Party[],
  slots: readonly number[],
  to: number,
): (Card | null)[] {
  return slots.map((slot) => giveSlot(deal, parties, slot, to, "kitty"));
}

/** 6·7마: `pool` 자리들을 새 자리로 다시 섞는다. 새 자리 번호들을 돌려준다(아직 아무에게도 안 줬다) */
export async function reshuffle(
  deal: DealResult,
  parties: readonly Party[],
  pool: readonly number[],
): Promise<number[]> {
  let deck = pool.map((slot) => deal.ledger.deck[slot] as bigint);
  for (const party of parties) deck = await party.convert(deck, pool, "pool");
  for (const party of parties)
    deck = await party.lockAndShuffle(deck, "poolShuffle");
  const base = deal.ledger.deck.length;
  const slots = deck.map((_, i) => base + i);
  for (const party of parties)
    deck = await party.relock(deck, slots, ["pool", "poolShuffle"]);
  deal.ledger.extend(deck);
  for (const slot of pool) deal.owners[slot] = -2;
  for (const _ of slots) deal.owners.push(-1);
  return slots;
}

export function giveTo(
  deal: DealResult,
  parties: readonly Party[],
  slots: readonly number[],
  to: number,
): (Card | null)[] {
  return slots.map((slot) => giveSlot(deal, parties, slot, to, "deal"));
}

/** 카드를 낸다: 낸 사람이 자기 열쇠를 공개하고 모두가 연다 */
export function playSlot(
  deal: DealResult,
  parties: readonly Party[],
  party: number,
  slot: number,
): Card {
  if (deal.owners[slot] !== party)
    throw new Error(`${party}번이 남의 자리 ${slot}을 내려 했다`);
  const owner = parties.find((p) => p.id === party) as Party;
  deal.ledger.publish(slot, party, owner.revealKey(slot, "play"));
  const card = deal.ledger.open(
    slot,
    parties.map((p) => p.id),
  );
  if (card === null)
    throw new Error(`자리 ${slot}을 열 수 없다(열쇠가 틀렸다)`);
  return card;
}

/**
 * 판 끝 확인: 모두 남은 열쇠를 공개해 아직 쓰는 자리를 모두 열고, 카드가 한 번씩 있는지 본다.
 * 다시 섞어 없어진 자리(owners −2)는 건너뛴다.
 */
export function finalAudit(
  deal: DealResult,
  parties: readonly Party[],
): { ok: true; cards: Card[] } | { ok: false; reason: string } {
  const ids = parties.map((p) => p.id);
  const live = deal.owners
    .map((owner, slot) => ({ owner, slot }))
    .filter((s) => s.owner !== -2)
    .map((s) => s.slot);
  for (const party of parties)
    for (const slot of live)
      deal.ledger.publish(slot, party.id, party.revealKey(slot, "audit"));
  const cards: Card[] = [];
  for (const slot of live) {
    const card = deal.ledger.open(slot, ids);
    if (card === null)
      return { ok: false, reason: `자리 ${slot}이 카드가 아니다(섞기 조작)` };
    cards.push(card);
  }
  if (new Set(cards).size !== cards.length)
    return { ok: false, reason: "같은 카드가 두 번 있다(섞기 조작)" };
  return { ok: true, cards };
}
