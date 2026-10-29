import {
  createBadukScenario,
  pointAt,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/baduk-engine";
import { createRng } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  badukBeginnerBot,
  badukBotFor,
  badukExpertBot,
  badukIntermediateBot,
  createBadukIntermediateBot,
  createBadukSearchBot,
} from "./bots";
import { FastBoard } from "./fast-board";
import { playGame } from "./simulate";

const BOTS = [badukBeginnerBot, badukIntermediateBot, badukExpertBot];
const at = (name: string) => pointAt(name, 9);

describe("빠른 판", () => {
  it("따내기·자살수·단순 패를 엔진과 같게 본다", () => {
    // 가운데 패 모양: 흑이 E6에 두면 백 D6을 따내고, 백은 바로 되따낼 수 없다.
    const s = createBadukScenario({
      black: ["D7", "C6", "D5"],
      white: ["E7", "D6", "F6", "E5"],
    });
    const board = new FastBoard(9, s.board, 1);
    expect(board.isLegal(at("E6"))).toBe(true);
    expect(board.play(at("E6"))).toBe(1);
    expect(board.cells[at("D6")]).toBe(0);
    expect(board.isLegal(at("D6"))).toBe(false);
    board.play(at("A1"));
    board.play(at("J9"));
    expect(board.isLegal(at("D6"))).toBe(true);
    // 자살수
    const corner = new FastBoard(
      9,
      createBadukScenario({ black: ["B9", "A8"], white: [] }).board,
      2,
    );
    expect(corner.isLegal(at("A9"))).toBe(false);
    expect(corner.isEye(at("A9"), 1)).toBe(true);
  });

  it("자리 세기는 엔진과 같다", () => {
    const s = createBadukScenario({
      black: ["C9", "C8", "C7", "C6", "C5", "C4", "C3", "C2", "C1"],
      white: ["E9", "E8", "E7", "E6", "E5", "E4", "E3", "E2", "E1"],
    });
    // 흑 9 + 18 = 27, 백 9 + 36 = 45, 덤 7.5
    expect(new FastBoard(9, s.board).score(7.5)).toBe(27 - 45 - 7.5);
  });
});

describe("바둑 컴퓨터", () => {
  // 끝까지 두는 시험은 중수·고수와 같은 길(뻔한 수 → 몬테카를로 / 나무 탐색)을 둬 보는 판 수만 줄여 돈다.
  // 규칙에 맞는 수만 두는지는 판 수와 상관없다. 실제 단계의 수 판단은 아래 장면 시험이 본다.
  it.each(
    [
      badukBeginnerBot,
      createBadukIntermediateBot(200),
      createBadukSearchBot(200),
    ].map((b) => [b.name, b] as const),
  )("%s: 판 끝까지 규칙에 맞는 수만 둔다", (_name, bot) => {
    const end = playGame([bot, badukBeginnerBot], STANDARD_RULES, 3);
    expect(end.phase).toBe("gameOver");
    expect(end.result?.kind).toBe("score");
  });

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 단수에 걸린 석 점을 따낸다",
    (_name, bot) => {
      const state = createBadukScenario({
        black: ["D6", "E6", "F6", "D4", "E4", "F4", "C5"],
        white: ["D5", "E5", "F5"],
      });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({ type: "place", at: at("G5") });
    },
  );

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 단수에 걸린 내 석 점을 살린다",
    (_name, bot) => {
      const state = createBadukScenario({
        black: ["D5", "E5", "F5"],
        white: ["D6", "E6", "F6", "D4", "E4", "F4", "C5"],
      });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({ type: "place", at: at("G5") });
    },
  );

  /** 백이 쉰 뒤 흑 차례인 판 */
  function afterWhitePass(black: string[], white: string[]) {
    const state = createBadukScenario({ black, white, me: 2 });
    const r = step(state, 0, { type: "pass" });
    if (!r.ok) throw new Error(r.error);
    return viewOf(r.state, 1);
  }
  const column = (c: string) =>
    Array.from({ length: 9 }, (_, i) => `${c}${i + 1}`);

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 상대가 쉬었고 지금 세면 이기면 따라 쉰다",
    (_name, bot) => {
      const view = afterWhitePass(column("E"), column("G"));
      expect(bot.decide(view, createRng(1))).toEqual({ type: "pass" });
    },
  );

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 상대가 쉬었어도 지금 세면 지면 더 둔다",
    (_name, bot) => {
      const view = afterWhitePass(column("C"), column("E"));
      expect(bot.decide(view, createRng(1)).type).toBe("place");
    },
  );

  it("같은 시드면 같은 수를 둔다", () => {
    // 고수와 같은 탐색이다. 같은 시드면 같은 수라는 성질은 둬 보는 횟수와 상관없어 400번으로 본다
    const bot = createBadukSearchBot(400);
    const state = createBadukScenario({ black: ["E5"], white: ["D4"] });
    const a = bot.decide(viewOf(state, 0), createRng(7));
    const b = bot.decide(viewOf(state, 0), createRng(7));
    expect(a).toEqual(b);
  });

  it("판 끝에는 다음 판을 누른다", () => {
    const state = createBadukScenario({ black: [], white: [] });
    const r = step(state, 0, { type: "resign" });
    if (!r.ok) throw new Error(r.error);
    const ended = { ...r.state, phase: "roundEnd" as const };
    expect(badukExpertBot.decide(viewOf(ended, 1), createRng(1))).toEqual({
      type: "continue",
    });
  });

  it("단계 번호로 컴퓨터를 고른다", () => {
    expect(badukBotFor(0)).toBe(badukBeginnerBot);
    expect(badukBotFor(1)).toBe(badukIntermediateBot);
    expect(badukBotFor(2)).toBe(badukExpertBot);
  });
});
