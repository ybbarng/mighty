import { gostopIntermediateBot } from "@mighty/gostop-ai";
import {
  createGostopScenario,
  type GameEvent,
  GOSTOP3_RULES,
  MATGO_RULES,
} from "@mighty/gostop-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";
import type { RoundRecord } from "@/stats/records";

import { gostopCues } from "./cues";
import {
  explainGostop,
  type GostopRound,
  gostopKit,
  summarizeGostop,
} from "./kit";

describe("고스톱 게임 키트", () => {
  it("규칙 문자열은 g1-로 시작하고 되돌아오며, 엉터리는 거절한다", () => {
    for (const rules of [MATGO_RULES, { ...GOSTOP3_RULES, rounds: 10 }]) {
      const code = gostopKit.encodeRules(rules);
      expect(code.startsWith("g1-")).toBe(true);
      expect(gostopKit.decodeRules(code)).toEqual({ ok: true, rules });
    }
    for (const bad of ["", "g1-", "g1-9b3", "h1-cobxf3-100", "g1-2b3;"])
      expect(gostopKit.decodeRules(bad).ok).toBe(false);
    expect(gostopKit.playerCount({ ...GOSTOP3_RULES })).toBe(3);
  });

  it("참가자는 그만두기를 보낼 수 없다", () => {
    expect(gostopKit.guestMayAct?.({ type: "retire" })).toBe(false);
    expect(gostopKit.guestMayAct?.({ type: "stop" })).toBe(true);
  });

  it("혼자 하기: 컴퓨터와 끝까지 치면 판·게임 기록이 나오고, 기록으로 다시 돌리면 같다", () => {
    const rules = { ...GOSTOP3_RULES, rounds: 2 };
    const match = new LocalMatch({
      kit: gostopKit,
      rules,
      seed: 42,
      humanSeat: 0,
      bot: gostopIntermediateBot,
    });
    const events: GameEvent[] = [];
    match.subscribe((s) => events.push(...s.events));
    for (let i = 0; i < 500 && match.current().phase !== "gameOver"; i++) {
      const view = match.current();
      if (view.decision)
        match.submit(gostopIntermediateBot.decide(view, { seed: i }));
    }
    const end = match.current();
    expect(end.phase).toBe("gameOver");
    const saved = match.save();
    const again = gostopKit.replay(rules, 42, saved.log);
    expect(again.ok && gostopKit.viewOf(again.state, 0)).toEqual(end);

    const round = gostopKit.stats.round(null, end, events) as GostopRound;
    expect(["win", "loss", "nagari"]).toContain(round.outcome);
    const game = gostopKit.stats.game(end, events) as {
      rounds: number;
      money: number;
    };
    expect(game.rounds).toBe(2);
    expect(game.money).toBe(end.scores[0]);
  });

  it("지표: 이긴 판·나가리·박을 센다", () => {
    const rec = (data: GostopRound): RoundRecord =>
      ({
        game: "gostop",
        mode: "solo",
        key: "k",
        at: 0,
        round: 1,
        data,
      }) as unknown as RoundRecord;
    const s = summarizeGostop([
      rec({
        players: 2,
        outcome: "win",
        points: 9,
        kind: "stop",
        goCount: 1,
        baks: [],
      }),
      rec({
        players: 2,
        outcome: "loss",
        points: -14,
        kind: "stop",
        goCount: 0,
        baks: ["pi", "gwang"],
      }),
      rec({
        players: 2,
        outcome: "nagari",
        points: 0,
        kind: "nagari",
        goCount: 0,
        baks: [],
      }),
    ]);
    expect(s).toMatchObject({
      rounds: 3,
      wins: 1,
      losses: 1,
      nagari: 1,
      best: 9,
      went: { n: 1, won: 1 },
      baks: { pi: 1, gwang: 1, meong: 0, go: 0 },
      recent: [1, -1, 0],
    });
  });

  it("해설: 고도리를 채우는 수는 고수와 같다고 한다", () => {
    const state = createGostopScenario({
      rules: { ...MATGO_RULES, rounds: 1 },
      hands: [
        ["08p", "05p", "06q"],
        ["10p", "10q", "11p"],
      ],
      floor: ["08a", "05q", "06p"],
      deck: ["09p", "12r", "12a", "09q", "04q", "03q"],
      captured: [["02a", "04a"], []],
    });
    const name = (seat: number) => (seat === 0 ? "나" : "상대");
    const good = explainGostop(
      state,
      { seat: 0, action: { type: "play", card: "08p" } },
      null,
      1,
      name,
    );
    expect(good.verdict).toBe("good");
    const bad = explainGostop(
      state,
      { seat: 0, action: { type: "play", card: "06q" } },
      null,
      1,
      name,
    );
    expect(bad.verdict === "slip" || bad.verdict === "bad").toBe(true);
  });

  it("소리: 먹기·뻑·피 뺏김·판 끝", () => {
    const settlement = {
      kind: "stop",
      winner: 0,
      deltas: [5, -5],
    } as never;
    expect(
      gostopCues(
        [
          { type: "played", seat: 1, card: "01g" },
          { type: "flipped", seat: 1, card: "01p" },
          { type: "special", seat: 1, kind: "ppeok" },
          { type: "stolen", from: 0, to: 1, card: "02p" },
        ],
        0,
      ),
    ).toEqual(["hwatuSlap", "hwatuFlip", "dealMiss", "penalty"]);
    expect(
      gostopCues(
        [
          { type: "captured", seat: 0, cards: ["01g", "01p"] },
          { type: "roundEnded", settlement, scores: [5, -5] },
        ],
        0,
      ),
    ).toEqual(["capture", "win"]);
  });
});
