import {
  type Card,
  createRng,
  createScenario,
  type MatchState,
  presetRules,
  RULE_PRESETS,
  step,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { estimatePoints } from "./hand";
import { createRuleBot, heuristicBot } from "./heuristic-bot";
import { randomBot } from "./random-bot";
import { simulate } from "./simulate";

const standard5 = presetRules("standard5");

describe("패 세기 어림", () => {
  it("마이티·조커와 긴 기루다를 가진 패는 공약 이상을 어림한다", () => {
    const strong = [
      "SA",
      "JK",
      "HA",
      "HK",
      "HQ",
      "H9",
      "H5",
      "DA",
      "C2",
      "D3",
    ] as const;
    expect(estimatePoints(standard5, strong, "H")).toBeGreaterThanOrEqual(14);
  });

  it("높은 카드가 없는 패는 최소 공약에 못 미친다", () => {
    const weak = [
      "S2",
      "S5",
      "H3",
      "H7",
      "D4",
      "D8",
      "C5",
      "C9",
      "S9",
      "H10",
    ] as const;
    expect(estimatePoints(standard5, weak, "S")).toBeLessThan(13);
  });
});

describe("봇은 모든 기본 규칙에서 오류 없이 대국을 끝낸다", () => {
  it.each(RULE_PRESETS.map((p) => [p.name, p.rules] as const))(
    "%s",
    (_name, rules) => {
      const bots = Array.from(
        { length: rules.playerCount },
        () => heuristicBot,
      );
      for (const seed of [1, 2, 3]) {
        const result = simulate({ rules, seed, bots, rounds: 10 });
        expect(
          result.roundsPlayed > 0 || result.state.round.phase === "gameOver",
        ).toBe(true);
      }
    },
  );
});

describe("규칙 기반 봇의 실력", () => {
  it("무작위 봇과 섞어 앉히면 규칙 기반 봇이 돈을 더 번다", () => {
    let heuristicTotal = 0;
    let randomTotal = 0;
    for (let seed = 0; seed < 40; seed++) {
      // 자리 효과를 없애려고 시드마다 봇 자리를 바꾼다.
      const heuristicSeats = seed % 2 === 0 ? [0, 2, 4] : [1, 3];
      const bots = [0, 1, 2, 3, 4].map((s) =>
        heuristicSeats.includes(s) ? heuristicBot : randomBot,
      );
      const result = simulate({ rules: standard5, seed, bots, rounds: 8 });
      result.moneyDelta.forEach((delta, seat) => {
        if (heuristicSeats.includes(seat))
          heuristicTotal += delta / heuristicSeats.length;
        else randomTotal += delta / (5 - heuristicSeats.length);
      });
    }
    expect(heuristicTotal).toBeGreaterThan(randomTotal);
  });

  it("규칙 기반 봇끼리 하면 주공이 공약을 꽤 자주 지킨다", () => {
    let wins = 0;
    let rounds = 0;
    for (let seed = 0; seed < 20; seed++) {
      const result = simulate({
        rules: standard5,
        seed,
        bots: Array(5).fill(heuristicBot),
        rounds: 10,
      });
      wins += result.declarerWins;
      rounds += result.declarerRounds;
    }
    const rate = wins / rounds;
    // 너무 낮으면 공약을 무리하게 부르고, 너무 높으면 너무 소심하게 부른다는 뜻이다.
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.9);
  });
});

