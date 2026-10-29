import {
  type BaseballRules,
  candidatesFor,
  cluesOf,
  commitmentOf,
  createBaseballScenario,
  createMatch,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/baseball-engine";
import { createRng } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  BASEBALL_BOTS,
  baseballBotFor,
  baseballExpertBot,
  baseballIntermediateBot,
  botKnowsSecret,
} from "./bots";
import { playGame } from "./simulate";

const RULE_SETS: BaseballRules[] = [
  STANDARD_RULES,
  { ...STANDARD_RULES, digits: 4, zero: true, winsToFinish: 2 },
  { ...STANDARD_RULES, fair: false, zero: true },
  { ...STANDARD_RULES, mode: "puzzle" },
];

describe("숫자야구 컴퓨터", () => {
  it("세 단계 모두 여러 규칙에서 게임을 끝까지 하고, 답과 공개는 늘 정직하다", () => {
    for (const rules of RULE_SETS)
      for (const [i, a] of BASEBALL_BOTS.entries()) {
        const b = BASEBALL_BOTS[(i + 1) % 3] ?? a;
        const end = playGame([a, b], rules, 11 + i);
        expect(end.phase).toBe("gameOver");
        expect(end.result?.kind).not.toBe("cheat");
        for (const r of end.reveals)
          if (r) expect(r).toMatchObject({ matches: true, wrongAt: null });
      }
  });

  it("같은 시드면 같은 수를 둔다", () => {
    const a = playGame(
      [baseballExpertBot, baseballBotFor(0)],
      STANDARD_RULES,
      3,
    );
    const b = playGame(
      [baseballExpertBot, baseballBotFor(0)],
      STANDARD_RULES,
      3,
    );
    expect(a).toEqual(b);
  });

  it("중수는 늘 지금까지 답과 어긋나지 않는 후보를 묻는다", () => {
    const rules: BaseballRules = { ...STANDARD_RULES, mode: "puzzle" };
    for (let seed = 1; seed <= 5; seed++) {
      const end = playGame(
        [baseballIntermediateBot, baseballIntermediateBot],
        rules,
        seed,
      );
      const asked = end.guesses.filter((g) => g.seat === 0);
      for (const [k, g] of asked.entries()) {
        const before = candidatesFor(
          rules,
          cluesOf({ guesses: asked.slice(0, k) }, 0),
        );
        expect(before).toContain(g.guess);
      }
    }
  });

  it("후보가 하나 남으면 고수·중수는 그 수를 묻는다(이기는 수를 놓치지 않는다)", () => {
    const state = createBaseballScenario({
      rules: STANDARD_RULES,
      secret: "749",
      guesses: ["123", "456", "789", "947", "794"],
    });
    const view = viewOf(state, 0);
    const left = candidatesFor(STANDARD_RULES, cluesOf(state, 0));
    expect(left).toEqual(["749"]);
    for (const bot of [baseballIntermediateBot, baseballExpertBot])
      expect(bot.decide(view, createRng(1))).toEqual({
        type: "guess",
        guess: "749",
      });
  });

  it("사람이 정한 비밀은 모르므로 그 자리 대신 답하지 않는다", () => {
    let { state } = createMatch(STANDARD_RULES, 9);
    const human = commitmentOf("123", "0".repeat(32));
    for (const seat of [0, 1]) {
      const action =
        seat === 0
          ? { type: "commit" as const, hash: human }
          : baseballBotFor(1).decide(viewOf(state, 1), createRng(1));
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    // 차례인 쪽이 묻고, 상대가 답할 차례로 만든다.
    const asker = state.turn;
    const r = step(state, asker, {
      type: "guess",
      guess: asker === 0 ? "456" : "789",
    });
    if (!r.ok) throw new Error(r.error);
    const answerer = 1 - asker;
    expect(botKnowsSecret(viewOf(r.state, answerer))).toBe(answerer === 1);
  });
});
