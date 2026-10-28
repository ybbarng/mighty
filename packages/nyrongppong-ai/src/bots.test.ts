import { createRng } from "@mighty/engine";
import {
  createNyrongppongScenario,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";
import {
  determinize,
  discardFromThree,
  nyrongppongExpertBot,
  stopChance,
  unseenCards,
} from "./expert";
import {
  nyrongppongBeginnerBot,
  nyrongppongBotFor,
  nyrongppongIntermediateBot,
} from "./index";
import { playGame } from "./simulate";

const ALL = [
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
  nyrongppongExpertBot,
];

describe("모든 단계", () => {
  it.each(ALL.map((b) => [b.name, b] as const))(
    "%s: 할 수 있는 행동만 해서 2~5인 게임을 끝낸다",
    (_name, bot) => {
      for (const players of [2, 3, 5]) {
        const end = playGame(
          Array.from({ length: players }, () => bot),
          { ...STANDARD_RULES, players, rounds: 2 },
          players * 11,
        );
        expect(end.phase).toBe("gameOver");
      }
    },
  );

  it.each(ALL.map((b) => [b.name, b] as const))(
    "%s: 여섯 장이 약이면 낸다",
    (_name, bot) => {
      const s = createNyrongppongScenario({
        hands: [
          ["01g", "01r", "05a", "05p", "09a", "09p"],
          ["04a", "06a", "08g", "09r", "11g"],
        ],
      });
      expect(bot.decide(viewOf(s, 0), createRng(1))).toEqual({
        type: "declare",
      });
    },
  );

  it("단계 번호로 고른다", () => {
    expect(nyrongppongBotFor(0)).toBe(nyrongppongBeginnerBot);
    expect(nyrongppongBotFor(1)).toBe(nyrongppongIntermediateBot);
    expect(nyrongppongBotFor(2)).toBe(nyrongppongExpertBot);
  });
});

describe("중수", () => {
  it("짝은 남기고 짝이 아닌 가장 큰 달을 버린다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["12g", "12a", "02a", "07a", "10a", "03g"],
        ["04a", "06a", "08g", "09r", "11g"],
      ],
    });
    expect(
      nyrongppongIntermediateBot.decide(viewOf(s, 0), createRng(1)),
    ).toEqual({ type: "discard", card: "10a" });
  });

  it("뽕할 수 있으면 늘 부른다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["03g", "02a", "04a", "05a", "07a", "10a"],
        ["03r", "03p", "06a", "08g", "11g"],
      ],
    });
    const r = step(s, 0, { type: "discard", card: "03g" });
    if (!r.ok) throw new Error(r.error);
    expect(
      nyrongppongIntermediateBot.decide(viewOf(r.state, 1), createRng(1)),
    ).toEqual({ type: "call" });
  });
});

describe("고수", () => {
  it("보이지 않는 카드만 상대 손패와 더미로 나눠 짐작한다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["03g", "02a", "04a", "05a", "07a", "10a"],
        ["03r", "03p", "06a", "08g", "11g"],
        ["01g", "06r", "08a", "10r", "12a"],
      ],
      pile: ["11d"],
    });
    const view = viewOf(s, 0);
    const unseen = unseenCards(view);
    expect(unseen).toHaveLength(48 - 6 - 1);
    const guess = determinize(view, unseen, createRng(5));
    expect(guess.hands[0]).toEqual(view.hand);
    expect(guess.hands.map((h) => h.length)).toEqual([6, 5, 5]);
    expect(guess.deck).toHaveLength(48 - 16 - 1);
    expect(new Set([...guess.hands.flat(), ...guess.deck]).size).toBe(47);
  });

  it("상대가 모두 다섯 장이면 낮은 두 장으로 스톱한다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["01g", "02a"],
        ["04a", "06a", "08g", "09r", "11g"],
        ["01r", "06r", "08a", "10r", "12a"],
      ],
      melds: [[["07a", "07r", "07p"]], [], []],
    });
    expect(stopChance(viewOf(s, 0), createRng(1))).toBeGreaterThan(0.9);
    expect(nyrongppongExpertBot.decide(viewOf(s, 0), createRng(1))).toEqual({
      type: "stop",
    });
  });

  it("두 장만 든 상대가 있으면 합이 높을 때 스톱하지 않는다", () => {
    const s = createNyrongppongScenario({
      hands: [
        ["04a", "05a"],
        ["01r", "02r"],
        ["01g", "06r", "08a", "10r", "12a"],
      ],
      melds: [[["07a", "07r", "07p"]], [["08g", "08p", "08q"]], []],
    });
    expect(nyrongppongExpertBot.decide(viewOf(s, 0), createRng(1))).toEqual({
      type: "draw",
    });
  });

  it("뽕한 뒤 석 장: 낮은 짝은 남기고, 높은 짝이면 큰 카드를 버려 낮은 두 장을 남긴다", () => {
    expect(discardFromThree(["01g", "01r", "09a"])).toBe("09a");
    expect(discardFromThree(["11g", "11d", "02a"])).toBe("11g");
    expect(discardFromThree(["02a", "05a", "10a"])).toBe("10a");
  });
});