describe("정석", () => {
  const rules = presetRules("standard5");

  it("마공: 야당이 선이면 마이티 무늬의 낮은 카드를 낸다", () => {
    const state = createScenario({
      rules,
      phase: "play",
      declarer: 0,
      goal: { kiruda: "H", score: 13 },
      friend: { kind: "card", card: "HA" },
      leader: 2,
      hands: [
        ["SA", "H2"],
        ["HA", "H3"],
        ["S9", "D3"],
        ["C5", "C6"],
        ["C7", "C8"],
      ],
    });
    const view = viewOf(state, 2);
    expect(
      createRuleBot({ book: ["mightyAttack"] }).decide(view, createRng(1)),
    ).toMatchObject({
      type: "play",
      card: "S9",
    });
    expect(createRuleBot().decide(view, createRng(1))).toMatchObject({
      type: "play",
      card: "D3",
    });
  });

  it("무늬 비우기: A 없는 짧은 무늬를 통째로 묻는다", () => {
    const state = createScenario({
      rules,
      phase: "exchange",
      declarer: 0,
      goal: { kiruda: "S", score: 13 },
      hands: [
        ["SA", "SK", "SQ", "S10", "S5", "HA", "HK", "H4", "D9", "D8"],
        [],
        [],
        [],
        [],
      ],
      kitty: ["CQ", "H7", "D2"],
    });
    const action = createRuleBot({ book: ["voidSuit"] }).decide(
      viewOf(state, 0),
      createRng(1),
    );
    expect(action.type).toBe("exchange");
    // ♣Q 한 장뿐인 ♣를 비운다.
    if (action.type === "exchange") expect(action.discard).toContain("CQ");
  });

  describe("초간: ♣ 선에 ♣가 없어 ♥(기루다)로 간을 친다", () => {
    const cut = createRuleBot({ book: ["kirudaCut"] });
    const plain = createRuleBot();
    /** 기루다 ♥, 마이티 ♠A. 0번이 주공, ◆A를 가진 1번이 프렌드 */
    function scene(leader: number, hands: Card[][], plays: [number, Card][]) {
      let state: MatchState = createScenario({
        rules,
        phase: "play",
        declarer: 0,
        goal: { kiruda: "H", score: 13 },
        friend: { kind: "card", card: "DA" },
        leader,
        hands,
      });
      for (const [seat, card] of plays) {
        const result = step(state, seat, { type: "play", card });
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
      return state;
    }
    const played = (state: MatchState, seat: number, bot = cut) =>
      bot.decide(viewOf(state, seat), createRng(1));

    it("기루다가 두 장뿐인 야당은 10·J로 쳐 점수를 먼저 챙긴다", () => {
      const state = scene(
        0,
        [
          ["CA", "S5", "S6"],
          ["C2", "DA", "D2"],
          ["H3", "H10", "D5"],
          ["C3", "D6", "D7"],
          ["C4", "D8", "D9"],
        ],
        [
          [0, "CA"],
          [1, "C2"],
        ],
      );
      expect(played(state, 2)).toMatchObject({ card: "H10" });
      expect(played(state, 2, plain)).toMatchObject({ card: "H3" });
    });

    it("기루다가 넉넉한 야당은 가장 싼 기루다로 친다", () => {
      const state = scene(
        0,
        [
          ["CA", "S5", "S6"],
          ["C2", "DA", "D2"],
          ["H3", "H10", "H4"],
          ["C3", "D6", "D7"],
          ["C4", "D8", "D9"],
        ],
        [
          [0, "CA"],
          [1, "C2"],
        ],
      );
      expect(played(state, 2)).toMatchObject({ card: "H3" });
    });

    it("뒤에 다시 자를 사람이 없으면 10·J로 쳐 점수를 챙긴다", () => {
      const state = scene(
        0,
        [
          ["CA", "S5", "S6"],
          ["C2", "DA", "D2"],
          ["C5", "D3", "D5"],
          ["C3", "D6", "D7"],
          ["H3", "H10", "H4"],
        ],
        [
          [0, "CA"],
          [1, "C2"],
          [2, "C5"],
          [3, "C3"],
        ],
      );
      expect(played(state, 4)).toMatchObject({ card: "H10" });
    });

    it("프렌드는 점수가 걸리면 밖의 기루다로 넘을 수 없는 카드로 친다", () => {
      // 밖에 남은 ♥ 가운데 가장 높은 것은 2번의 ♥K다. ♥5로 치면 다시 잘린다.
      const state = scene(
        4,
        [
          ["C10", "S5", "S6"],
          ["H5", "HA", "DA"],
          ["HK", "D3", "D4"],
          ["C3", "D6", "D7"],
          ["CK", "D8", "D9"],
        ],
        [
          [4, "CK"],
          [0, "C10"],
        ],
      );
      expect(played(state, 1)).toMatchObject({ card: "HA" });
      expect(played(state, 1, plain)).toMatchObject({ card: "H5" });
    });
  });
});
