import { describe, expect, it } from "vitest";

import type { Card } from "./cards";
import { decisionFor } from "./decision";
import { deckFor } from "./deck";
import { createMatch, type StepResult, step } from "./match";
import { presetRules } from "./presets";
import type { RuleSet } from "./rules";
import type { Action, GameEvent, MatchState, PresetDeal } from "./state";
import { viewOf } from "./view";

const standard5 = presetRules("standard5");

/** 정해 둔 패 말고 나머지 카드는 덱 순서대로 다른 자리에 채운다. */
function dealWith(
  rules: RuleSet,
  fixed: Record<number, Card[]>,
  handSize: number,
): PresetDeal {
  const used = new Set(Object.values(fixed).flat());
  const rest = deckFor(rules).filter((c) => !used.has(c));
  const hands = Array.from({ length: rules.playerCount }, (_, seat) => {
    const hand = [...(fixed[seat] ?? [])];
    while (hand.length < handSize) hand.push(rest.shift() as Card);
    return hand;
  });
  return { hands, kitty: rest };
}

/** 성공해야 하는 행동을 차례로 적용한다. */
function play(
  state: MatchState,
  ...moves: [number, Action][]
): { state: MatchState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const [seat, action] of moves) {
    const result = step(current, seat, action);
    if (!result.ok)
      throw new Error(`${seat} ${JSON.stringify(action)}: ${result.error}`);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

function expectFail(result: StepResult): void {
  expect(result.ok).toBe(false);
}

const pass: Action = { type: "pass" };

// 0번: 스페이드 위주, 1번: 하트, 2번: 다이아(◆A 포함), 3번: 클로버, 4번: ♠A·조커와 낮은 카드. 키티: ♠3 ♠2 ♣3
const scenarioDeal: PresetDeal = {
  hands: [
    ["SK", "SQ", "SJ", "S10", "S9", "S8", "S7", "S6", "S5", "S4"],
    ["HA", "HK", "HQ", "HJ", "H10", "H9", "H8", "H7", "H6", "H5"],
    ["DA", "DK", "DQ", "DJ", "D10", "D9", "D8", "D7", "D6", "D5"],
    ["CA", "CK", "CQ", "CJ", "C10", "C9", "C8", "C7", "C6", "C5"],
    ["SA", "JK", "H4", "H3", "H2", "D4", "D3", "D2", "C4", "C2"],
  ],
  kitty: ["S3", "S2", "C3"],
};

function scenario(rules: RuleSet = standard5): MatchState {
  return createMatch({ rules, seed: 1, presetDeal: scenarioDeal }).state;
}

/** 0번이 ♠14로 당선되는 데까지. */
function electSpade14(rules: RuleSet = standard5): MatchState {
  return play(
    scenario(rules),
    [0, { type: "bid", goal: { kiruda: "S", score: 14 } }],
    [1, pass],
    [2, pass],
    [3, pass],
    [4, pass],
  ).state;
}

describe("행동 검사", () => {
  it("차례가 아닌 자리의 행동은 거절한다", () => {
    expectFail(step(scenario(), 1, pass));
  });

  it("입력 상태를 바꾸지 않는다", () => {
    const state = scenario();
    const before = JSON.stringify(state);
    step(state, 0, { type: "bid", goal: { kiruda: "S", score: 14 } });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("최소 공약보다 낮은 공약은 거절한다", () => {
    expectFail(
      step(scenario(), 0, { type: "bid", goal: { kiruda: "S", score: 12 } }),
    );
  });
});

describe("선거", () => {
  it("나머지가 모두 포기하면 마지막 공약자가 당선되고 키티를 받는다", () => {
    const state = electSpade14();
    expect(state.round.phase).toBe("exchange");
    expect(state.round.declarer).toBe(0);
    expect(state.round.hands[0]).toHaveLength(13);
    expect(state.round.hands[0]).toEqual(
      expect.arrayContaining(["S3", "S2", "C3"]),
    );
  });

  it("20을 부르면 바로 당선된다", () => {
    const { state, events } = play(scenario(), [
      0,
      { type: "bid", goal: { kiruda: "S", score: 20 } },
    ]);
    expect(state.round.declarer).toBe(0);
    expect(events.map((e) => e.type)).toContain("elected");
  });

  it("포기한 사람은 다시 부를 차례가 오지 않는다", () => {
    const { state } = play(
      scenario(),
      [0, { type: "bid", goal: { kiruda: "S", score: 13 } }],
      [1, pass],
      [2, { type: "bid", goal: { kiruda: "D", score: 14 } }],
      [3, pass],
      [4, pass],
    );
    expect(state.round.turn).toBe(0);
    const { state: after } = play(state, [0, pass]);
    expect(after.round.declarer).toBe(2);
  });

  it("모두 포기하면 같은 선으로 다시 딜한다. 돈은 그대로다", () => {
    const { state, events } = play(
      scenario(),
      [0, pass],
      [1, pass],
      [2, pass],
      [3, pass],
      [4, pass],
    );
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["allPassed", "roundStarted", "dealt"]),
    );
    expect(state.roundNumber).toBe(2);
    expect(state.round.beginner).toBe(0);
    expect(state.round.phase).toBe("election");
    expect(state.money).toEqual([100, 100, 100, 100, 100]);
  });

  it("첫 공약자가 포기할 수 없는 규칙이면 선은 처음에 포기할 수 없다", () => {
    const state = scenario({ ...standard5, firstBidderMayPass: false });
    expectFail(step(state, 0, pass));
    const decision = decisionFor(state, 0);
    expect(decision?.kind === "election" && decision.canPass).toBe(false);
  });

  it("딜미스 패면 딜미스를 선언하고, 같은 선으로 다시 딜한다", () => {
    const noPoints: Card[] = [
      "S9",
      "S8",
      "S7",
      "S6",
      "S5",
      "S4",
      "S3",
      "S2",
      "H2",
      "D2",
    ];
    const { state } = createMatch({
      rules: standard5,
      seed: 3,
      presetDeal: dealWith(standard5, { 0: noPoints }, 10),
    });
    const decision = decisionFor(state, 0);
    expect(decision?.kind === "election" && decision.canDealMiss).toBe(true);
    const { state: after, events } = play(state, [0, { type: "dealMiss" }]);
    expect(events[0]).toEqual({ type: "dealMiss", seat: 0, hand: noPoints });
    expect(after.roundNumber).toBe(2);
    expect(after.round.beginner).toBe(0);
  });

  it("딜미스가 아닌 패로는 딜미스를 선언할 수 없다", () => {
    expectFail(step(scenario(), 0, { type: "dealMiss" }));
  });
});

describe("특권", () => {
  it("버릴 카드는 손에 있는 3장이어야 한다", () => {
    const state = electSpade14();
    const goal = { kiruda: "S" as const, score: 14 };
    expectFail(
      step(state, 0, { type: "exchange", goal, discard: ["S2", "S3"] }),
    );
    expectFail(
      step(state, 0, { type: "exchange", goal, discard: ["S2", "S3", "HA"] }),
    );
    expectFail(
      step(state, 0, { type: "exchange", goal, discard: ["S2", "S2", "S3"] }),
    );
  });

  it("기루다를 바꾸려면 2 이상 올려야 한다", () => {
    const state = electSpade14();
    const discard: Card[] = ["S2", "S3", "C3"];
    expectFail(
      step(state, 0, {
        type: "exchange",
        goal: { kiruda: "H", score: 15 },
        discard,
      }),
    );
    const { state: after } = play(state, [
      0,
      { type: "exchange", goal: { kiruda: "H", score: 16 }, discard },
    ]);
    expect(after.round.goal).toEqual({ kiruda: "H", score: 16 });
    expect(after.round.phase).toBe("friend");
  });

  it("주공 손이나 버린 카드는 프렌드로 지목할 수 없다", () => {
    const { state } = play(electSpade14(), [
      0,
      {
        type: "exchange",
        goal: { kiruda: "S", score: 14 },
        discard: ["S2", "S3", "C3"],
      },
    ]);
    expectFail(
      step(state, 0, { type: "friend", friend: { kind: "card", card: "SK" } }),
    );
    expectFail(
      step(state, 0, { type: "friend", friend: { kind: "card", card: "S2" } }),
    );
  });
});

describe("프렌드와 트릭", () => {
  /** ♠14, 마이티(기루다가 ♠이라 ◆A) 프렌드. 2번이 프렌드다. */
  function mightyFriend(): MatchState {
    return play(
      electSpade14(),
      [
        0,
        {
          type: "exchange",
          goal: { kiruda: "S", score: 14 },
          discard: ["S2", "S3", "C3"],
        },
      ],
      [0, { type: "friend", friend: { kind: "card", card: "DA" } }],
    ).state;
  }

  it("카드 프렌드는 그 카드를 낼 때까지 본인 말고는 모른다", () => {
    const state = mightyFriend();
    expect(state.round.friend).toBe(2);
    expect(viewOf(state, 1).friend).toBeNull();
    expect(viewOf(state, 0).friend).toBeNull();
    expect(viewOf(state, 2).friend).toBe(2);
  });

  it("첫 트릭 선(주공)이 기루다만 가졌으면 기루다를 낼 수 있다", () => {
    const state = mightyFriend();
    const decision = decisionFor(state, 0);
    expect(decision?.kind === "play" && decision.cards).toEqual(
      state.round.hands[0],
    );
  });

  it("마이티를 내면 프렌드가 드러나고, 마이티가 트릭을 가져간다", () => {
    const state = mightyFriend();
    const { state: after, events } = play(
      state,
      [0, { type: "play", card: "SK" }],
      [1, { type: "play", card: "H5" }],
      [2, { type: "play", card: "DA" }],
      [3, { type: "play", card: "C5" }],
    );
    expect(events).toContainEqual({ type: "friendRevealed", seat: 2 });
    expect(viewOf(after, 1).friend).toBe(2);
    // 4번은 ♠ 선에 ♠A만 따라낼 수 있다. 첫 트릭이라 조커는 못 낸다.
    const decision = decisionFor(after, 4);
    expect(decision?.kind === "play" && decision.cards).toEqual(["SA"]);
    const { state: done, events: trickEvents } = play(after, [
      4,
      { type: "play", card: "SA" },
    ]);
    expect(trickEvents).toContainEqual({
      type: "trickWon",
      seat: 2,
      trickIndex: 0,
      points: 3,
    });
    expect(done.round.turn).toBe(2);
    expect(done.round.history.scored[2]).toBe(3);
    // 드러난 프렌드는 득점 더미를 쌓지 않는다.
    expect(done.round.pointPiles[2]).toEqual([]);
  });

  it("초구 프렌드는 첫 트릭을 이긴 사람이다", () => {
    const { state } = play(
      electSpade14(),
      [
        0,
        {
          type: "exchange",
          goal: { kiruda: "S", score: 14 },
          discard: ["S2", "S3", "C3"],
        },
      ],
      [0, { type: "friend", friend: { kind: "firstTrick" } }],
      [0, { type: "play", card: "SK" }],
      [1, { type: "play", card: "H5" }],
      [2, { type: "play", card: "D5" }],
      [3, { type: "play", card: "C5" }],
    );
    const { state: after, events } = play(state, [
      4,
      { type: "play", card: "SA" },
    ]);
    expect(events).toContainEqual({ type: "friendRevealed", seat: 4 });
    expect(after.round.friend).toBe(4);
  });

  it("선으로 조커를 낼 때는 무늬를 정해야 한다", () => {
    // 4번이 첫 트릭을 이겨 선이 되게 한다.
    const { state } = play(
      electSpade14(),
      [
        0,
        {
          type: "exchange",
          goal: { kiruda: "S", score: 14 },
          discard: ["S2", "S3", "C3"],
        },
      ],
      [0, { type: "friend", friend: { kind: "none" } }],
      [0, { type: "play", card: "SK" }],
      [1, { type: "play", card: "H5" }],
      [2, { type: "play", card: "D5" }],
      [3, { type: "play", card: "C5" }],
      [4, { type: "play", card: "SA" }],
    );
    expect(state.round.turn).toBe(4);
    expectFail(step(state, 4, { type: "play", card: "JK" }));
    const { state: after } = play(state, [
      4,
      { type: "play", card: "JK", jokerSuit: "H" },
    ]);
    // 하트가 없는 0번은 아무거나 낼 수 있고, 하트를 가진 1번은 하트를 내야 한다.
    const zero = decisionFor(after, 0);
    expect(zero?.kind === "play" && zero.cards).toEqual(after.round.hands[0]);
    const { state: next } = play(after, [0, { type: "play", card: "SQ" }]);
    const one = decisionFor(next, 1);
    expect(
      one?.kind === "play" && one.cards.every((c) => c.startsWith("H")),
    ).toBe(true);
  });
});

describe("6마 죽이기", () => {
  const rules = presetRules("standard6");

  function elected6(): MatchState {
    const { state } = createMatch({ rules, seed: 5 });
    const declarer = state.round.beginner;
    let current = state;
    current = play(current, [
      declarer,
      { type: "bid", goal: { kiruda: "S", score: 13 } },
    ]).state;
    while (current.round.phase === "election") {
      current = play(current, [current.round.turn as number, pass]).state;
    }
    return current;
  }

  it("당선되면 키티를 받기 전에 한 명을 죽인다", () => {
    const state = elected6();
    expect(state.round.phase).toBe("kill");
    expect(state.round.hands[0]).toHaveLength(8);
  });

  it("헛다리면 다시 지목하고, 맞히면 그 사람이 빠진 5명이 새로 받은 패로 진행한다", () => {
    const state = elected6();
    const own = state.round.hands[0]?.[0] as Card;
    const { state: missed, events } = play(state, [
      0,
      { type: "kill", card: own },
    ]);
    expect(events).toContainEqual({
      type: "killAttempt",
      seat: 0,
      card: own,
      killed: null,
    });
    expect(missed.round.phase).toBe("kill");

    const target = missed.round.hands[3]?.[0] as Card;
    const { state: after, events: killEvents } = play(missed, [
      0,
      { type: "kill", card: target },
    ]);
    expect(killEvents).toContainEqual({
      type: "killAttempt",
      seat: 0,
      card: target,
      killed: 3,
    });
    expect(after.round.players).toEqual([0, 1, 2, 4, 5]);
    expect(after.round.hands[3]).toEqual([]);
    expect(after.round.hands[0]).toHaveLength(13);
    for (const seat of [1, 2, 4, 5])
      expect(after.round.hands[seat]).toHaveLength(10);
    expect(after.round.phase).toBe("exchange");
  });
});
