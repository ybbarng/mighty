import { heuristicBot } from "@mighty/ai";
import {
  type Card,
  createMatch,
  fullDeck,
  presetRules,
  step,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { explainMighty } from "./mighty-commentary";

const rules = presetRules("standard5");
const name = (seat: number) => `P${seat}`;

/** 공약 단계: 마이티·조커·높은 기루다 없는 패를 3번 자리(선)가 받았다 */
function weakElection() {
  const hand: Card[] = [
    "H5",
    "D4",
    "D6",
    "SQ",
    "D9",
    "D3",
    "SK",
    "H6",
    "C10",
    "S9",
  ];
  const rest = fullDeck().filter((c) => !hand.includes(c));
  const hands = [
    rest.slice(0, 10),
    rest.slice(10, 20),
    rest.slice(20, 30),
    hand,
    rest.slice(30, 40),
  ];
  return createMatch({
    rules,
    seed: 1,
    firstBeginner: 3,
    presetDeal: { hands, kitty: rest.slice(40) },
  }).state;
}

describe("마이티 다시 보기 해설", () => {
  it("가망 없는 패로 출마하면 나쁜 수, 포기하면 좋은 수", () => {
    const state = weakElection();
    const bid = explainMighty(
      state,
      { seat: 3, action: { type: "bid", goal: { kiruda: "D", score: 13 } } },
      null,
      1,
      name,
    );
    expect(bid.verdict).toBe("bad");
    expect(bid.situation.join(" ")).toContain("공약 단계");
    expect(bid.reasons.join(" ")).toContain("출마할 패가 아니다");
    const pass = explainMighty(
      state,
      { seat: 3, action: { type: "pass" } },
      null,
      1,
      name,
    );
    expect(pass.verdict).toBe("good");
  });

  it("카드 내기: 수마다 평균 돈을 견주고, 턴이 끝나면 누가 먹었는지 말한다", () => {
    // 실제 판을 중수 봇으로 두어 세 번째 턴의 마지막 카드 직전까지 간다.
    let state = createMatch({ rules, seed: 7 }).state;
    for (let guard = 0; guard < 400; guard++) {
      const round = state.round;
      if (
        round.phase === "play" &&
        round.trickIndex === 2 &&
        (round.trick?.plays.length ?? 0) === rules.playerCount - 1
      )
        break;
      const seat = state.order.find((s) => viewOf(state, s).decision) ?? 0;
      const result = step(
        state,
        seat,
        heuristicBot.decide(viewOf(state, seat), { seed: guard }),
      );
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const seat = state.round.turn as number;
    const action = heuristicBot.decide(viewOf(state, seat), { seed: 1 });
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(result.error);
    const c = explainMighty(state, { seat, action }, result.state, 1, name);
    expect(c.situation[0]).toContain("3턴");
    expect(c.reasons.join(" ")).toContain("이 턴은");
    if (viewOf(state, seat).decision?.kind === "play") {
      const choices = (viewOf(state, seat).decision as { cards: Card[] }).cards;
      if (choices.length > 1) {
        expect(c.verdict).not.toBeNull();
        expect(c.reasons.join(" ")).toContain("평균 돈");
      }
    }
  });
});
