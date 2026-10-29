import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decisionFor } from "./decision";
import { deckFor } from "./deck";
import { createMatch, STARTING_MONEY, step } from "./match";
import { RULE_PRESETS } from "./presets";
import { createRng } from "./rng";
import type { MatchState } from "./state";
import { actingSeat, randomAction } from "./test-utils";
import { viewOf } from "./view";

function cardsInPlay(state: MatchState): string[] {
  const { round } = state;
  return [
    ...round.hands.flat(),
    ...round.deck,
    ...round.discarded,
    ...(round.trick?.plays.map((p) => p.card) ?? []),
    ...round.tricks.flatMap((t) => t.plays.map((p) => p.card)),
  ];
}

function checkInvariants(state: MatchState): void {
  const { rules, round } = state;
  const seatCount = rules.playerCount;

  // 돈의 합은 늘 그대로다.
  expect(state.money.reduce((a, b) => a + b, 0)).toBe(
    STARTING_MONEY * seatCount,
  );

  // 카드는 생기거나 사라지지 않는다. 2마는 고르지 않은 카드가 판에서 빠진다.
  const cards = cardsInPlay(state);
  expect(new Set(cards).size).toBe(cards.length);
  if (seatCount !== 2) expect(cards.length).toBe(deckFor(rules).length);

  // 진행 중이면 차례인 사람에게 할 수 있는 행동이 있다.
  if (round.phase !== "roundEnd" && round.phase !== "gameOver") {
    expect(round.turn).not.toBeNull();
    const decision = decisionFor(state, round.turn as number);
    expect(decision).not.toBeNull();
    if (decision?.kind === "play")
      expect(decision.cards.length).toBeGreaterThan(0);
    if (decision?.kind === "election") {
      expect(
        decision.canPass || decision.bids.length > 0 || decision.canDealMiss,
      ).toBe(true);
    }
  }

  // 트릭 중에는 모든 참가자가 같은 장수를 들고 있거나 한 장 차이다.
  if (round.phase === "play") {
    const sizes = round.players.map((s) => round.hands[s]?.length ?? 0);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  }

  // 보이는 정보에는 남의 패가 없다.
  for (const seat of state.order) {
    const view = viewOf(state, seat);
    expect(view.hand).toEqual(round.hands[seat]);
    expect(JSON.stringify(view)).not.toContain('"hands"');
    if (
      seat !== round.declarer &&
      round.phase !== "roundEnd" &&
      round.phase !== "gameOver"
    ) {
      expect(view.discarded).toBeNull();
    }
  }
}

/** 무작위로 판을 진행한다. `maxRounds`판이 끝나거나 게임이 끝나면 멈춘다. */
function playRandomly(
  presetIndex: number,
  seed: number,
  maxRounds: number,
): MatchState & { scoredRounds: number } {
  const preset = RULE_PRESETS[presetIndex];
  if (!preset) throw new Error("없는 규칙");
  const rng = createRng(seed ^ 0x9e3779b9);
  let { state } = createMatch({ rules: preset.rules, seed });
  let scored = 0;
  for (let guard = 0; guard < 5000; guard++) {
    checkInvariants(state);
    const seat = actingSeat(state);
    if (seat === null) break;
    const decision = decisionFor(state, seat);
    if (decision === null) throw new Error("결정이 없다");
    const result = step(state, seat, randomAction(state, seat, decision, rng));
    if (!result.ok) throw new Error(`${preset.name}: ${result.error}`);
    state = result.state;
    if (result.events.some((e) => e.type === "roundScored")) scored++;
    if (scored >= maxRounds && state.round.phase !== "play") break;
  }
  return Object.assign(state, { scoredRounds: scored });
}

describe("무작위 대국에서 불변식이 유지된다", () => {
  it.each(RULE_PRESETS.map((p, i) => [p.name, i] as const))(
    "%s",
    (_name, presetIndex) => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
          const state = playRandomly(presetIndex, seed, 3);
          // 점수 계산까지 가지 못하고 멈췄다면 테스트가 의미 없다.
          expect(
            state.scoredRounds === 3 || state.round.phase === "gameOver",
          ).toBe(true);
        }),
        // 규칙 15가지 × 시드 4개 × 3판 = 무작위 판 180개를 매 수 검사한다
        { numRuns: 4 },
      );
    },
  );
});

describe("재생", () => {
  it("같은 시드와 같은 행동이면 같은 결과가 나온다", () => {
    const a = playRandomly(0, 1234, 2);
    const b = playRandomly(0, 1234, 2);
    expect(a).toEqual(b);
  });
});
