import { createRng } from "@mighty/engine";
import {
  chainCommit,
  createMatch,
  createYutScenario,
  derivedSeed,
  HOME,
  STANDARD_RULES,
  step,
  TEAM_RULES,
  viewOf,
  type YutRules,
} from "@mighty/yut-engine";
import { describe, expect, it } from "vitest";

import {
  botKnowsChain,
  YUT_BOTS,
  yutBotFor,
  yutExpertBot,
  yutIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

describe("세 단계가 끝까지 둔다", () => {
  for (const bot of YUT_BOTS) {
    for (const [label, rules] of [
      ["1:1", STANDARD_RULES],
      ["2:2 편", TEAM_RULES],
      ["3인", { ...STANDARD_RULES, players: 3 }],
    ] as [string, YutRules][]) {
      it(`${bot.name} · ${label}`, () => {
        const bots = Array.from({ length: rules.players }, () => bot);
        const state = playGame(bots, rules, 7);
        expect(state.phase).toBe("gameOver");
        expect(state.result?.kind).toBe("finish");
      });
    }
  }
});

describe("같은 화면이면 같은 수", () => {
  it("중수·고수는 시드와 상관없이 같은 수를 둔다", () => {
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: 3 },
        { side: 0, point: 8 },
        { side: 1, point: 6 },
      ],
      pending: [2, 3],
    });
    const view = viewOf(scene, 0);
    for (const bot of [yutIntermediateBot, yutExpertBot]) {
      const a = bot.decide(view, createRng(1));
      const b = bot.decide(view, createRng(99));
      expect(a).toEqual(b);
    }
  });
});

describe("수 고르기", () => {
  it("잡을 수 있으면 중수·고수는 잡는다", () => {
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: 2 },
        { side: 0, point: 12 },
        { side: 1, point: 5 },
        { side: 1, point: 5 },
      ],
      pending: [3],
    });
    for (const bot of [yutIntermediateBot, yutExpertBot]) {
      const action = bot.decide(viewOf(scene, 0), createRng(1));
      expect(action).toEqual({ type: "move", value: 3, from: 2 });
    }
  });

  it("고수는 마지막 말을 낼 수 있으면 낸다", () => {
    const scene = createYutScenario({
      rules: { ...STANDARD_RULES, pieces: 2 },
      pieces: [
        { side: 0, point: -2 },
        { side: 0, point: 18 },
        { side: 1, point: 16 },
      ],
      pending: [3],
    });
    const action = yutExpertBot.decide(viewOf(scene, 0), createRng(1));
    expect(action).toEqual({ type: "move", value: 3, from: 18 });
  });

  it("사람이 만든 사슬은 대신 공개하지 않는다", () => {
    let { state } = createMatch(STANDARD_RULES, 4);
    // 0번 자리는 사람이 자기 씨앗으로 약속했다.
    state = (
      step(state, 0, {
        type: "commit",
        hash: chainCommit("ab".repeat(32)),
      }) as { ok: true; state: typeof state }
    ).state;
    const seed1 = derivedSeed(state.keys[1] as string, 0);
    state = (
      step(state, 1, { type: "commit", hash: chainCommit(seed1) }) as {
        ok: true;
        state: typeof state;
      }
    ).state;
    state = (
      step(state, state.turn, { type: "throw" }) as {
        ok: true;
        state: typeof state;
      }
    ).state;
    expect(botKnowsChain(viewOf(state, 0))).toBe(false);
    expect(botKnowsChain(viewOf(state, 1))).toBe(true);
  });

  it("단계 번호로 고른다", () => {
    expect(yutBotFor(0).name).toBe("입문");
    expect(yutBotFor(2).name).toBe("고수");
    expect(yutBotFor(9).name).toBe("고수");
    // 새 말 하나만 나갈 수 있는 장면에서는 모두 그 수를 둔다.
    const scene = createYutScenario({ pieces: [], pending: [1] });
    for (const bot of YUT_BOTS)
      expect(bot.decide(viewOf(scene, 0), createRng(3))).toEqual({
        type: "move",
        value: 1,
        from: HOME,
      });
  });
});
