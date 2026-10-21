import { heuristicBot } from "@mighty/ai";
import {
  type Card,
  createMatch,
  createRng,
  decisionFor,
  type MatchState,
  presetRules,
  step,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  DECK,
  type DealResult,
  finalAudit,
  giveSlots,
  giveTo,
  Party,
  PublicLedger,
  playSlot,
  reshuffle,
  shuffleAndDeal,
} from "./protocol";
import { RenegeWatch } from "./renege";
import { GROUP_1024 } from "./sra";

const g = GROUP_1024;
/** 마이티 5마: 자리 0~49는 10장씩, 50~52는 바닥 카드 */
const OWNERS = Array.from({ length: 53 }, (_, s) =>
  s < 50 ? Math.floor(s / 10) : -1,
);

async function table(tamper?: Parameters<typeof shuffleAndDeal>[3]) {
  const parties = [0, 1, 2, 3, 4].map((seat) => new Party(seat, g));
  const deal = await shuffleAndDeal(g, parties, OWNERS, tamper);
  return { parties, deal };
}

describe("멘탈 포커 나눠 주기", () => {
  it("각자 자기 10장만 보고, 다 모으면 바닥 카드 3장을 뺀 50장이 겹치지 않는다", async () => {
    const { parties } = await table();
    for (const p of parties) expect(p.hand.size).toBe(10);
    const all = parties.flatMap((p) => [...p.hand.values()]);
    expect(new Set(all).size).toBe(50);
  });

  it("방장(0번)을 포함해 누구도 공개 정보만으로는 남의 카드나 바닥 카드를 열 수 없다", async () => {
    const { deal } = await table();
    const seats = [0, 1, 2, 3, 4];
    for (let slot = 0; slot < 53; slot++)
      expect(deal.ledger.open(slot, seats)).toBeNull();
  });

  it("자기 자리 열쇠는 카드를 낼 때와 판 끝에만 내준다", async () => {
    const { parties } = await table();
    expect(() => parties[0]?.revealKey(0, "deal")).toThrow();
    expect(() => parties[0]?.revealKey(0, "play")).not.toThrow();
  });

  it("바닥 카드는 주공만 열고, 낸 카드는 모두가 같은 카드로 연다", async () => {
    const { parties, deal } = await table();
    const kitty = giveSlots(deal, parties, [50, 51, 52], 2);
    expect(parties[2]?.hand.size).toBe(13);
    expect(
      kitty.every((c) => parties[2]?.hand.get(50 + kitty.indexOf(c)) === c),
    ).toBe(true);
    const card = playSlot(deal, parties, 3, 30);
    expect(card).toBe(parties[3]?.hand.get(30));
    expect(() => playSlot(deal, parties, 3, 0)).toThrow(); // 남의 자리
  });

  it("새로고침해도 남겨 둔 열쇠로 이어서 낸다", async () => {
    const { parties, deal } = await table();
    const before = parties[1] as Party;
    const restored = Party.restore(g, before.snapshot());
    const others = parties.map((p) => (p.id === 1 ? restored : p));
    expect(playSlot(deal, others, 1, 12)).toBe(before.hand.get(12));
  });

  it("판 끝에 모두 열쇠를 공개하면 53장이 한 번씩 있다", async () => {
    const { parties, deal } = await table();
    const audit = finalAudit(deal, parties);
    expect(audit.ok).toBe(true);
    if (audit.ok) expect(new Set(audit.cards).size).toBe(53);
  });

  it("섞을 때 카드를 바꿔치기하면(같은 카드 둘) 판 끝 확인과 공개 순간에 들킨다", async () => {
    // 2번이 섞으면서 한 자리를 다른 자리 값으로 덮는다(예: 조커를 하나 더 만들기).
    const { parties, deal } = await table((seat, deck) =>
      seat === 2
        ? deck.map((c, i) => (i === 1 ? (deck[0] as bigint) : c))
        : deck,
    );
    const audit = finalAudit(deal, parties);
    expect(audit.ok).toBe(false);
  });
});

/** 시험용: 모두의 열쇠로 자리를 따로 열어 본다(진행 중인 공개 기록은 건드리지 않는다) */
function peekSlots(
  deal: DealResult,
  parties: Party[],
  slots: number[],
): Card[] {
  const ledger = new PublicLedger(g);
  ledger.extend(deal.ledger.deck);
  return slots.map((slot) => {
    for (const p of parties)
      ledger.publish(slot, p.id, p.revealKey(slot, "audit"));
    return ledger.open(
      slot,
      parties.map((p) => p.id),
    ) as Card;
  });
}

