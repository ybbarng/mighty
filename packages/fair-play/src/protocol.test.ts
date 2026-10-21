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
  Party,
  PublicLedger,
  playSlot,
  shuffleAndDeal,
} from "./protocol";
import { RenegeWatch } from "./renege";
import { GROUP_1024 } from "./sra";

const g = GROUP_1024;
/** 마이티 5마: 자리 0~49는 10장씩, 50~52는 바닥 카드 */
const OWNERS = Array.from({ length: 53 }, (_, s) =>
  s < 50 ? Math.floor(s / 10) : -1,
);

function table(tamper?: Parameters<typeof shuffleAndDeal>[3]) {
  const parties = [0, 1, 2, 3, 4].map((seat) => new Party(seat, g, 53));
  const deal = shuffleAndDeal(g, parties, OWNERS, tamper);
  return { parties, deal };
}

describe("멘탈 포커 나눠 주기", () => {
  it("각자 자기 10장만 보고, 다 모으면 바닥 카드 3장을 뺀 50장이 겹치지 않는다", () => {
    const { parties } = table();
    for (const p of parties) expect(p.hand.size).toBe(10);
    const all = parties.flatMap((p) => [...p.hand.values()]);
    expect(new Set(all).size).toBe(50);
  });

  it("방장(0번)을 포함해 누구도 공개 정보만으로는 남의 카드나 바닥 카드를 열 수 없다", () => {
    const { deal } = table();
    const seats = [0, 1, 2, 3, 4];
    for (let slot = 0; slot < 53; slot++)
      expect(deal.ledger.open(slot, seats)).toBeNull();
  });

  it("자기 자리 열쇠는 카드를 낼 때와 판 끝에만 내준다", () => {
    const { parties } = table();
    expect(() => parties[0]?.revealKey(0, "deal")).toThrow();
    expect(() => parties[0]?.revealKey(0, "play")).not.toThrow();
  });

  it("바닥 카드는 주공만 열고, 낸 카드는 모두가 같은 카드로 연다", () => {
    const { parties, deal } = table();
    const kitty = giveSlots(deal, parties, [50, 51, 52], 2);
    expect(parties[2]?.hand.size).toBe(13);
    expect(
      kitty.every((c) => parties[2]?.hand.get(50 + kitty.indexOf(c)) === c),
    ).toBe(true);
    const card = playSlot(deal, parties, 3, 30);
    expect(card).toBe(parties[3]?.hand.get(30));
    expect(() => playSlot(deal, parties, 3, 0)).toThrow(); // 남의 자리
  });

  it("새로고침해도 남겨 둔 열쇠로 이어서 낸다", () => {
    const { parties, deal } = table();
    const before = parties[1] as Party;
    const restored = Party.restore(g, before.snapshot(), before.hand);
    const others = parties.map((p) => (p.seat === 1 ? restored : p));
    expect(playSlot(deal, others, 1, 12)).toBe(before.hand.get(12));
  });

  it("판 끝에 모두 열쇠를 공개하면 53장이 한 번씩 있다", () => {
    const { parties, deal } = table();
    const audit = finalAudit(deal, parties);
    expect(audit.ok).toBe(true);
    if (audit.ok) expect(new Set(audit.cards).size).toBe(53);
  });

  it("섞을 때 카드를 바꿔치기하면(같은 카드 둘) 판 끝 확인과 공개 순간에 들킨다", () => {
    // 2번이 섞으면서 한 자리를 다른 자리 값으로 덮는다(예: 조커를 하나 더 만들기).
    const { parties, deal } = table((seat, deck) =>
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
  const ledger = new PublicLedger(g, deal.ledger.deck);
  return slots.map((slot) => {
    for (const p of parties)
      ledger.publish(slot, p.seat, p.revealKey(slot, "audit"));
    return ledger.open(
      slot,
      parties.map((p) => p.seat),
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
  it("정직한 판: 낸 카드를 프로토콜로 열면 엔진의 카드와 같고, 위반이 없다", () => {
    const { parties, deal } = table();
    const { state, opened } = playRound(deal, parties);
    // 모두 포기해 다시 나누는 판이 아니면 50장을 낸다.
    if (state.round.phase === "roundEnd") expect(opened).toBe(50);
    expect(finalAudit(deal, parties).ok).toBe(true);
  });

  it("DECK은 마이티 53장", () => {
    expect(DECK).toHaveLength(53);
  });
});
