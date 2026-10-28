import { minhwatuBeginnerBot, playGame } from "@mighty/minhwatu-ai";
import {
  createMatch,
  type GameEvent,
  STANDARD_RULES,
  step,
  viewOf,
} from "@mighty/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuCues } from "./cues";
import { describeAction, minhwatuKit } from "./kit";
import { minhwatuStats, summarizeMinhwatu } from "./stats";

describe("민화투 키트", () => {
  it("규칙 문자열이 되돌아오고 깨진 것은 거절한다", () => {
    const code = minhwatuKit.encodeRules(STANDARD_RULES);
    expect(code.startsWith("m1-")).toBe(true);
    expect(minhwatuKit.decodeRules(code)).toEqual({
      ok: true,
      rules: STANDARD_RULES,
    });
    expect(minhwatuKit.decodeRules("m1-garbage").ok).toBe(false);
    expect(minhwatuKit.playerCount({ ...STANDARD_RULES, players: 4 })).toBe(4);
  });

  it("참가자는 끝내기를 보낼 수 없다", () => {
    expect(minhwatuKit.guestMayAct?.({ type: "retire" })).toBe(false);
    expect(minhwatuKit.guestMayAct?.({ type: "continue" })).toBe(true);
  });

  it("시작 이벤트는 엔진이 만드는 것과 같다", () => {
    const created = createMatch(STANDARD_RULES, 9);
    expect(minhwatuKit.startEvents(viewOf(created.state, 1))).toEqual(
      created.events,
    );
  });

  it("행동을 한 줄로 설명한다", () => {
    expect(describeAction({ type: "play", card: "03g" })).toBe("벚꽃 광");
    expect(describeAction({ type: "play", card: "08g", target: "08a" })).toBe(
      "공산 광 → 공산 기러기",
    );
    expect(describeAction({ type: "continue" })).toBe("다음 판");
  });
});

describe("민화투 소리", () => {
  it("먹으면 잡기, 못 먹으면 패 치기·뒤집기(조금 뒤에)", () => {
    const events: GameEvent[] = [
      { type: "played", seat: 0, card: "03g", took: ["03g", "03p"] },
      { type: "flipped", seat: 0, card: "05p", took: [] },
      { type: "yak", seat: 1, yak: "hongdan", value: 30 },
    ];
    expect(minhwatuCues(events, 0)).toEqual([
      { cue: "capture", delay: 0 },
      { cue: "hwatuFlip", delay: 0.35 },
      { cue: "penalty", delay: expect.closeTo(0.65) },
    ]);
  });

  it("마지막 판이면 판 끝 소리 없이 이김·짐만 낸다", () => {
    const end = playGame(
      [minhwatuBeginnerBot, minhwatuBeginnerBot, minhwatuBeginnerBot],
      { ...STANDARD_RULES, rounds: 1 },
      4,
    );
    const winners = end.totals.flatMap((t, s) =>
      t === Math.max(...end.totals) ? [s] : [],
    );
    const result = end.result;
    if (!result) throw new Error("결과가 없다");
    const cues = minhwatuCues(
      [
        { type: "roundEnded", result, totals: end.totals },
        { type: "gameEnded", totals: end.totals, winners },
      ],
      winners[0] as number,
    ).map((c) => c.cue);
    expect(cues).toEqual(["win"]);
  });
});

describe("민화투 기록", () => {
  it("판·게임 기록을 남기고 요약한다", () => {
    let { state, events: all } = createMatch(
      { ...STANDARD_RULES, rounds: 1 },
      21,
    );
    const rng = { seed: 5 };
    while (state.phase !== "gameOver") {
      const seat = minhwatuKit.pendingSeats(state)[0] as number;
      const r = step(
        state,
        seat,
        minhwatuBeginnerBot.decide(viewOf(state, seat), rng),
      );
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      all = [...all, ...r.events];
    }
    const view = viewOf(state, 0);
    expect(minhwatuStats.roundEnded(all)).toBe(true);
    const round = minhwatuStats.round(null, view, all);
    const game = minhwatuStats.game(view, all) as { total: number };
    expect(round).toMatchObject({
      players: 3,
      score: state.totals[0],
    });
    expect(game.total).toBe(state.totals[0]);
    const summary = summarizeMinhwatu(
      [
        {
          id: "r",
          game: "minhwatu",
          at: 0,
          mode: "solo",
          data: round,
        },
      ],
      [{ id: "g", game: "minhwatu", at: 0, mode: "solo", data: game }],
    );
    expect(summary.rounds).toBe(1);
    expect(summary.games).toBe(1);
    expect(summary.average).toBe(state.totals[0]);
  });
});