/** 프로토콜로 나눈 패로 엔진과 컴퓨터가 한 판을 둔다. 낸 카드는 모두 프로토콜로 연다 */
function playRound(deal: DealResult, parties: Party[]) {
  const rules = presetRules("standard5");
  const hands = parties.map((p) => [...p.hand.values()]);
  // 바닥 카드는 판 끝까지 아무도 모르지만, 엔진(심판 역할)에 넣으려고 시험에서만 따로 연다.
  const kitty = peekSlots(deal, parties, [50, 51, 52]);
  let { state }: { state: MatchState } = createMatch({
    rules,
    seed: 1,
    firstBeginner: 0,
    presetDeal: { hands, kitty },
  });
  const rng = createRng(3);
  let watch: RenegeWatch | null = null;
  let opened = 0;
  for (
    let i = 0;
    i < 400 &&
    // 모두 포기·딜미스로 다시 나누면 엔진이 따로 섞으므로 여기서 멈춘다.
    state.roundNumber === 1 &&
    state.round.phase !== "roundEnd" &&
    state.round.phase !== "gameOver";
    i++
  ) {
    const seat = state.order.find((s) => decisionFor(state, s) !== null);
    if (seat === undefined) break;
    const action = heuristicBot.decide(viewOf(state, seat), rng);
    if (action.type === "exchange") {
      // 당선: 나머지가 바닥 카드 열쇠를 공개해 주공에게 준다.
      giveSlots(deal, parties, [50, 51, 52], seat);
    }
    if (action.type === "play") {
      watch ??= new RenegeWatch(rules, state.round.goal?.kiruda ?? "NT");
      const party = parties[seat] as Party;
      const slot = [...party.hand].find(
        ([, c]) => c === action.card,
      )?.[0] as number;
      const card = playSlot(deal, parties, seat, slot);
      expect(card).toBe(action.card);
      opened++;
      const trick = state.round.trick;
      const violation = watch.reveal(state.round.trickIndex, seat, card, {
        jokerSuit:
          trick?.plays.length === 0
            ? (action.jokerSuit ?? null)
            : (trick?.jokerSuit ?? null),
        jokerCalled:
          trick?.plays.length === 0
            ? action.jokerCall === true
            : (trick?.jokerCalled ?? false),
      });
      expect(violation).toBeNull();
    }
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return { state, opened };
}

describe("한 판 전체", () => {
  it("정직한 판: 낸 카드를 프로토콜로 열면 엔진의 카드와 같고, 위반이 없다", async () => {
    const { parties, deal } = await table();
    const { state, opened } = playRound(deal, parties);
    // 모두 포기해 다시 나누는 판이 아니면 50장을 낸다.
    if (state.round.phase === "roundEnd") expect(opened).toBe(50);
    expect(finalAudit(deal, parties).ok).toBe(true);
  });

  it("6마 다시 나누기: 바닥 카드와 죽은 사람 카드를 새 자리로 섞어도 같은 카드들이고, 아무도 미리 모른다", async () => {
    const parties = [0, 1, 2, 3, 4, 5].map((id) => new Party(id, g));
    const owners = Array.from({ length: 53 }, (_, s) =>
      s < 48 ? Math.floor(s / 8) : -1,
    );
    const deal = await shuffleAndDeal(g, parties, owners);
    // 5번이 죽었다: 5번 카드 8장 + 바닥 5장. 죽인 카드 한 장(40번 자리)은 증명으로 이미 공개됐다.
    deal.ledger.publish(40, 5, (parties[5] as Party).revealKey(40, "proof"));
    const pool = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52];
    const poolCards = peekSlots(deal, parties, pool);
    const fresh = await reshuffle(deal, parties, pool);
    expect(fresh).toEqual(Array.from({ length: 13 }, (_, i) => 53 + i));
    const ids = parties.map((p) => p.id);
    for (const slot of fresh) expect(deal.ledger.open(slot, ids)).toBeNull();
    giveTo(deal, parties, fresh.slice(0, 2), 1);
    expect([...(parties[1] as Party).hand]).toHaveLength(10);
    expect(peekSlots(deal, parties, fresh).sort()).toEqual(poolCards.sort());
    const audit = finalAudit(deal, parties);
    expect(audit.ok).toBe(true);
    if (audit.ok) expect(new Set(audit.cards).size).toBe(53);
  });

  it("DECK은 마이티 53장", async () => {
    expect(DECK).toHaveLength(53);
  });
});
