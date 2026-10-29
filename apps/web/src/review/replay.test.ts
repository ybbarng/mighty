// @vitest-environment node
import { heuristicBot } from "@mighty/ai";
import { type MatchState, mightyOf, presetRules } from "@mighty/engine";
import { heartsNormalBot } from "@mighty/hearts-ai";
import {
  type MatchState as HeartsState,
  WINDOWS_RULES,
} from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";
import { mightyKit } from "@/game/mighty-kit";
import { heartsKit } from "@/hearts/kit";

import type { GameArchive } from "./archive";
import { replayArchive } from "./replay";
import { roundSpans } from "./rounds";

function archiveOf(
  game: string,
  saved: { rules: unknown; seed: number; log: GameArchive["log"] },
  deals?: Record<number, unknown>,
): GameArchive {
  return {
    id: `solo:${saved.seed}`,
    game,
    mode: "solo",
    startedAt: 0,
    updatedAt: 0,
    rules: saved.rules,
    seed: saved.seed,
    ...(deals ? { deals } : {}),
    log: saved.log,
    seat: 0,
    seatNames: null,
    rounds: 0,
    over: false,
  };
}

/** 혼자 두는 마이티를 사람 자리도 봇처럼 판 n개 둔다 */
function playMighty(rounds: number) {
  const match = new LocalMatch({
    rules: presetRules("standard5"),
    seed: 41,
    bot: heuristicBot,
  });
  for (let i = 0; i < 5000; i++) {
    const view = match.current();
    if (!view.decision) break;
    if (view.roundNumber > rounds) break;
    match.submit(heuristicBot.decide(view, { seed: i }));
  }
  return match;
}

describe("복기: 남긴 기록을 다시 돌린다", () => {
  it("마이티: 혼자 둔 대국을 다시 돌리면 같은 상태가 나오고, 판마다 처음과 끝을 찾는다", () => {
    const match = playMighty(3);
    const saved = match.save();
    const replayed = replayArchive(mightyKit, archiveOf("mighty", saved));
    expect(replayed.error).toBeNull();
    expect(replayed.states.length).toBe(saved.log.length + 1);
    expect(replayed.states.at(-1)).toEqual(match.rawState());
    const spans = roundSpans(
      replayed.events,
      (i) => (replayed.states[i] as MatchState).roundNumber,
    );
    expect(spans.filter((s) => s.end !== null).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("마이티: 판마다 실제 패를 넣어 돌리면(멘탈 포커 판) 시드가 달라도 같은 판이 나온다", () => {
    const match = playMighty(2);
    const saved = match.save();
    const plain = replayArchive(mightyKit, archiveOf("mighty", saved));
    // 판을 시작한 상태에서 나눈 패를 꺼내 판 패로 남긴다.
    const deals: Record<number, unknown> = {};
    for (const [i, events] of plain.events.entries())
      if (events.some((e) => e.type === "dealt")) {
        const s = plain.states[i] as MatchState;
        deals[s.roundNumber] = {
          deal: { hands: s.round.hands, kitty: s.round.deck },
        };
      }
    const withDeals = replayArchive(
      mightyKit,
      archiveOf("mighty", { ...saved, seed: 999 }, deals),
    );
    expect(withDeals.error).toBeNull();
    const last = withDeals.states.at(-1) as MatchState;
    const real = match.rawState();
    expect(last.round.tricks).toEqual(real.round.tricks);
    expect(last.money).toEqual(real.money);
  });

  it("하트: 혼자 둔 대국을 다시 돌리면 같은 상태가 나온다", () => {
    const match = new LocalMatch({
      kit: heartsKit,
      rules: { ...WINDOWS_RULES, endScore: 30 },
      seed: 3,
      bot: heartsNormalBot,
    });
    for (let i = 0; i < 3000; i++) {
      const view = match.current();
      if (!view.decision) break;
      match.submit(heartsNormalBot.decide(view, { seed: i }));
    }
    const saved = match.save();
    const replayed = replayArchive(heartsKit, archiveOf("hearts", saved));
    expect(replayed.error).toBeNull();
    expect(replayed.states.at(-1)).toEqual(match.rawState());
    expect((replayed.states.at(-1) as HeartsState).round.phase).toBe(
      "gameOver",
    );
  });

  it("상황판: 떨어졌다고 한 무늬는 그 순간 그 자리 손에 정말 없고, 점수 카드는 20장을 넘지 않는다", () => {
    const match = playMighty(3);
    const replayed = replayArchive(
      mightyKit,
      archiveOf("mighty", match.save()),
    );
    const symbol: Record<string, string> = { S: "♠", H: "♥", D: "◆", C: "♣" };
    let checked = 0;
    for (const state of replayed.states as MatchState[]) {
      const { voids, tally } = mightyKit.review.situation(state);
      for (const [seat, list] of voids.entries())
        for (const v of list) {
          const hand = state.round.hands[seat] ?? [];
          // 마이티는 무늬를 따르지 않아도 되므로 손에 남아 있을 수 있다.
          const mighty = state.round.goal
            ? mightyOf(state.rules, state.round.goal.kiruda)
            : null;
          expect(
            hand.some((c) => c !== mighty && symbol[c[0] as string] === v),
          ).toBe(false);
          checked++;
        }
      const cards = tally
        .filter((t) => t.label.endsWith("점수 카드"))
        .reduce((n, t) => n + Number.parseInt(t.value, 10), 0);
      expect(cards).toBeLessThanOrEqual(20);
    }
    expect(checked).toBeGreaterThan(0);
    expect(mightyKit.review.describe({ type: "pass" })).toBe("포기");
  });
});
