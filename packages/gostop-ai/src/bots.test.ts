import { createRng } from "@mighty/engine";
import {
  createGostopScenario,
  createMatch,
  GOSTOP3_RULES,
  MATGO_RULES,
  step,
  viewOf,
} from "@mighty/gostop-engine";
import { describe, expect, it } from "vitest";

import {
  gostopBeginnerBot,
  gostopBotFor,
  gostopExpertBot,
  gostopIntermediateBot,
} from "./bots";
import { determinize } from "./search";
import { playGame } from "./simulate";

const ONE = { ...MATGO_RULES, rounds: 1 };

describe("고스톱 컴퓨터", () => {
  it.each([
    ["맞고", { ...MATGO_RULES, rounds: 1 }],
    ["3명", { ...GOSTOP3_RULES, rounds: 1 }],
  ] as const)("%s: 세 단계가 끝까지 둘 수 있는 수만 둔다", (_n, rules) => {
    for (let seed = 1; seed <= 2; seed++) {
      const bots = [gostopExpertBot, gostopBeginnerBot, gostopIntermediateBot];
      const end = playGame(bots.slice(0, rules.players), rules, seed);
      expect(end.phase).toBe("gameOver");
    }
  });

  it("단계 번호로 고른다", () => {
    expect(gostopBotFor(0).name).toBe("입문");
    expect(gostopBotFor(1).name).toBe("중수");
    expect(gostopBotFor(2).name).toBe("고수");
  });

  it("중수·고수는 고도리를 채우는 카드를 먹는다", () => {
    const state = createGostopScenario({
      rules: ONE,
      hands: [
        ["08p", "05p", "06q"],
        ["10p", "10q", "11p"],
      ],
      floor: ["08a", "05q", "06p"],
      deck: ["09p", "12r", "12a", "09q", "04q", "03q"],
      captured: [["02a", "04a"], []],
    });
    for (const bot of [gostopIntermediateBot, gostopExpertBot])
      expect(bot.decide(viewOf(state, 0), createRng(1))).toEqual({
        type: "play",
        card: "08p",
      });
  });

  it("중수는 상대 점수가 가까우면 스톱한다", () => {
    const state = createGostopScenario({
      rules: ONE,
      hands: [
        ["08a", "05p", "06p", "07q"],
        ["10p", "10q", "11p", "11q"],
      ],
      floor: ["08p", "07p"],
      deck: ["09p", "12r", "12a", "09q", "04q", "03q", "05q", "06q"],
      captured: [
        ["01r", "02r", "03r", "02a", "04a"],
        ["01g", "03g", "11g", "06r", "09r", "10r"],
      ],
    });
    const r = step(state, 0, { type: "play", card: "08a" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.stage).toBe("goStop");
    expect(
      gostopIntermediateBot.decide(viewOf(r.state, 0), createRng(1)),
    ).toEqual({ type: "stop" });
  });

  it("못 본 카드를 채운 세계는 보이는 것과 맞고 장수가 같다", () => {
    const { state } = createMatch(GOSTOP3_RULES, 9);
    const view = viewOf(state, 1);
    const world = determinize(view, createRng(3));
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.hands[1]).toEqual(state.hands[1]);
    expect(world.hands.map((h) => h.length)).toEqual([7, 7, 7]);
    expect(world.deck).toHaveLength(21);
    expect(world.floor).toEqual(state.floor);
    const all = [...world.hands.flat(), ...world.deck, ...world.floor];
    expect(new Set(all).size).toBe(48);
  });
});
