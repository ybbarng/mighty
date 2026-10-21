import { createRng } from "@mighty/engine";
import {
  createMatch,
  pendingSeats,
  step,
  viewOf,
  WINDOWS_RULES,
} from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import type { HeartsBot } from "./knowledge";
import {
  createHeartsRuleBot,
  heartsBeginnerBot,
  heartsNormalBot,
  plainHeartsBot,
} from "./rule-bot";
import { createHeartsSearchBot, sampleHeartsHands } from "./search-bot";
import { simulateHearts } from "./simulate";

const rules = WINDOWS_RULES;

describe("하트 봇", () => {
  it.each([
    ["기준", plainHeartsBot],
    ["입문", heartsBeginnerBot],
    ["중수", heartsNormalBot],
    ["고수", createHeartsSearchBot({ worlds: 3 })],
  ] as [string, HeartsBot][])("%s 봇끼리 게임을 끝까지 둔다", (_name, bot) => {
    const result = simulateHearts({
      rules,
      seed: 5,
      bots: [bot, bot, bot, bot],
      rounds: bot.name === "hearts-search" ? 1 : 50,
    });
    expect(result.rounds).toBeGreaterThan(0);
  });

  it("중수는 ♠가 짧으면 ♠Q를 넘긴다", () => {
    const { state } = createMatch({
      rules,
      seed: 1,
      presetHands: [
        [
          "SQ",
          "S3",
          "C2",
          "C5",
          "C9",
          "D4",
          "D7",
          "D9",
          "H2",
          "H4",
          "H6",
          "H8",
          "H9",
        ],
        [
          "SA",
          "SK",
          "SJ",
          "S10",
          "S9",
          "S8",
          "S7",
          "S6",
          "S5",
          "S4",
          "S2",
          "CA",
          "CK",
        ],
        [
          "CQ",
          "CJ",
          "C10",
          "C8",
          "C7",
          "C6",
          "C4",
          "C3",
          "DA",
          "DK",
          "DQ",
          "DJ",
          "D10",
        ],
        [
          "D8",
          "D6",
          "D5",
          "D3",
          "D2",
          "HA",
          "HK",
          "HQ",
          "HJ",
          "H10",
          "H7",
          "H5",
          "H3",
        ],
      ],
    });
    const action = heartsNormalBot.decide(viewOf(state, 0), createRng(1));
    expect(action.type).toBe("pass");
    if (action.type === "pass") expect(action.cards).toContain("SQ");
  });

  it("남의 손패 추측은 내가 넘겨준 카드를 받은 사람에게 둔다", () => {
    let { state } = createMatch({ rules, seed: 9 });
    const mine = state.round.hands[0]?.slice(0, 3) ?? [];
    for (let s = 0; s < 4; s++) {
      const r = step(state, s, {
        type: "pass",
        cards: s === 0 ? mine : (state.round.hands[s]?.slice(0, 3) ?? []),
      });
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const view = viewOf(state, 0);
    for (let i = 0; i < 20; i++) {
      const hands = sampleHeartsHands(view, createRng(i));
      expect(hands).not.toBeNull();
      for (const c of mine) expect(hands?.[1]).toContain(c);
      expect(hands?.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    }
  });

  it("고르는 행동은 늘 엔진이 받아 준다", () => {
    const bot = createHeartsRuleBot({ book: ["duck", "dump"], mistakes: 0.5 });
    let { state } = createMatch({ rules, seed: 21 });
    const rng = createRng(3);
    for (let i = 0; i < 2000 && state.round.phase !== "gameOver"; i++) {
      const seat = pendingSeats(state)[0] as number;
      const r = step(state, seat, bot.decide(viewOf(state, seat), rng));
      expect(r.ok).toBe(true);
      if (!r.ok) break;
      state = r.state;
    }
  });
});
