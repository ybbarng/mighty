import {
  createChessScenario,
  createMatch,
  STANDARD_RULES,
  sanToMove,
  step,
  viewOf,
} from "@mighty/chess-engine";
import { createRng } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  chessBeginnerBot,
  chessBotFor,
  chessExpertBot,
  chessIntermediateBot,
} from "./bots";
import { playGame } from "./simulate";

const BOTS = [chessBeginnerBot, chessIntermediateBot, chessExpertBot];

/** 장면에서 봇이 고른 수 */
function choose(bot: (typeof BOTS)[number], fen: string, seed = 5) {
  const state = createChessScenario({ fen });
  return bot.decide(viewOf(state, 0), createRng(seed));
}

function moveOf(fen: string, san: string) {
  const move = sanToMove(createChessScenario({ fen }).position, san);
  if (!move) throw new Error(san);
  return { type: "move", ...move };
}

describe("체스 컴퓨터", () => {
  it("입문끼리 처음부터 끝까지 규칙에 맞는 수만 둔다", () => {
    const end = playGame(
      [chessBeginnerBot, chessBeginnerBot],
      STANDARD_RULES,
      3,
    );
    expect(end.phase).toBe("gameOver");
    expect(end.result).not.toBeNull();
  });

  it.each(BOTS.slice(1).map((b) => [b.name, b] as const))(
    "%s: 몇 수 동안 규칙에 맞는 수만 둔다",
    (_name, bot) => {
      let { state } = createMatch(STANDARD_RULES, 4);
      const rng = createRng(1);
      for (let i = 0; i < 12 && state.phase === "play"; i++) {
        const seat =
          state.position.turn === "w" ? state.whiteSeat : 1 - state.whiteSeat;
        const result = step(state, seat, bot.decide(viewOf(state, seat), rng));
        expect(result.ok).toBe(true);
        if (result.ok) state = result.state;
      }
    },
  );

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 공짜로 잡을 수 있는 퀸을 잡는다",
    (_name, bot) => {
      const fen = "4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1";
      expect(choose(bot, fen)).toEqual(moveOf(fen, "Rxd5"));
    },
  );

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 한 수 메이트를 놓치지 않는다",
    (_name, bot) => {
      const fen = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
      expect(choose(bot, fen)).toEqual(moveOf(fen, "Ra8#"));
    },
  );

  it("중수·고수는 지켜진 폰을 퀸으로 잡지 않는다", () => {
    // d5 폰은 e6 폰이 지킨다. 퀸으로 잡으면 퀸을 잃는다.
    const fen = "4k3/8/4p3/3p4/8/8/3Q4/4K3 w - - 0 1";
    for (const bot of [chessIntermediateBot, chessExpertBot])
      expect(choose(bot, fen)).not.toEqual(moveOf(fen, "Qxd5"));
  });

  it("고수는 두 수 메이트를 찾는다", () => {
    // 룩 하나로 7번째 줄을 막고 다른 룩으로 8번째 줄에서 메이트(1. Ra7 … 2. Rb8#)
    const fen = "6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1";
    let state = createChessScenario({ fen });
    const rng = createRng(3);
    for (let i = 0; i < 3 && state.phase === "play"; i++) {
      const seat = state.position.turn === "w" ? 0 : 1;
      const bot = seat === 0 ? chessExpertBot : chessIntermediateBot;
      const r = step(state, seat, bot.decide(viewOf(state, seat), rng));
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.result).toEqual({ kind: "checkmate", seat: 0 });
  });

  it("고수는 같은 시드면 같은 수를 둔다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const view = viewOf(state, state.whiteSeat);
    expect(chessExpertBot.decide(view, createRng(9))).toEqual(
      chessExpertBot.decide(view, createRng(9)),
    );
  });

  it("단계 번호로 컴퓨터를 고른다", () => {
    expect(chessBotFor(0)).toBe(chessBeginnerBot);
    expect(chessBotFor(1)).toBe(chessIntermediateBot);
    expect(chessBotFor(2)).toBe(chessExpertBot);
  });
});
