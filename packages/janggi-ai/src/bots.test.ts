import { createRng } from "@mighty/engine";
import {
  createJanggiScenario,
  createMatch,
  type Piece,
  pointAt,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/janggi-engine";
import { describe, expect, it } from "vitest";

import {
  janggiBeginnerBot,
  janggiBotFor,
  janggiExpertBot,
  janggiIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

const BOTS = [janggiBeginnerBot, janggiIntermediateBot, janggiExpertBot];

describe("장기 컴퓨터", () => {
  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 상차림부터 판 끝까지 규칙에 맞는 수만 둔다",
    (_name, bot) => {
      const end = playGame([bot, janggiBeginnerBot], STANDARD_RULES, 3);
      expect(end.phase).toBe("gameOver");
      expect(end.result).not.toBeNull();
    },
  );

  it("상차림 차례에는 상차림을 고른다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const han = 1 - state.choSeat;
    const action = janggiExpertBot.decide(viewOf(state, han), createRng(1));
    expect(action.type).toBe("setup");
    expect(step(state, han, action).ok).toBe(true);
  });

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 공짜로 잡을 수 있는 차를 잡는다",
    (_name, bot) => {
      const pieces: Record<string, Piece> = {
        "95": "cK",
        "26": "hK",
        "71": "cR",
        "41": "hR",
      };
      const state = createJanggiScenario({ pieces });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({
        type: "move",
        from: pointAt("71"),
        to: pointAt("41"),
      });
    },
  );

  it("고수와 중수는 한 수 외통을 놓치지 않는다", () => {
    const pieces: Record<string, Piece> = {
      "04": "cK",
      "25": "hK",
      "69": "hR",
      "98": "hR",
    };
    for (const bot of [janggiIntermediateBot, janggiExpertBot]) {
      const state = createJanggiScenario({ pieces, me: "h" });
      const action = bot.decide(viewOf(state, 0), createRng(9));
      const result = step(state, 0, action);
      expect(result.ok && result.state.result?.kind).toBe("checkmate");
    }
  });

  it("단계 번호로 컴퓨터를 고른다", () => {
    expect(janggiBotFor(0)).toBe(janggiBeginnerBot);
    expect(janggiBotFor(1)).toBe(janggiIntermediateBot);
    expect(janggiBotFor(2)).toBe(janggiExpertBot);
  });
});
