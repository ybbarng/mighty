import { heuristicBot } from "@mighty/ai";
import { presetRules } from "@mighty/engine";
import { heartsNormalBot } from "@mighty/hearts-ai";
import { WINDOWS_RULES } from "@mighty/hearts-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";
import { mightyKit } from "@/game/mighty-kit";
import { summarizeMighty } from "@/game/mighty-stats";
import { heartsKit } from "@/hearts/kit";
import { summarizeHearts } from "@/hearts/stats";

import { StatsRecorder } from "./recorder";
import { addRound, importStats, loadStats } from "./records";

beforeEach(() => localStorage.clear());

describe("내 기록", () => {
  it("마이티: 혼자 두는 대국의 판마다 내 역할·승패·번 돈을 남기고, 지표가 기록과 맞는다", () => {
    const match = new LocalMatch({
      rules: presetRules("standard5"),
      seed: 31,
      bot: heuristicBot,
    });
    const recorder = new StatsRecorder(mightyKit.stats, {
      game: "mighty",
      mode: "solo",
      key: "solo:31",
    });
    const startMoney = match.current().money[0] ?? 0;
    for (const s of match.drain()) recorder.observe(s);
    match.subscribe((s) => recorder.observe(s));
    for (let i = 0; i < 3000 && loadStats().rounds.length < 4; i++) {
      const view = match.current();
      if (!view.decision) break;
      match.submit(heuristicBot.decide(view, { seed: i }));
    }
    const { rounds, games } = loadStats();
    expect(rounds.length).toBe(4);
    expect(rounds.every((r) => !r.partial && r.mode === "solo")).toBe(true);
    const summary = summarizeMighty(rounds, games);
    const roles = Object.values(summary.byRole);
    expect(roles.reduce((n, r) => n + r.n, 0)).toBe(summary.overall.n);
    // 판마다 번 돈을 더하면 지금 내 돈에서 처음 돈을 뺀 것과 같다.
    expect(summary.money).toBe((match.current().money[0] ?? 0) - startMoney);
    expect(summary.recent.length).toBe(4);
    const c = summary.counts;
    expect(c.rounds).toBe(4);
    expect(c.won + c.lost + c.out).toBe(4);
    expect(c.declarer + c.friend + c.opposition).toBe(c.won + c.lost);
    expect(c.jokerCallHits).toBeLessThanOrEqual(c.jokerCalls);
  });

  it("마이티: 조커콜 턴마다 조커가 누구에게서 끌려 나왔고 어느 편이 먹었는지 남긴다", () => {
    // 5마, 나는 0번(야당), 주공 1번·프렌드 2번. 내가 조커콜로 선을 잡고 2번이 조커를 냈다.
    const match = new LocalMatch({
      rules: presetRules("standard5"),
      seed: 31,
      bot: heuristicBot,
    });
    const view = match.current();
    const end = {
      ...view,
      declarer: 1,
      friend: 2,
      goal: { kiruda: "S" as const, score: 14 },
      friendDeclaration: { kind: "card" as const, card: "SA" as const },
      result: {
        rulingWon: false,
        rulingPoints: 12,
        oppositionPoints: 8,
        base: 2,
        staticRun: false,
        multipliers: [],
        moved: 2,
        money: view.money,
      },
    };
    const played = (seat: number, card: string, jokerCall = false) => ({
      type: "played" as const,
      seat,
      card: card as never,
      jokerSuit: null,
      jokerCall,
      slot: null,
    });
    const data = mightyKit.stats.round(null, end, [
      played(0, "C3", true),
      played(1, "C5"),
      played(2, "JK"),
      played(3, "C9"),
      played(4, "CK"),
      { type: "trickWon", seat: 2, trickIndex: 3, points: 1 },
    ]) as { calls: unknown[] };
    expect(data.calls).toEqual([
      { trick: 3, from: 2, fromSide: "ruling", won: false, points: 1 },
    ]);
  });

  it("하트: 판 점수와 게임 결과를 남긴다", () => {
    const match = new LocalMatch({
      kit: heartsKit,
      rules: { ...WINDOWS_RULES, endScore: 30 },
      seed: 5,
      bot: heartsNormalBot,
    });
    const recorder = new StatsRecorder(heartsKit.stats, {
      game: "hearts",
      mode: "solo",
      key: "solo:5",
    });
    for (const s of match.drain()) recorder.observe(s);
    match.subscribe((s) => recorder.observe(s));
    for (let i = 0; i < 5000 && loadStats().games.length === 0; i++) {
      const view = match.current();
      if (!view.decision) break;
      match.submit(heartsNormalBot.decide(view, { seed: i }));
    }
    const { rounds, games } = loadStats();
    expect(games.length).toBe(1);
    const summary = summarizeHearts(rounds, games);
    expect(summary.rounds).toBe(rounds.length);
    expect(summary.games).toBe(1);
    expect(rounds.at(-1)?.data).toMatchObject({
      total: match.current().scores[0],
    });
  });

  it("같은 판은 한 번만 남기고, 내보낸 기록을 가져오면 합친다", () => {
    const round = {
      id: "solo:1:1",
      game: "mighty",
      at: 1,
      mode: "solo" as const,
      data: {},
    };
    addRound(round);
    addRound(round);
    expect(loadStats().rounds.length).toBe(1);
    const exported = JSON.stringify({
      ...loadStats(),
      rounds: [round, { ...round, id: "solo:1:2", at: 2 }],
    });
    expect(importStats(exported)).toBe(2);
    expect(importStats("not json")).toBeNull();
  });
});
