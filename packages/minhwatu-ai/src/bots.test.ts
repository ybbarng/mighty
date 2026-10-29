import { createRng } from "@mighty/engine";
import {
  createMinhwatuScenario,
  STANDARD_RULES,
  viewOf,
} from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import {
  createMinhwatuExpertBot,
  minhwatuBeginnerBot,
  minhwatuExpertBot,
  minhwatuIntermediateBot,
  sampleState,
  unseenCards,
} from "./bots";
import { playGame } from "./simulate";

const BOTS = [minhwatuBeginnerBot, minhwatuIntermediateBot, minhwatuExpertBot];

describe("민화투 컴퓨터", () => {
  // 끝까지 두기는 고수와 같은 길(무작위로 채워 보고 판 끝까지 두기)을 둬 보는 양만 줄여 돈다.
  // 합법 수만 두는지는 둬 보는 양과 상관없다
  it.each(
    [
      minhwatuBeginnerBot,
      minhwatuIntermediateBot,
      createMinhwatuExpertBot(40, 4),
    ].map((b) => [b.name, b] as const),
  )("%s: 합법 수로 게임을 끝까지 둔다(2~4인)", (_name, bot) => {
    for (const players of [2, 3, 4] as const) {
      const rules = { ...STANDARD_RULES, players, rounds: 1 };
      const end = playGame(
        Array.from({ length: players }, (_, i) =>
          i === 0 ? bot : minhwatuBeginnerBot,
        ),
        rules,
        players * 11,
      );
      expect(end.phase).toBe("gameOver");
    }
  });

  it("같은 화면과 같은 난수면 같은 수를 둔다(온라인 검증)", () => {
    const state = createMinhwatuScenario({
      hands: [["01g", "03p", "08a", "10q"], ["12a"], ["11p"]],
      floor: ["01p", "08p", "10p", "03r"],
      deck: ["05p", "06p", "07p"],
    });
    const view = viewOf(state, 0);
    for (const bot of BOTS)
      expect(bot.decide(view, createRng(3))).toEqual(
        bot.decide(view, createRng(3)),
      );
  });

  it("중수·고수는 광을 두고 피를 먹지 않는다", () => {
    const state = createMinhwatuScenario({
      hands: [["01p", "11p"], ["12a"], ["02p"]],
      floor: ["01g", "11q"],
      deck: ["05p", "06p", "07p"],
    });
    const view = viewOf(state, 0);
    for (const bot of [minhwatuIntermediateBot, minhwatuExpertBot])
      expect(bot.decide(view, createRng(1))).toEqual({
        type: "play",
        card: "01p",
      });
  });

  it("중수는 약을 바로 마무리하고, 고수는 미뤄도 안전하면 광부터 먹는다", () => {
    // 10월 마지막 장(10q)을 내가 쥐고 있어 아무도 10p를 먹을 수 없다.
    const state = createMinhwatuScenario({
      hands: [["10q", "11g"], ["12a"], ["02p"]],
      floor: ["10p", "11p"],
      deck: ["05p", "06p", "07p"],
      captured: [["10a", "10r"], [], []],
    });
    const view = viewOf(state, 0);
    expect(minhwatuIntermediateBot.decide(view, createRng(1))).toEqual({
      type: "play",
      card: "10q",
    });
    expect(minhwatuExpertBot.decide(view, createRng(1))).toEqual({
      type: "play",
      card: "11g",
    });
  });

  it("고수는 남이 먹을 수 있으면 약을 먼저 마무리한다", () => {
    // 3월 다른 카드(광·피)를 남이 쥐었을 수 있어 3월 띠를 빼앗길 수 있다.
    const state = createMinhwatuScenario({
      hands: [
        ["03p", "11g", "02p"],
        ["12a", "03g", "06q"],
        ["04p", "05p", "03q"],
      ],
      floor: ["03r", "11p", "06p"],
      deck: ["07p", "08p", "09p", "07q", "09q", "04q"],
      captured: [["01r", "02r"], [], []],
    });
    expect(minhwatuExpertBot.decide(viewOf(state, 0), createRng(1))).toEqual({
      type: "play",
      card: "03p",
    });
  });

  it("중수는 남의 약을 막는다", () => {
    // 1번이 홍단 둘을 모았다. 3월 띠를 먹어 막는다(2월 피보다 낫다)
    const state = createMinhwatuScenario({
      hands: [["03p", "06p"], ["12a"], ["11p"]],
      floor: ["03r", "06r"],
      deck: ["05p", "07p", "09p"],
      captured: [[], ["01r", "02r"], []],
    });
    expect(
      minhwatuIntermediateBot.decide(viewOf(state, 0), createRng(1)),
    ).toEqual({ type: "play", card: "03p" });
  });
});

describe("모르는 카드 채우기", () => {
  it("남의 손패와 더미 장수만큼 채운다", () => {
    const state = createMinhwatuScenario({
      hands: [["01g"], ["12a", "02p"], ["11p"]],
      floor: ["03r"],
      deck: ["05p", "06p"],
    });
    const view = viewOf(state, 0);
    const world = sampleState(view, createRng(9));
    expect(world.hands.map((h) => h.length)).toEqual([1, 2, 1]);
    expect(world.deck).toHaveLength(2);
    expect(world.hands[0]).toEqual(["01g"]);
    expect(unseenCards(view)).toHaveLength(48 - 2);
  });
});
