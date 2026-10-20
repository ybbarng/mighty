import {
  type Card,
  createMatch,
  createRng,
  createScenario,
  fullDeck,
  presetRules,
  RULE_PRESETS,
  step,
  suitOf,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { heuristicBot } from "./heuristic-bot";
import { createSearchBot, inferFromPlays, sampleHands } from "./search-bot";
import { simulate } from "./simulate";

const standard5 = presetRules("standard5");

/** 기루다 ♥, 1번이 선으로 ♣를 낸 장면에서 몇 장을 내 본다 */
function playedScene(plays: [number, Card][]) {
  const state = createScenario({
    rules: standard5,
    phase: "play",
    declarer: 1,
    goal: { kiruda: "H", score: 13 },
    leader: 1,
    hands: [
      ["H2", "D3"],
      ["C5", "D4"],
      ["SA", "S9"],
      ["D9", "C9"],
      ["C10", "S2"],
    ],
  });
  let current = state;
  for (const [seat, card] of plays) {
    const result = step(current, seat, { type: "play", card });
    if (!result.ok) throw new Error(result.error);
    current = result.state;
  }
  return current;
}

describe("낸 카드로 알아내기", () => {
  it("선 무늬를 따라 내지 않은 사람은 그 무늬가 떨어졌다", () => {
    // 2번은 ♣가 없어 ♠9를 냈다. 3번은 ♣9로 따라 냈다.
    const state = playedScene([
      [1, "C5"],
      [2, "S9"],
      [3, "C9"],
    ]);
    const { voids } = inferFromPlays(viewOf(state, 0));
    expect(voids.get(2)?.has("C")).toBe(true);
    expect(voids.has(3)).toBe(false);
  });

  it("마이티는 무늬와 상관없이 낼 수 있어서 무늬가 떨어졌다는 뜻이 아니다", () => {
    const state = playedScene([
      [1, "C5"],
      [2, "SA"],
    ]);
    expect(inferFromPlays(viewOf(state, 0)).voids.has(2)).toBe(false);
  });
});

describe("남의 손패 추측", () => {
  it("장수를 맞추고, 떨어진 무늬는 주지 않는다", () => {
    const pool: Card[] = ["C2", "C3", "C4", "D2", "D3", "D4", "S2", "S3"];
    const needs = new Map([
      [1, 3],
      [2, 3],
      [-1, 2],
    ]);
    const inference = {
      voids: new Map([[1, new Set(["C" as const])]]),
      noJoker: new Set<number>(),
    };
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const hands = sampleHands(pool, needs, inference, rng);
      expect(hands.get(1)).toHaveLength(3);
      expect(hands.get(2)).toHaveLength(3);
      expect(hands.get(-1)).toHaveLength(2);
      expect(hands.get(1)?.some((c) => suitOf(c) === "C")).toBe(false);
      expect(
        [...hands.values()].flat().sort((a, b) => a.localeCompare(b)),
      ).toEqual([...pool].sort((a, b) => a.localeCompare(b)));
    }
  });
});

describe("2단계 봇", () => {
  it("고르는 카드는 늘 낼 수 있는 카드다", () => {
    const bot = createSearchBot({ worlds: 4 });
    const rng = createRng(3);
    let { state } = createMatch({ rules: standard5, seed: 11 });
    for (let guard = 0; guard < 400; guard++) {
      const seat = state.round.turn;
      if (seat === null || state.round.phase === "roundEnd") break;
      const view = viewOf(state, seat);
      const action = bot.decide(view, rng);
      const result = step(state, seat, action);
      expect(result.ok, JSON.stringify(action)).toBe(true);
      if (!result.ok) break;
      state = result.state;
    }
    expect(state.round.phase).toBe("roundEnd");
  });

  it.each(RULE_PRESETS.map((p) => [p.name, p.rules] as const))(
    "%s 규칙에서 오류 없이 판을 끝낸다",
    (_name, rules) => {
      const bots = Array.from({ length: rules.playerCount }, (_, i) =>
        i % 2 === 0 ? createSearchBot({ worlds: 3 }) : heuristicBot,
      );
      const result = simulate({ rules, seed: 5, bots, rounds: 2 });
      expect(
        result.roundsPlayed > 0 || result.state.round.phase === "gameOver",
      ).toBe(true);
    },
  );
});

describe("2단계 봇의 판 전체 계획", () => {
  /** 0번 손패를 정해 두고 나머지는 덱에서 차례로 나눈다 */
  function dealWith(mine: Card[]) {
    const rest = fullDeck().filter((c) => !mine.includes(c));
    const hands = [
      mine,
      ...[1, 2, 3, 4].map((i) => rest.slice((i - 1) * 10, i * 10)),
    ];
    return createMatch({
      rules: standard5,
      seed: 1,
      firstBeginner: 0,
      presetDeal: { hands, kitty: rest.slice(40) },
    }).state;
  }
  const bot = createSearchBot({ worlds: 4, planWorlds: 16 });

  it("아주 센 패면 그 무늬로 공약을 건다", () => {
    const state = dealWith([
      "JK",
      "DA",
      "SA",
      "SK",
      "SQ",
      "SJ",
      "S10",
      "S9",
      "HA",
      "CA",
    ]);
    const action = bot.decide(viewOf(state, 0), createRng(1));
    expect(action.type).toBe("bid");
    if (action.type === "bid") expect(action.goal.kiruda).toBe("S");
  });

  it("아주 약한 패면 포기한다", () => {
    const state = dealWith([
      "S2",
      "S3",
      "D2",
      "D4",
      "H2",
      "H3",
      "H5",
      "C2",
      "C10",
      "DJ",
    ]);
    expect(bot.decide(viewOf(state, 0), createRng(1)).type).toBe("pass");
  });

  it("교환과 프렌드 결정은 엔진이 받아 준다", () => {
    let state = createScenario({
      rules: standard5,
      phase: "exchange",
      declarer: 0,
      goal: { kiruda: "S", score: 13 },
      hands: [
        ["SA", "SK", "SQ", "S10", "S5", "HA", "H4", "D3", "C7", "C8"],
        ["D2", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "DJ", "DQ"],
        ["H2", "H3", "H5", "H6", "H7", "H8", "H9", "H10", "HJ", "HQ"],
        ["C2", "C3", "C4", "C5", "C6", "C9", "C10", "CJ", "CQ", "CK"],
        ["S2", "S3", "S4", "S6", "S7", "S8", "S9", "SJ", "HK", "DK"],
      ],
      kitty: ["JK", "DA", "CA"],
    });
    const rng = createRng(2);
    for (const kind of ["exchange", "friend"]) {
      const view = viewOf(state, 0);
      expect(view.decision?.kind).toBe(kind);
      const result = step(state, 0, bot.decide(view, rng));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
    // 버린 카드에 마이티·조커는 없다.
    expect(state.round.discarded).not.toContain("DA");
    expect(state.round.discarded).not.toContain("JK");
  });
});
