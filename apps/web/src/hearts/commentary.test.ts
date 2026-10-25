import { heartsNormalBot } from "@mighty/hearts-ai";
import {
  createMatch,
  type MatchState,
  step,
  viewOf,
  WINDOWS_RULES,
} from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import { explainHearts } from "./commentary";

const name = (seat: number) => `P${seat}`;

/** 실제 판을 중수 봇으로 두어 조건이 맞을 때까지 간다 */
function playUntil(done: (state: MatchState) => boolean): MatchState {
  let state = createMatch({ rules: WINDOWS_RULES, seed: 3 }).state;
  for (let guard = 0; guard < 400 && !done(state); guard++) {
    const seat = [0, 1, 2, 3].find((s) => viewOf(state, s).decision) ?? 0;
    const result = step(
      state,
      seat,
      heartsNormalBot.decide(viewOf(state, seat), { seed: guard }),
    );
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe("하트 다시 보기 해설", () => {
  it("넘기기 단계는 방향과 넘길 카드 요령을 말한다", () => {
    const state = playUntil(() => true);
    const action = heartsNormalBot.decide(viewOf(state, 0), { seed: 1 });
    const c = explainHearts(state, { seat: 0, action }, null, 1, name);
    expect(c.situation[0]).toContain("넘기기 단계");
    expect(c.verdict).toBeNull();
  });

  it("카드 내기: 카드마다 평균 점수를 견주고, 턴이 끝나면 누가 먹었는지 말한다", () => {
    const state = playUntil(
      (s) =>
        s.round.phase === "play" &&
        s.round.trickIndex === 3 &&
        (s.round.trick?.plays.length ?? 0) === 3,
    );
    const seat = state.round.turn as number;
    const action = heartsNormalBot.decide(viewOf(state, seat), { seed: 1 });
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(result.error);
    const c = explainHearts(state, { seat, action }, result.state, 1, name);
    expect(c.situation[0]).toContain("4/13턴");
    expect(c.reasons.join(" ")).toContain("이 턴은");
  });
});
